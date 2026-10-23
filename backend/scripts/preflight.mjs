// Read-only preflight for Portaldot V3 testnet. Sends no transactions.
// Run: npm i @polkadot/api && node preflight.mjs [SS58_ADDRESS]
import { ApiPromise, WsProvider } from '@polkadot/api';

const WS = 'wss://test-node-v3.portaldot.dev';
const addr = process.argv[2];
const api = await ApiPromise.create({ provider: new WsProvider(WS, 1000, {}, 20000) });

const out = {};
const safe = async (k, f) => { try { out[k] = await f(); } catch (e) { out[k] = `ERR: ${e.message}`; } };

await safe('runtime', async () => `${api.runtimeVersion.specName}/${api.runtimeVersion.specVersion}`);
await safe('head', async () => (await api.rpc.chain.getHeader()).number.toString());
await safe('declaredValidators', async () => (await api.query.staking.validators.keys()).length);
await safe('validatorCount', async () => api.query.staking.validatorCount().then(x => x.toString()));
await safe('activeEra', async () => (await api.query.staking.activeEra()).toString());
await safe('bondingDurationEras', async () => api.consts.staking.bondingDuration.toString());
await safe('slashDeferEras', async () => api.consts.staking.slashDeferDuration.toString());
await safe('minNominatorBond', async () => (await api.query.staking.minNominatorBond()).toString());
await safe('poolsLastId', async () => (await api.query.nominationPools.lastPoolId()).toString());
await safe('poolMinCreateBond', async () => (await api.query.nominationPools.minCreateBond()).toString());
await safe('poolMinJoinBond', async () => (await api.query.nominationPools.minJoinBond()).toString());
await safe('hasProxyPallet', async () => !!api.tx.proxy);
await safe('proxyTypes', async () => {
  const t = api.registry.lookup.types.find(x => x.type.path.join('::').endsWith('ProxyType'));
  return t ? t.type.def.asVariant.variants.map(v => v.name.toString()) : 'ProxyType not found';
});
await safe('delegatedStakingCalls', async () => api.tx.delegatedStaking ? Object.keys(api.tx.delegatedStaking) : 'pallet absent');
await safe('offenceReports', async () => (await api.query.offences.reports.keys()).length);
await safe('palletsOfInterest', async () => Object.keys(api.tx).filter(x => /staking|pool|proxy|revive|imonline|session/i.test(x)));
if (addr) {
  await safe('account', async () => {
    const a = await api.query.system.account(addr);
    const led = await api.query.staking.ledger(addr);
    return { free: a.data.free.toString(), stakingLedger: led.toString() };
  });
}
console.log(JSON.stringify(out, null, 2));
await api.disconnect();
