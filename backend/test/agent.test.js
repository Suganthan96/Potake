// Unit tests for the agent's policy evaluation logic (no network required).
const { expect }  = require("chai");
const { ethers }  = require("hardhat");

// ── Inline the pure evaluation logic so it runs in the Hardhat environment ──
const RULE_MAX_SHARE      = 1;
const RULE_MIN_UPTIME     = 2;
const RULE_MAX_VALIDATORS = 3;

function evaluatePolicySync(policy, snapshot, currentNoms) {
  const violations = [];
  let firstRule = 0;

  // Build map keyed by id (bytes32)
  const byId = {};
  for (let i = 0; i < snapshot.ids.length; i++) {
    byId[snapshot.ids[i]] = snapshot.infos[i];
  }

  // Rule 2: min uptime
  const unhealthy = currentNoms.filter(id => {
    const v = byId[id];
    return !v || !v.active || v.uptimeBps < policy.minUptimeBps;
  });
  if (unhealthy.length > 0) {
    violations.push(`minUptime: ${unhealthy.length} validator(s) below threshold`);
    if (!firstRule) firstRule = RULE_MIN_UPTIME;
  }

  // Rule 1: max share
  if (snapshot.totalStake > 0n) {
    for (const id of currentNoms) {
      const v = byId[id];
      if (!v) continue;
      const shareBps = Number((v.totalStake * 10_000n) / snapshot.totalStake);
      if (shareBps > policy.maxShareBps) {
        violations.push(`maxShare: ${id.slice(0, 10)}… at ${shareBps} bps > ${policy.maxShareBps}`);
        if (!firstRule) firstRule = RULE_MAX_SHARE;
      }
    }
  }

  // Rule 3: max validators
  if (policy.maxValidators > 0 && currentNoms.length > policy.maxValidators) {
    violations.push(`maxValidators: ${currentNoms.length} > ${policy.maxValidators}`);
    if (!firstRule) firstRule = RULE_MAX_VALIDATORS;
  }

  // Suggested compliant set
  const candidates = snapshot.ids
    .filter(id => {
      const v = byId[id];
      return v && v.active && v.uptimeBps >= policy.minUptimeBps &&
        (snapshot.totalStake === 0n ||
          Number((v.totalStake * 10_000n) / snapshot.totalStake) <= policy.maxShareBps);
    })
    .sort((a, b) => Number(byId[b].totalStake - byId[a].totalStake));

  const maxCount = policy.maxValidators > 0
    ? Math.min(policy.maxValidators, candidates.length)
    : candidates.length;
  const suggestedSet = candidates.slice(0, maxCount);

  return { violations, rule: firstRule, suggestedSet };
}

// Helpers
const id = n => ethers.zeroPadValue(ethers.toBeHex(n), 32);
const mkInfo = (stake, uptime = 10_000, active = true, commission = 0) =>
  ({ totalStake: BigInt(stake), uptimeBps: uptime, active, commissionBps: commission });
const mkPolicy = (maxShare, minUptime, maxValidators = 0) =>
  ({ maxShareBps: maxShare, minUptimeBps: minUptime, maxValidators });
const mkSnap = (entries, total) => ({
  totalStake: BigInt(total),
  ids: entries.map(([i]) => id(i)),
  infos: entries.map(([, info]) => info),
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Agent evaluate — pure logic", () => {
  it("no violations when all rules satisfied", () => {
    const snap = mkSnap([[1, mkInfo(100, 10_000)], [2, mkInfo(100, 9_800)]], 200);
    const { violations, rule } = evaluatePolicySync(
      mkPolicy(6_000, 9_500), snap, [id(1), id(2)]
    );
    expect(violations).to.deep.equal([]);
    expect(rule).to.equal(0);
  });

  it("detects minUptime violation", () => {
    const snap = mkSnap([[1, mkInfo(100, 9_000)], [2, mkInfo(100, 10_000)]], 200);
    const { violations, rule } = evaluatePolicySync(
      mkPolicy(6_000, 9_500), snap, [id(1)]
    );
    expect(violations.length).to.equal(1);
    expect(rule).to.equal(RULE_MIN_UPTIME);
  });

  it("detects maxShare violation", () => {
    // V1 has 80% of stake → breaches 60% cap
    const snap = mkSnap([[1, mkInfo(800, 10_000)], [2, mkInfo(200, 10_000)]], 1000);
    const { violations, rule } = evaluatePolicySync(
      mkPolicy(6_000, 9_500), snap, [id(1), id(2)]
    );
    expect(violations.some(v => v.includes('maxShare'))).to.equal(true);
    expect(rule).to.equal(RULE_MAX_SHARE);
  });

  it("detects maxValidators violation", () => {
    const snap = mkSnap(
      [[1, mkInfo(100, 10_000)], [2, mkInfo(100, 10_000)], [3, mkInfo(100, 10_000)]],
      300
    );
    const { violations, rule } = evaluatePolicySync(
      mkPolicy(6_000, 9_500, 2), snap, [id(1), id(2), id(3)]
    );
    expect(violations.some(v => v.includes('maxValidators'))).to.equal(true);
    expect(rule).to.equal(RULE_MAX_VALIDATORS);
  });

  it("suggests a compliant set excluding unhealthy validators", () => {
    const snap = mkSnap(
      [[1, mkInfo(100, 8_000)],   // below minUptime
       [2, mkInfo(200, 10_000)],  // compliant
       [3, mkInfo(150, 9_600)]],  // compliant
      450
    );
    const { suggestedSet } = evaluatePolicySync(
      mkPolicy(6_000, 9_500), snap, [id(1)]
    );
    expect(suggestedSet).to.not.include(id(1));
    expect(suggestedSet).to.include(id(2));
    expect(suggestedSet).to.include(id(3));
  });

  it("suggested set respects maxValidators cap", () => {
    const snap = mkSnap(
      [[1, mkInfo(100, 10_000)], [2, mkInfo(100, 10_000)], [3, mkInfo(100, 10_000)]],
      300
    );
    const { suggestedSet } = evaluatePolicySync(
      mkPolicy(6_000, 9_500, 2), snap, [id(1), id(2), id(3)]
    );
    expect(suggestedSet.length).to.equal(2);
  });

  it("unknown nominated validator (not in oracle) treated as unhealthy", () => {
    const snap = mkSnap([[1, mkInfo(100, 10_000)]], 100);
    const { violations, rule } = evaluatePolicySync(
      mkPolicy(6_000, 9_500), snap, [id(999)] // 999 not in oracle
    );
    expect(violations.length).to.be.above(0);
    expect(rule).to.equal(RULE_MIN_UPTIME);
  });

  it("minUptime violation takes priority over maxShare in firstRule", () => {
    // V1: low uptime AND high share
    const snap = mkSnap([[1, mkInfo(900, 5_000)], [2, mkInfo(100, 10_000)]], 1000);
    const { rule } = evaluatePolicySync(
      mkPolicy(6_000, 9_500), snap, [id(1), id(2)]
    );
    // Rule 2 (minUptime) is checked before Rule 1 (maxShare)
    expect(rule).to.equal(RULE_MIN_UPTIME);
  });

  it("inactive validator treated as unhealthy", () => {
    const snap = mkSnap([[1, mkInfo(100, 10_000, false)]], 100);
    const { violations } = evaluatePolicySync(
      mkPolicy(6_000, 9_500), snap, [id(1)]
    );
    expect(violations.length).to.be.above(0);
  });

  it("suggested set is sorted by stake descending", () => {
    const snap = mkSnap(
      [[1, mkInfo(50, 10_000)], [2, mkInfo(300, 10_000)], [3, mkInfo(150, 10_000)]],
      500
    );
    const { suggestedSet } = evaluatePolicySync(mkPolicy(6_000, 9_500), snap, []);
    expect(suggestedSet[0]).to.equal(id(2)); // highest stake first
    expect(suggestedSet[1]).to.equal(id(3));
    expect(suggestedSet[2]).to.equal(id(1));
  });
});
