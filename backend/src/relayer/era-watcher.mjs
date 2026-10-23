import { getApi } from '../chain/substrate.mjs';
import { getRelayerSigner, getOracleContract } from '../chain/evm.mjs';
import { readStakingSnapshot } from './snapshot.mjs';

const POLL_MS    = 30_000; // 30 s — era is ~6 h but we poll quickly to catch the flip
const MAX_RETRY  = 3;
const RETRY_MS   = 10_000;

// Revive's eth_estimateGas returns Substrate weight (not EVM gas).
// We pass it directly as gasLimit — the chain expects this exact value.
async function publishWithGas(oracle, snap) {
  const provider = oracle.runner?.provider ?? oracle.provider;

  // Build calldata so we can estimate gas for this specific call
  const calldata = oracle.interface.encodeFunctionData(
    'publish',
    [snap.era, snap.totalStake, snap.eraReward, snap.ids,
     snap.infos.map(i => [i.totalStake, i.commissionBps, i.uptimeBps, i.active])]
  );

  const gasLimit = await provider.estimateGas({
    from:  await oracle.runner.getAddress(),
    to:    await oracle.getAddress(),
    data:  calldata,
  });

  return oracle.publish(
    snap.era, snap.totalStake, snap.eraReward, snap.ids,
    snap.infos.map(i => [i.totalStake, i.commissionBps, i.uptimeBps, i.active]),
    { gasLimit }
  );
}

async function withRetry(label, fn) {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const last = attempt === MAX_RETRY;
      console.error(`[relayer] ${label} attempt ${attempt}/${MAX_RETRY} failed: ${err.message}`);
      if (last) throw err;
      await new Promise(r => setTimeout(r, RETRY_MS));
    }
  }
}

export async function runRelayer() {
  const api    = await getApi();
  const signer = getRelayerSigner();
  const oracle = getOracleContract(signer);

  let lastRelayedEra = 0;
  try {
    lastRelayedEra = Number(await oracle.latestEra());
  } catch (e) {
    console.warn('[relayer] could not read oracle latest era (not yet published?):', e.message);
  }
  console.log(`[relayer] started  relayer=${signer.address}  oracle last era=${lastRelayedEra}`);

  const check = async () => {
    try {
      const activeEraOpt = await api.query.staking.activeEra();
      if (activeEraOpt.isNone) return;
      const currentEra = Number(activeEraOpt.unwrap().index);

      if (currentEra <= lastRelayedEra) {
        console.log(`[relayer] era ${currentEra} already relayed, waiting…`);
        return;
      }

      console.log(`[relayer] new era detected: ${currentEra}  (last relayed: ${lastRelayedEra})`);

      const snap = await withRetry('readSnapshot', () => readStakingSnapshot(currentEra));
      if (!snap || snap.ids.length === 0) {
        console.warn('[relayer] snapshot empty — no validators found, skipping publish');
        return;
      }

      console.log(`[relayer] publishing era ${snap.era}: ${snap.ids.length} validators  totalStake=${snap.totalStake}`);
      const tx = await withRetry('publish', () => publishWithGas(oracle, snap));
      console.log(`[relayer] tx sent  ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[relayer] confirmed block=${receipt.blockNumber}  gasUsed=${receipt.gasUsed}  era=${snap.era}`);
      lastRelayedEra = snap.era;
    } catch (err) {
      console.error('[relayer] check error:', err.message);
    }
  };

  await check();
  const timer = setInterval(check, POLL_MS);
  console.log(`[relayer] polling every ${POLL_MS / 1000}s`);
  return () => clearInterval(timer); // return teardown fn for tests
}
