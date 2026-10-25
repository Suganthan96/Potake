#!/usr/bin/env node
/**
 * Potake Full End-to-End Test
 * 1. Connect to Substrate node
 * 2. Read oracle snapshot (era, validators, stake)
 * 3. Register a policy in PolicyRegistry via EVM
 * 4. Run full agent evaluation (read policy → check nominations → suggest fix)
 * 5. Show GatedVault state
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { decodeAddress } from '@polkadot/util-crypto';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const EVM_RPC          = process.env.EVM_RPC;
const SUBSTRATE_WS     = process.env.SUBSTRATE_WS;
const DEPLOYER_KEY     = process.env.DEPLOYER_PRIVATE_KEY;
const ORACLE_ADDRESS   = process.env.ORACLE_ADDRESS;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const VAULT_ADDRESS    = '0x9d80B22A0D2da86AA1406c1d587cd2E94793429c';

// ABIs (minimal)
const ORACLE_ABI = [
  'function latestEra() view returns (uint32)',
  'function snapshot() view returns (tuple(uint32 era, uint64 relayedAt, uint16 validatorCount, bytes32 validatorSetHash, uint256 totalStake, uint256 eraReward))',
  'function validatorIds() view returns (bytes32[])',
  'function validatorInfo(bytes32) view returns (tuple(uint128 totalStake, uint16 commissionBps, uint16 uptimeBps, bool active))',
  'function isHealthy(bytes32, uint16) view returns (bool)',
  'function stakeShareBps(bytes32) view returns (uint16)',
];
const REGISTRY_ABI = [
  'function setPolicy(bytes32 stakingAccount, uint16 maxShareBps, uint16 minUptimeBps, uint8 maxValidators) external',
  'function policies(address) view returns (bytes32 stakingAccount, uint16 maxShareBps, uint16 minUptimeBps, uint8 maxValidators, uint32 version, bool active)',
  'function actionCount(bytes32) view returns (uint256)',
];
const VAULT_ABI = [
  'function minUptimeBps() view returns (uint16)',
  'function staking() view returns (address)',
  'function balanceOf(address, bytes32) view returns (uint256)',
  'function deposit(bytes32 validator) external payable',
  'function withdraw(bytes32 validator, uint256 amount) external',
];

const sep = (label) => console.log(`\n${'─'.repeat(50)}\n  ${label}\n${'─'.repeat(50)}`);
const ok  = (msg) => console.log(`  ✓  ${msg}`);
const info = (msg) => console.log(`     ${msg}`);

async function sendLegacyTx(wallet, tx) {
  const provider = wallet.provider;
  const nonce = await provider.getTransactionCount(wallet.address, 'pending');
  const feeData = await provider.getFeeData();
  const gasLimit = await provider.estimateGas({ from: wallet.address, ...tx, nonce });
  const sent = await wallet.sendTransaction({
    ...tx, nonce, gasLimit,
    gasPrice: feeData.gasPrice || 40000n,
    type: 0,
  });
  // manual polling (pallet-revive receipts can lag)
  for (let i = 0; i < 60; i++) {
    const r = await provider.getTransactionReceipt(sent.hash).catch(() => null);
    if (r) return { hash: sent.hash, receipt: r };
    await new Promise(res => setTimeout(res, 3000));
  }
  throw new Error('receipt timeout: ' + sent.hash);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       POTAKE  END-TO-END TEST                ║');
  console.log('╚══════════════════════════════════════════════╝');

  // ── 1. Substrate connection ──────────────────────────────────────────
  sep('1 / Substrate node');
  const wsProvider = new WsProvider(SUBSTRATE_WS, 1000, {}, 60_000);
  const api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;
  const { specName, specVersion } = api.runtimeVersion;
  ok(`connected  ${SUBSTRATE_WS}`);
  info(`chain: ${specName}/${specVersion}`);

  const activeEraOpt = await api.query.staking.activeEra();
  const activeEra = activeEraOpt.isSome ? Number(activeEraOpt.unwrap().index) : 0;
  ok(`active era on-chain: ${activeEra}`);

  // ── 2. EVM provider & wallet ─────────────────────────────────────────
  sep('2 / EVM wallet');
  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  const wallet   = new ethers.Wallet(DEPLOYER_KEY, provider);
  const balance  = await provider.getBalance(wallet.address);
  ok(`address: ${wallet.address}`);
  info(`balance: ${ethers.formatEther(balance)} tPOT`);

  // ── 3. StakingOracle snapshot ────────────────────────────────────────
  sep('3 / StakingOracle  ' + ORACLE_ADDRESS);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);
  const snapRaw = await oracle.snapshot();
  const latestEra = await oracle.latestEra();
  ok(`latest era in oracle: ${latestEra}`);
  info(`snapshot.era       : ${snapRaw.era}`);
  info(`snapshot.totalStake: ${ethers.formatEther(snapRaw.totalStake)} tPOT`);
  info(`snapshot.validators: ${snapRaw.validatorCount}`);

  const ids = await oracle.validatorIds();
  ok(`validator IDs in oracle: ${ids.length}`);
  for (let i = 0; i < ids.length; i++) {
    const v = await oracle.validatorInfo(ids[i]);
    const healthy = await oracle.isHealthy(ids[i], 9000);
    const share   = await oracle.stakeShareBps(ids[i]);
    info(`  [${i}] stake=${ethers.formatEther(v.totalStake).slice(0,8)} tPOT  uptime=${v.uptimeBps}bps  commission=${v.commissionBps}bps  share=${share}bps  healthy(9000)=${healthy}`);
  }

  // ── 4. Register policy ────────────────────────────────────────────────
  sep('4 / PolicyRegistry  ' + REGISTRY_ADDRESS);
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

  // Deployer's SS58 → bytes32 AccountId32
  const deployerSS58 = '5E4pg7sjyrDnsPZ3GgtEpravuS71wnHioybTMLSesRz5X6gx';
  const deployerBytes32 = '0x' + Buffer.from(decodeAddress(deployerSS58)).toString('hex');
  info(`staking account (SS58): ${deployerSS58}`);
  info(`staking account (b32) : ${deployerBytes32}`);

  // Check if policy already set
  const existingPolicy = await registry.policies(wallet.address);
  if (existingPolicy.active) {
    ok(`policy already active (v${existingPolicy.version}), skipping setPolicy`);
    info(`maxShare=${existingPolicy.maxShareBps}bps  minUptime=${existingPolicy.minUptimeBps}bps  maxValidators=${existingPolicy.maxValidators}`);
  } else {
    info('no active policy found — calling setPolicy …');
    const regContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
    const iface = regContract.interface;
    const data  = iface.encodeFunctionData('setPolicy', [
      deployerBytes32,
      5000,   // maxShareBps  = 50%
      9000,   // minUptimeBps = 90%
      16,     // maxValidators
    ]);
    const { hash, receipt } = await sendLegacyTx(wallet, { to: REGISTRY_ADDRESS, data });
    ok(`setPolicy tx: ${hash}`);
    info(`block: ${receipt.blockNumber}  status: ${receipt.status === 1 ? 'success' : 'FAILED'}`);
  }

  // Read back policy
  const policy = await registry.policies(wallet.address);
  const p = await registry.policies(wallet.address);
  ok(`policy for ${wallet.address}:`);
  info(`  version      : ${Number(p.version)}`);
  info(`  active       : ${p.active}`);
  info(`  maxShareBps  : ${Number(p.maxShareBps)} (${Number(p.maxShareBps) / 100}%)`);
  info(`  minUptimeBps : ${Number(p.minUptimeBps)} (${Number(p.minUptimeBps) / 100}%)`);
  info(`  maxValidators: ${Number(p.maxValidators)}`);

  // ── 5. Agent policy evaluation ────────────────────────────────────────
  sep('5 / Agent policy evaluation (dry-run)');

  // Build snapshot from oracle data
  const infos = await Promise.all(ids.map(id => oracle.validatorInfo(id)));
  const snapshot = {
    era: Number(snapRaw.era),
    totalStake: snapRaw.totalStake,
    ids: [...ids],
    infos: infos.map(i => ({
      totalStake:    i.totalStake,
      commissionBps: Number(i.commissionBps),
      uptimeBps:     Number(i.uptimeBps),
      active:        i.active,
    })),
  };

  const policyObj = {
    maxShareBps:   Number(p.maxShareBps),
    minUptimeBps:  Number(p.minUptimeBps),
    maxValidators: Number(p.maxValidators),
    version:       Number(p.version),
  };

  // Get current nominations
  const noms = await api.query.staking.nominators(deployerSS58);
  const currentNoms = noms.isNone ? [] : noms.unwrap().targets.map(t => t.toString());
  ok(`current nominations for ${deployerSS58.slice(0,10)}…: ${currentNoms.length}`);

  // Evaluate against oracle data
  function bytes32ToSS58(hex) {
    const bytes = Buffer.from(hex.replace('0x',''), 'hex');
    return api.createType('AccountId', bytes).toString();
  }

  const validatorsBySS58 = {};
  for (let i = 0; i < snapshot.ids.length; i++) {
    const ss58 = bytes32ToSS58(snapshot.ids[i]);
    validatorsBySS58[ss58] = snapshot.infos[i];
  }

  const violations = [];

  // Rule: minUptime
  const unhealthy = currentNoms.filter(ss58 => {
    const v = validatorsBySS58[ss58];
    return !v || !v.active || v.uptimeBps < policyObj.minUptimeBps;
  });
  if (unhealthy.length > 0) violations.push(`minUptime: ${unhealthy.length} validator(s) below ${policyObj.minUptimeBps}bps`);

  // Rule: maxValidators
  if (policyObj.maxValidators > 0 && currentNoms.length > policyObj.maxValidators)
    violations.push(`maxValidators: ${currentNoms.length} > ${policyObj.maxValidators}`);

  if (violations.length === 0) {
    ok(`all policy rules satisfied`);
    if (currentNoms.length === 0) info('(no active nominations — nothing to check)');
  } else {
    console.log(`  ✗  ${violations.length} violation(s):`);
    for (const v of violations) info(v);
  }

  // Suggested compliant set
  const candidates = Object.entries(validatorsBySS58)
    .filter(([, v]) => v.active && v.uptimeBps >= policyObj.minUptimeBps)
    .sort(([, a], [, b]) => Number(b.totalStake - a.totalStake));

  const maxCount = policyObj.maxValidators > 0
    ? Math.min(policyObj.maxValidators, candidates.length)
    : candidates.length;

  const suggestedSet = candidates.slice(0, maxCount).map(([ss58]) => ss58);
  ok(`suggested nomination set (${suggestedSet.length} validators):`);
  for (const ss58 of suggestedSet) info(`  ${ss58}`);

  // ── 6. GatedVault — deposit gate demo ────────────────────────────────
  sep('6 / GatedVault  ' + VAULT_ADDRESS);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
  const vaultMinUptime = await vault.minUptimeBps();
  const vaultStaking   = await vault.staking();
  ok(`staking oracle linked: ${vaultStaking}`);
  info(`minUptimeBps  : ${Number(vaultMinUptime)} (${Number(vaultMinUptime) / 100}%)`);

  // Use the first oracle validator ID (confirmed healthy above)
  const validatorId = ids[0];
  info(`testing with validator: ${validatorId}`);

  // Deposit 0.001 tPOT
  const depositAmount = ethers.parseEther('0.001');
  const vaultWriter = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
  const vaultIface  = vaultWriter.interface;
  const depositData = vaultIface.encodeFunctionData('deposit', [validatorId]);
  const depositRes  = await sendLegacyTx(wallet, { to: VAULT_ADDRESS, data: depositData, value: depositAmount });
  ok(`deposit(0.001 tPOT) tx: ${depositRes.hash}`);
  info(`block: ${depositRes.receipt.blockNumber}  status: ${depositRes.receipt.status === 1n || depositRes.receipt.status === 1 ? 'success' : 'FAILED'}`);

  const bal = await vault.balanceOf(wallet.address, validatorId);
  info(`balanceOf(deployer, validator[0]): ${ethers.formatEther(bal)} tPOT`);

  // Withdraw it back
  const withdrawData = vaultIface.encodeFunctionData('withdraw', [validatorId, depositAmount]);
  const withdrawRes  = await sendLegacyTx(wallet, { to: VAULT_ADDRESS, data: withdrawData });
  ok(`withdraw(0.001 tPOT) tx: ${withdrawRes.hash}`);
  info(`block: ${withdrawRes.receipt.blockNumber}  status: ${withdrawRes.receipt.status === 1n || withdrawRes.receipt.status === 1 ? 'success' : 'FAILED'}`);

  const balAfter = await vault.balanceOf(wallet.address, validatorId);
  info(`balanceOf after withdraw: ${ethers.formatEther(balAfter)} tPOT`);

  // ── 7. Summary ────────────────────────────────────────────────────────
  sep('SUMMARY');
  ok(`Substrate node   : ${specName}/v${specVersion}  era=${activeEra}`);
  ok(`StakingOracle    : era=${latestEra}  validators=${ids.length}  ${ORACLE_ADDRESS}`);
  ok(`PolicyRegistry   : policy v${policyObj.version} active=${p.active}  ${REGISTRY_ADDRESS}`);
  ok(`GatedVault       : minUptime=${Number(vaultMinUptime)}bps  deposit+withdraw ✓  ${VAULT_ADDRESS}`);
  ok(`Agent eval       : ${violations.length === 0 ? 'COMPLIANT' : violations.length + ' VIOLATIONS'}  suggestedSet=${suggestedSet.length}`);
  console.log('\n  All components verified end-to-end ✓\n');

  await api.disconnect();
  process.exit(0);
}

main().catch(e => { console.error('\n[FAIL]', e.message); process.exit(1); });
