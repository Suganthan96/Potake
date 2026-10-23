import { ApiPromise, WsProvider } from '@polkadot/api';
import { SUBSTRATE_WS } from '../config.mjs';

let _api = null;

export async function getApi() {
  if (_api) return _api;
  const provider = new WsProvider(SUBSTRATE_WS, 1000, {}, 30_000);
  _api = await ApiPromise.create({ provider });
  await _api.isReady;
  const { specName, specVersion } = _api.runtimeVersion;
  console.log(`[substrate] connected  ${SUBSTRATE_WS}  (${specName}/${specVersion})`);
  return _api;
}

export async function disconnect() {
  if (_api) {
    await _api.disconnect();
    _api = null;
  }
}
