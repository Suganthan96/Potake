// agent/index.mjs — Policy agent: evaluate nominations, fix violations, log actions.
// One pass per invocation (run from era-watcher or call directly).

import { Keyring }              from '@polkadot/keyring';
import { cryptoWaitReady }      from '@polkadot/util-crypto';
import { getApi }               from '../chain/substrate.mjs';
import { getProvider, getOracleContract, getRegistryContract } from '../chain/evm.mjs';
import { MANAGED_ACCOUNTS, STAKING_ACCOUNT_SS58, ORACLE_ADDRESS, REGISTRY_ADDRESS } from '../config.mjs';
import { evaluatePolicy, bytes32ToSS58 }   from './evaluate.mjs';
import { submitNominate, logAction }        from './nominate.mjs';

export async function runAgent({ keystorePath, password, dryRun = false } = {}) {
  if (!ORACLE_ADDRESS)   throw new Error('ORACLE_ADDRESS not set in .env');
  if (!REGISTRY_ADDRESS) throw new Error('REGISTRY_ADDRESS not set in .env');

  const api      = await getApi();
  const provider = getProvider();
  const oracle   = getOracleContract(provider);
  const registry = getRegistryContract(provider);

  // ── Load oracle snapshot ─────────────────────────────────────────────
  const snapRaw = await oracle.snapshot();
  if (Number(snapRaw.era) === 0) {
    console.log('[agent] oracle has no snapshot yet — relayer must publish first');
    return;
  }

  const era = Number(snapRaw.era);
  const ids    = await oracle.validatorIds();
  const infos  = await Promise.all(ids.map(id => oracle.validatorInfo(id)));
  const snapshot = {
    era,
    totalStake: snapRaw.totalStake,
    ids:   [...ids],
    infos: infos.map(i => ({
      totalStake:    i.totalStake,
      commissionBps: Number(i.commissionBps),
      uptimeBps:     Number(i.uptimeBps),
      active:        i.active,
    })),
  };
  console.log(`[agent] oracle era=${era}  validators=${ids.length}  totalStake=${snapshot.totalStake}`);

  // ── Load sr25519 keypair for signing nominate extrinsics ─────────────
  let pair = null;
  if (keystorePath) {
    await cryptoWaitReady();
    const { readFileSync } = await import('fs');
    const keyring  = new Keyring({ type: 'sr25519' });
    const keystore = JSON.parse(readFileSync(keystorePath, 'utf8'));
    pair = keyring.addFromJson(keystore);
    pair.decodePkcs8(password || '');
    console.log(`[agent] loaded keypair  ${pair.address}`);
  } else {
    console.log('[agent] no keystore provided — will evaluate only (dry-run)');
    dryRun = true;
  }

  // ── Process each managed account ─────────────────────────────────────
  const accounts = MANAGED_ACCOUNTS.length ? MANAGED_ACCOUNTS : (pair ? [pair.address] : []);
  if (accounts.length === 0) {
    console.log('[agent] no MANAGED_ACCOUNTS configured');
    return;
  }

  for (const accountSS58 of accounts) {
    console.log(`\n[agent] ── account: ${accountSS58}`);

    // Resolve the EVM address (H160) for this account to look up its policy
    let policyOwnerEVM;
    if (/^0x[0-9a-fA-F]{40}$/.test(accountSS58)) {
      // Already an EVM address — use directly
      policyOwnerEVM = accountSS58;
    } else {
      try {
        policyOwnerEVM = await api.call.reviveApi.address(accountSS58);
        policyOwnerEVM = policyOwnerEVM.toString();
      } catch {
        console.warn('[agent] reviveApi.address failed, skipping account');
        continue;
      }
    }
    console.log(`[agent] EVM policy owner: ${policyOwnerEVM}`);

    // Resolve the SS58 account used for Substrate staking operations
    // Priority: STAKING_ACCOUNT_SS58 env > policy.stakingAccount > skip
    let stakingAccountSS58 = STAKING_ACCOUNT_SS58 || null;

    // Read policy from registry
    let policy;
    try {
      const p = await registry.policies(policyOwnerEVM);
      if (!p.active) {
        console.log('[agent] no active policy for this account, skipping');
        continue;
      }
      policy = {
        stakingAccount: p.stakingAccount,
        maxShareBps:    Number(p.maxShareBps),
        minUptimeBps:   Number(p.minUptimeBps),
        maxValidators:  Number(p.maxValidators),
        version:        Number(p.version),
      };
      // If no env SS58, try to decode bytes32 stakingAccount → SS58
      if (!stakingAccountSS58) {
        try {
          stakingAccountSS58 = bytes32ToSS58(api, policy.stakingAccount);
        } catch {}
      }
      console.log(`[agent] policy v${policy.version}  maxShare=${policy.maxShareBps}bps  minUptime=${policy.minUptimeBps}bps  maxValidators=${policy.maxValidators}`);
      console.log(`[agent] staking SS58: ${stakingAccountSS58 || '(unknown — will skip nomination check)'}`);
    } catch (e) {
      console.warn(`[agent] could not read policy: ${e.message}`);
      continue;
    }

    // Evaluate — use SS58 for Substrate nominations lookup
    const substrateAccount = stakingAccountSS58 || accountSS58;
    const { violations, rule, currentNoms, suggestedSet } = await evaluatePolicy(policy, snapshot, substrateAccount);

    if (violations.length === 0) {
      console.log('[agent] ✓ all rules satisfied, no action needed');
      continue;
    }

    console.log(`[agent] ✗ ${violations.length} violation(s):`);
    for (const v of violations) console.log(`         ${v}`);
    console.log(`[agent] suggested set (${suggestedSet.length}): ${suggestedSet.slice(0, 3).map(s => s.slice(0,10)+'…').join(', ')}${suggestedSet.length > 3 ? ' …' : ''}`);

    if (dryRun) {
      console.log('[agent] dry-run mode — not submitting nominate');
      continue;
    }

    // Need the keypair for the managed account to sign
    if (!pair || pair.address !== accountSS58) {
      console.warn('[agent] loaded keypair does not match managed account, skipping nominate');
      continue;
    }

    // Convert suggested SS58 set to bytes32 for the log
    const toSetBytes32  = suggestedSet.map(ss58 => {
      const raw = api.createType('AccountId', ss58).toU8a();
      return '0x' + Buffer.from(raw).toString('hex');
    });
    const fromSetBytes32 = currentNoms.map(ss58 => {
      try {
        const raw = api.createType('AccountId', ss58).toU8a();
        return '0x' + Buffer.from(raw).toString('hex');
      } catch { return '0x' + '00'.repeat(32); }
    });

    // Submit nominate
    console.log(`[agent] submitting staking.nominate(${suggestedSet.length} targets)…`);
    let extHash;
    try {
      extHash = await submitNominate(pair, suggestedSet);
      console.log(`[agent] nominate finalized: ${extHash}`);
    } catch (e) {
      console.error(`[agent] nominate failed: ${e.message}`);
      continue;
    }

    // Log action in registry
    try {
      await logAction(policyOwnerEVM, era, policy.version, rule, extHash, fromSetBytes32, toSetBytes32);
    } catch (e) {
      console.warn(`[agent] logAction failed (non-fatal): ${e.message}`);
    }
  }

  console.log('\n[agent] run complete');
}
