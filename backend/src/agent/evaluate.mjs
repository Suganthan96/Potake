// evaluate.mjs — Compare a managed account's current nominations against
// its policy rules and return a list of violations + a suggested fix set.

import { getApi } from '../chain/substrate.mjs';

const RULE_MAX_SHARE      = 1;
const RULE_MIN_UPTIME     = 2;
const RULE_MAX_VALIDATORS = 3;

// Convert oracle bytes32 id → SS58 address
export function bytes32ToSS58(api, hex) {
  const bytes = Buffer.from(hex.replace('0x', ''), 'hex');
  return api.createType('AccountId', bytes).toString();
}

// Read the managed account's current nominations from Substrate
export async function getCurrentNominations(api, ss58) {
  try {
    const nom = await api.query.staking.nominators(ss58);
    if (nom.isNone) return [];
    const targets = nom.unwrap().targets;
    return targets.map(t => t.toString());
  } catch {
    return [];
  }
}

// Evaluate policy rules against current nominations and oracle snapshot.
// Returns { violations, rule, suggestedSet }
//   violations  — list of strings describing broken rules
//   rule        — RULE_* constant of the first (most severe) rule broken, or 0
//   suggestedSet — valid nomination set satisfying all rules (SS58 array)
export async function evaluatePolicy(policy, snapshot, managedAccountSS58) {
  const api = await getApi();
  const violations = [];
  let firstRule = 0;

  // Build oracle validator map keyed by SS58
  const validatorsBySS58 = {};
  for (let i = 0; i < snapshot.ids.length; i++) {
    const ss58 = bytes32ToSS58(api, snapshot.ids[i]);
    validatorsBySS58[ss58] = { ...snapshot.infos[i], id: snapshot.ids[i] };
  }

  const currentNoms = await getCurrentNominations(api, managedAccountSS58);
  console.log(`[agent] account=${managedAccountSS58} current nominations: ${currentNoms.length}`);

  // ── Rule 0: no nominations at all ─────────────────────────────────────
  if (currentNoms.length === 0) {
    violations.push('no active nominations — policy requires nominating compliant validators');
    if (!firstRule) firstRule = RULE_MIN_UPTIME;
  }

  // ── Rule 2: min uptime ─────────────────────────────────────────────────
  const unhealthy = currentNoms.filter(ss58 => {
    const v = validatorsBySS58[ss58];
    if (!v) return true; // unknown validator → unhealthy
    return !v.active || v.uptimeBps < policy.minUptimeBps;
  });
  if (unhealthy.length > 0) {
    violations.push(`minUptime broken: ${unhealthy.length} nominated validator(s) below ${policy.minUptimeBps} bps`);
    if (!firstRule) firstRule = RULE_MIN_UPTIME;
  }

  // ── Rule 1: max share ──────────────────────────────────────────────────
  if (snapshot.totalStake > 0n) {
    for (const ss58 of currentNoms) {
      const v = validatorsBySS58[ss58];
      if (!v) continue;
      const shareBps = Number((v.totalStake * 10_000n) / snapshot.totalStake);
      if (shareBps > policy.maxShareBps) {
        violations.push(`maxShare broken: ${ss58.slice(0, 10)}… has ${shareBps} bps > limit ${policy.maxShareBps} bps`);
        if (!firstRule) firstRule = RULE_MAX_SHARE;
      }
    }
  }

  // ── Rule 3: max validators ─────────────────────────────────────────────
  if (policy.maxValidators > 0 && currentNoms.length > policy.maxValidators) {
    violations.push(`maxValidators broken: nominating ${currentNoms.length} > limit ${policy.maxValidators}`);
    if (!firstRule) firstRule = RULE_MAX_VALIDATORS;
  }

  // ── Build suggested compliant set ─────────────────────────────────────
  const candidates = Object.entries(validatorsBySS58)
    .filter(([, v]) => v.active && v.uptimeBps >= policy.minUptimeBps)
    .filter(([, v]) => snapshot.totalStake === 0n ||
      Number((v.totalStake * 10_000n) / snapshot.totalStake) <= policy.maxShareBps)
    .sort(([, a], [, b]) => Number(b.totalStake - a.totalStake)); // prefer higher stake

  const maxCount = policy.maxValidators > 0
    ? Math.min(policy.maxValidators, candidates.length)
    : candidates.length;

  const suggestedSet = candidates.slice(0, maxCount).map(([ss58]) => ss58);

  return { violations, rule: firstRule, currentNoms, suggestedSet };
}
