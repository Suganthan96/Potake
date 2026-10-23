// Transfers tPOT from a Substrate keystore account to the mapped SS58 of an EVM address.
// Usage: node scripts/fund-deployer.mjs <keystore.json> <evm-h160-address> [amount-tPOT]
// Password is read from ACCOUNT_PASSWORD env var (or prompted if node readline is available).
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';

const DECIMALS = 14n; // tPOT has 14 decimals
const PLANCK = 10n ** DECIMALS;

const keystorePath = process.argv[2];
const evmAddress   = process.argv[3];
const amountTpot   = BigInt(process.argv[4] || '20');

if (!keystorePath || !evmAddress) {
  console.error('Usage: node scripts/fund-deployer.mjs <keystore.json> <evm-h160> [amount-tPOT]');
  process.exit(1);
}
if (!existsSync(keystorePath)) {
  console.error(`Keystore not found: ${keystorePath}`);
  process.exit(1);
}

async function askPassword() {
  if (process.env.ACCOUNT_PASSWORD) return process.env.ACCOUNT_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question('Keystore password: ', ans => { rl.close(); resolve(ans); });
  });
}

await cryptoWaitReady();
const password = await askPassword();

const keystore = JSON.parse(readFileSync(keystorePath, 'utf8'));
const keyring  = new Keyring({ type: 'sr25519' });
const pair     = keyring.addFromJson(keystore);
pair.decodePkcs8(password);
console.log(`Sender: ${pair.address}`);

const provider = new WsProvider(process.env.SUBSTRATE_WS || 'wss://test-node-v3.portaldot.dev', 1000, {}, 40000);
const api      = await ApiPromise.create({ provider });
await api.isReady;

// Resolve EVM H160 → SS58 via reviveApi
const dest = (await api.call.reviveApi.accountId(evmAddress)).toString();
console.log(`EVM ${evmAddress} → SS58 ${dest}`);

// Check sender balance
const acct   = await api.query.system.account(pair.address);
const free   = acct.data.free.toBigInt();
const amount = amountTpot * PLANCK;
console.log(`Sender free balance: ${free / PLANCK} tPOT`);
if (free < amount + PLANCK) {
  console.error(`Insufficient balance (need ${amountTpot + 1n} tPOT, have ${free / PLANCK} tPOT)`);
  process.exit(1);
}

console.log(`Sending ${amountTpot} tPOT to ${dest} …`);
const tx = api.tx.balances.transferKeepAlive(dest, amount);
await new Promise((resolve, reject) => {
  tx.signAndSend(pair, ({ status, dispatchError }) => {
    if (dispatchError) {
      reject(new Error(dispatchError.toString()));
    } else if (status.isInBlock) {
      console.log(`In block: ${status.asInBlock.toHex()}`);
    } else if (status.isFinalized) {
      console.log(`Finalized: ${status.asFinalized.toHex()}`);
      resolve();
    }
  }).catch(reject);
});

await api.disconnect();
console.log('Done. Run npm run deploy:testnet');
