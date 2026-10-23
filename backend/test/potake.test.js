const { expect } = require("chai");
const { ethers } = require("hardhat");

const id = (n) => ethers.zeroPadValue(ethers.toBeHex(n), 32);
const V1 = id(1);
const V2 = id(2);
const V3 = id(3);
const info = (stake, commissionBps, uptimeBps, active = true) => ({ totalStake: stake, commissionBps, uptimeBps, active });

describe("StakingOracle", () => {
  let owner, relayer, other, oracle;

  beforeEach(async () => {
    [owner, relayer, other] = await ethers.getSigners();
    oracle = await (await ethers.getContractFactory("StakingOracle")).deploy(relayer.address);
  });

  it("publishes a snapshot and exposes it through the interface", async () => {
    await oracle.connect(relayer).publish(41, 20_000n, 500n, [V1, V2], [info(10_000n, 0, 10_000), info(10_000n, 100, 9_900)]);
    expect(await oracle.latestEra()).to.equal(41);
    const s = await oracle.snapshot();
    expect(s.era).to.equal(41);
    expect(s.validatorCount).to.equal(2);
    expect(s.totalStake).to.equal(20_000n);
    expect(await oracle.validatorIds()).to.deep.equal([V1, V2]);
    expect(await oracle.stakeShareBps(V1)).to.equal(5_000);
    expect((await oracle.validatorInfo(V2)).uptimeBps).to.equal(9_900);
  });

  it("emits per-validator and snapshot events (history lives in events)", async () => {
    await expect(oracle.connect(relayer).publish(1, 100n, 0n, [V1], [info(100n, 0, 10_000)]))
      .to.emit(oracle, "ValidatorUpdated")
      .withArgs(1, V1, 100n, 0, 10_000, true)
      .and.to.emit(oracle, "SnapshotPublished");
  });

  it("only the relayer can publish", async () => {
    await expect(oracle.connect(other).publish(1, 0n, 0n, [], [])).to.be.revertedWithCustomError(oracle, "NotRelayer");
  });

  it("rejects stale or repeated eras", async () => {
    await oracle.connect(relayer).publish(5, 0n, 0n, [], []);
    await expect(oracle.connect(relayer).publish(5, 0n, 0n, [], [])).to.be.revertedWithCustomError(oracle, "StaleEra");
    await expect(oracle.connect(relayer).publish(4, 0n, 0n, [], [])).to.be.revertedWithCustomError(oracle, "StaleEra");
    await oracle.connect(relayer).publish(6, 0n, 0n, [], []);
  });

  it("replaces the previous validator set and clears removed validators", async () => {
    await oracle.connect(relayer).publish(1, 300n, 0n, [V1, V2], [info(100n, 0, 10_000), info(200n, 0, 10_000)]);
    await oracle.connect(relayer).publish(2, 300n, 0n, [V3], [info(300n, 0, 10_000)]);
    expect(await oracle.validatorIds()).to.deep.equal([V3]);
    expect(await oracle.isHealthy(V1, 0)).to.equal(false);
    expect((await oracle.validatorInfo(V1)).totalStake).to.equal(0);
    expect(await oracle.stakeShareBps(V1)).to.equal(0);
  });

  it("rejects mismatched lengths, duplicates and out-of-range bps", async () => {
    await expect(oracle.connect(relayer).publish(1, 0n, 0n, [V1], [])).to.be.revertedWithCustomError(oracle, "LengthMismatch");
    await expect(
      oracle.connect(relayer).publish(1, 0n, 0n, [V1, V1], [info(1n, 0, 1), info(1n, 0, 1)])
    ).to.be.revertedWithCustomError(oracle, "DuplicateValidator");
    await expect(
      oracle.connect(relayer).publish(1, 0n, 0n, [V1], [info(1n, 0, 10_001)])
    ).to.be.revertedWithCustomError(oracle, "BpsOutOfRange");
  });

  it("isHealthy respects uptime threshold and active flag", async () => {
    await oracle
      .connect(relayer)
      .publish(1, 300n, 0n, [V1, V2, V3], [info(100n, 0, 9_600), info(100n, 0, 9_000), info(100n, 0, 10_000, false)]);
    expect(await oracle.isHealthy(V1, 9_500)).to.equal(true);
    expect(await oracle.isHealthy(V2, 9_500)).to.equal(false);
    expect(await oracle.isHealthy(V3, 9_500)).to.equal(false);
  });

  it("owner can change the relayer; others cannot", async () => {
    await expect(oracle.connect(other).setRelayer(other.address)).to.be.revertedWithCustomError(oracle, "NotOwner");
    await oracle.setRelayer(other.address);
    await oracle.connect(other).publish(1, 0n, 0n, [], []);
  });

  it("caps the validator count", async () => {
    const ids = Array.from({ length: 65 }, (_, i) => id(i + 1));
    const infos = ids.map(() => info(1n, 0, 1));
    await expect(oracle.connect(relayer).publish(1, 0n, 0n, ids, infos)).to.be.revertedWithCustomError(oracle, "TooManyValidators");
  });
});

describe("PolicyRegistry", () => {
  let owner, agent, user, other, reg;
  const ACCOUNT = id(99);
  const H = (n) => ethers.keccak256(ethers.toUtf8Bytes(String(n)));

  beforeEach(async () => {
    [owner, agent, user, other] = await ethers.getSigners();
    reg = await (await ethers.getContractFactory("PolicyRegistry")).deploy(agent.address);
  });

  it("sets and versions a policy", async () => {
    await expect(reg.connect(user).setPolicy(ACCOUNT, 6_000, 9_500, 2))
      .to.emit(reg, "PolicySet")
      .withArgs(user.address, ACCOUNT, 1, 6_000, 9_500, 2);
    await reg.connect(user).setPolicy(ACCOUNT, 5_000, 9_000, 2);
    const p = await reg.policies(user.address);
    expect(p.version).to.equal(2);
    expect(p.maxShareBps).to.equal(5_000);
    expect(p.active).to.equal(true);
  });

  it("validates policy inputs", async () => {
    await expect(reg.connect(user).setPolicy(ethers.ZeroHash, 6_000, 9_500, 2)).to.be.revertedWithCustomError(reg, "ZeroAccount");
    await expect(reg.connect(user).setPolicy(ACCOUNT, 10_001, 9_500, 2)).to.be.revertedWithCustomError(reg, "BpsOutOfRange");
  });

  it("agent logs an action under the policy's staking account", async () => {
    await reg.connect(user).setPolicy(ACCOUNT, 6_000, 9_500, 2);
    await expect(reg.connect(agent).logAction(user.address, 40, 1, 1, H("ext"), H("from"), H("to")))
      .to.emit(reg, "ActionLogged")
      .withArgs(ACCOUNT, user.address, 40, 1, 1, H("ext"), H("from"), H("to"));
    expect(await reg.actionCount(ACCOUNT)).to.equal(1);
    const a = await reg.getAction(ACCOUNT, 0);
    expect(a.era).to.equal(40);
    expect(a.ruleBroken).to.equal(1);
    expect(a.extrinsicHash).to.equal(H("ext"));
  });

  it("only the agent can log; needs an active policy, matching version and valid rule", async () => {
    await expect(reg.connect(other).logAction(user.address, 1, 1, 1, H(1), H(2), H(3))).to.be.revertedWithCustomError(reg, "NotAgent");
    await expect(reg.connect(agent).logAction(user.address, 1, 1, 1, H(1), H(2), H(3))).to.be.revertedWithCustomError(reg, "NoActivePolicy");
    await reg.connect(user).setPolicy(ACCOUNT, 6_000, 9_500, 2);
    await expect(reg.connect(agent).logAction(user.address, 1, 2, 1, H(1), H(2), H(3))).to.be.revertedWithCustomError(reg, "PolicyVersionMismatch");
    await expect(reg.connect(agent).logAction(user.address, 1, 1, 9, H(1), H(2), H(3))).to.be.revertedWithCustomError(reg, "InvalidRule");
  });

  it("deactivated policies cannot be acted on", async () => {
    await reg.connect(user).setPolicy(ACCOUNT, 6_000, 9_500, 2);
    await reg.connect(user).deactivatePolicy();
    await expect(reg.connect(agent).logAction(user.address, 1, 1, 1, H(1), H(2), H(3))).to.be.revertedWithCustomError(reg, "NoActivePolicy");
    await expect(reg.connect(user).deactivatePolicy()).to.be.revertedWithCustomError(reg, "NoActivePolicy");
  });
});

describe("GatedVault (demo consumer)", () => {
  let relayer, user, oracle, vault;

  beforeEach(async () => {
    [, relayer, user] = await ethers.getSigners();
    oracle = await (await ethers.getContractFactory("StakingOracle")).deploy(relayer.address);
    vault = await (await ethers.getContractFactory("GatedVault")).deploy(await oracle.getAddress(), 9_500);
    await oracle.connect(relayer).publish(1, 200n, 0n, [V1, V2], [info(100n, 0, 10_000), info(100n, 0, 9_000)]);
  });

  it("accepts deposits for a healthy validator", async () => {
    await expect(vault.connect(user).deposit(V1, { value: 1000 })).to.emit(vault, "Deposited").withArgs(user.address, V1, 1000);
    expect(await vault.balanceOf(user.address, V1)).to.equal(1000);
  });

  it("rejects deposits for an unhealthy or unknown validator", async () => {
    await expect(vault.connect(user).deposit(V2, { value: 1 })).to.be.revertedWithCustomError(vault, "ValidatorUnhealthy");
    await expect(vault.connect(user).deposit(V3, { value: 1 })).to.be.revertedWithCustomError(vault, "ValidatorUnhealthy");
    await expect(vault.connect(user).deposit(V1, { value: 0 })).to.be.revertedWithCustomError(vault, "ZeroAmount");
  });

  it("lets depositors withdraw only what they put in", async () => {
    await vault.connect(user).deposit(V1, { value: 1000 });
    await expect(vault.connect(user).withdraw(V1, 1001)).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    await expect(vault.connect(user).withdraw(V1, 400)).to.changeEtherBalance(user, 400);
    expect(await vault.balanceOf(user.address, V1)).to.equal(600);
  });

  it("reacts when the oracle marks a validator unhealthy in a later era", async () => {
    await oracle.connect(relayer).publish(2, 200n, 0n, [V1, V2], [info(100n, 0, 8_000), info(100n, 0, 10_000)]);
    await expect(vault.connect(user).deposit(V1, { value: 1 })).to.be.revertedWithCustomError(vault, "ValidatorUnhealthy");
    await vault.connect(user).deposit(V2, { value: 1 });
  });
});
