// Integration tests — connect to the live Portaldot V3 testnet (read-only, no transactions).
// Run with: node test/integration.mjs
// These do NOT require ORACLE_ADDRESS or a deployed contract.

import assert from 'assert';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { readStakingSnapshot } from '../src/relayer/snapshot.mjs';
import { getApi, disconnect } from '../src/chain/substrate.mjs';
import 'dotenv/config';

const SUBSTRATE_WS = process.env.SUBSTRATE_WS || 'wss://test-node-v3.portaldot.dev';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ${name} … `);
  try {
    await fn();
    console.log('OK');
    passed++;
  } catch (e) {
    console.log(`FAIL\n    ${e.message}`);
    failed++;
  }
}

console.log('\n=== Integration tests (live testnet, read-only) ===\n');

// ── 1. Substrate connection ────────────────────────────────────────────────
console.log('Substrate connection');
await test('connects to WS node', async () => {
  const api = await getApi();
  assert.ok(api.isConnected, 'API should be connected');
  const { specName } = api.runtimeVersion;
  console.log(`\n      specName=${specName}`);
});

await test('reads chain genesis hash', async () => {
  const api = await getApi();
  const genesis = api.genesisHash.toHex();
  assert.ok(genesis.startsWith('0x') && genesis.length === 66, 'genesis hash should be 32-byte hex');
  console.log(`\n      genesis=${genesis}`);
});

// ── 2. Staking storage ────────────────────────────────────────────────────
console.log('\nStaking storage');
await test('reads active era', async () => {
  const api = await getApi();
  const opt = await api.query.staking.activeEra();
  assert.ok(opt.isSome, 'activeEra should be Some');
  const era = Number(opt.unwrap().index);
  assert.ok(era >= 0, `era should be non-negative, got ${era}`);
  console.log(`\n      era=${era}`);
});

await test('reads session validators', async () => {
  const api = await getApi();
  const vals = await api.query.session.validators();
  const arr = [...vals];
  assert.ok(arr.length > 0, 'should have at least one active validator');
  console.log(`\n      validators=${arr.length}`);
});

// ── 3. Snapshot module ────────────────────────────────────────────────────
console.log('\nSnapshot module');
await test('readStakingSnapshot returns valid structure', async () => {
  const api = await getApi();
  const eraOpt = await api.query.staking.activeEra();
  const era = Number(eraOpt.unwrap().index);

  const snap = await readStakingSnapshot(era);
  assert.ok(snap !== null, 'snapshot should not be null');
  assert.strictEqual(snap.era, era, 'era mismatch');
  assert.ok(Array.isArray(snap.ids), 'ids should be array');
  assert.ok(Array.isArray(snap.infos), 'infos should be array');
  assert.strictEqual(snap.ids.length, snap.infos.length, 'ids and infos length mismatch');
  assert.ok(snap.ids.length > 0, 'should have at least one validator');
  assert.ok(typeof snap.totalStake === 'bigint', 'totalStake should be bigint');

  // Validate ids are 32-byte hex
  for (const id of snap.ids) {
    assert.ok(id.startsWith('0x') && id.length === 66, `invalid id format: ${id}`);
  }

  // Validate infos
  for (const info of snap.infos) {
    assert.ok(typeof info.totalStake === 'bigint', 'info.totalStake should be bigint');
    assert.ok(info.commissionBps >= 0 && info.commissionBps <= 10_000, `commission out of range: ${info.commissionBps}`);
    assert.ok(info.uptimeBps >= 0 && info.uptimeBps <= 10_000, `uptime out of range: ${info.uptimeBps}`);
    assert.ok(typeof info.active === 'boolean', 'info.active should be boolean');
  }

  console.log(`\n      era=${snap.era} validators=${snap.ids.length} totalStake=${snap.totalStake} eraReward=${snap.eraReward}`);
  console.log(`      first validator=${snap.ids[0]} commission=${snap.infos[0].commissionBps}bps uptime=${snap.infos[0].uptimeBps}bps`);
});

await test('snapshot respects MAX_VALIDATORS cap (64)', async () => {
  const api = await getApi();
  const eraOpt = await api.query.staking.activeEra();
  const era = Number(eraOpt.unwrap().index);
  const snap = await readStakingSnapshot(era);
  assert.ok(snap.ids.length <= 64, `too many validators: ${snap.ids.length}`);
});

// ── 4. Revive pallet ───────────────────────────────────────────────────────
console.log('\nRevive pallet');
await test('reads revive constants', async () => {
  const api = await getApi();
  const chainId = api.consts.revive.chainId.toNumber();
  const gasScale = api.consts.revive.gasScale.toNumber();
  const nativeToEthRatio = api.consts.revive.nativeToEthRatio.toNumber();
  assert.strictEqual(chainId, 420420777, `unexpected chainId: ${chainId}`);
  assert.ok(gasScale > 0, `gasScale should be positive: ${gasScale}`);
  assert.ok(nativeToEthRatio > 0, `nativeToEthRatio should be positive: ${nativeToEthRatio}`);
  console.log(`\n      chainId=${chainId} gasScale=${gasScale} nativeToEthRatio=${nativeToEthRatio}`);
});

await test('reviveApi.maxExtrinsicWeightInGas is set', async () => {
  const api = await getApi();
  const maxGas = await api.call.reviveApi.maxExtrinsicWeightInGas();
  const gas = BigInt(maxGas.toString());
  assert.ok(gas > 0n, 'maxExtrinsicWeightInGas should be positive');
  console.log(`\n      maxExtrinsicWeightInGas=${gas}`);
});

// ── Cleanup ────────────────────────────────────────────────────────────────
await disconnect();

console.log(`\n${'─'.repeat(44)}`);
console.log(`  ${passed} passed  ${failed} failed`);
if (failed > 0) process.exit(1);
