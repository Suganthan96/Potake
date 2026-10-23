import { getApi } from '../chain/substrate.mjs';

// AccountId32 → 0x-prefixed 32-byte hex (bytes32 in Solidity)
function toBytes32(accountId) {
  const bytes = accountId.toU8a();
  return '0x' + Buffer.from(bytes.slice(0, 32)).toString('hex').padEnd(64, '0');
}

// Perbill (0–1_000_000_000 = 100%) → basis points (0–10_000)
function perbillToBps(perbill) {
  return Math.min(10_000, Math.round(Number(perbill.toString()) / 100_000));
}

export async function readStakingSnapshot(era) {
  const api = await getApi();
  const eraNum = Number(era);

  // --- collect active validator IDs for the era ---
  let validatorIds = [];

  try {
    // erasStakers.entries(era) → [[StorageKey([era, accountId]), Exposure]]
    const entries = await api.query.staking.erasStakers.entries(eraNum);
    validatorIds = entries.map(([key]) => key.args[1]);
    console.log(`[snapshot] erasStakers returned ${validatorIds.length} validators for era ${eraNum}`);
  } catch (e) {
    console.warn(`[snapshot] erasStakers.entries failed (${e.message}), falling back to session.validators`);
  }

  if (validatorIds.length === 0) {
    // Fallback: current session validators (may not match historical era exactly)
    try {
      const sv = await api.query.session.validators();
      validatorIds = sv.toArray ? sv.toArray() : [...sv];
      console.log(`[snapshot] session.validators returned ${validatorIds.length} validators`);
    } catch (e) {
      console.warn(`[snapshot] session.validators failed: ${e.message}`);
    }
  }

  if (validatorIds.length === 0) {
    console.warn(`[snapshot] no validators found for era ${eraNum}`);
    return null;
  }

  // Cap at MAX_VALIDATORS (64) as the oracle enforces
  const limited = validatorIds.slice(0, 64);

  const ids = [];
  const infos = [];
  let totalStake = 0n;

  for (const vid of limited) {
    const bytes32 = toBytes32(vid);

    let validatorStake = 0n;
    try {
      const exposure = await api.query.staking.erasStakers(eraNum, vid);
      validatorStake = exposure.total.toBigInt();
    } catch {}
    totalStake += validatorStake;

    let commissionBps = 0;
    try {
      const prefs = await api.query.staking.erasValidatorPrefs(eraNum, vid);
      commissionBps = perbillToBps(prefs.commission);
    } catch {}

    ids.push(bytes32);
    infos.push({
      totalStake: validatorStake,
      commissionBps,
      // Uptime derived from ImOnline is a Phase F improvement; mark 100% for now
      uptimeBps: 10_000,
      active: true,
    });
  }

  // Prefer the on-chain erasTotalStake storage value if available (more accurate)
  try {
    const onChainTotal = await api.query.staking.erasTotalStake(eraNum);
    const v = onChainTotal.toBigInt();
    if (v > 0n) totalStake = v;
  } catch {}

  // Era validator reward payout (total, in chain units)
  let eraReward = 0n;
  try {
    const rewardOpt = await api.query.staking.erasValidatorReward(eraNum);
    if (rewardOpt.isSome) eraReward = rewardOpt.unwrap().toBigInt();
  } catch {}

  return { era: eraNum, totalStake, eraReward, ids, infos };
}
