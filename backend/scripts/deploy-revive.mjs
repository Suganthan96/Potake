// Deploys StakingOracle, PolicyRegistry, GatedVault to Portaldot V3 via
// revive.instantiateWithCode (PolkaVM bytecode compiled with resolc).
// Usage: node scripts/deploy-revive.mjs <keystore.json>
// Password is read from ACCOUNT_PASSWORD env var, or prompted interactively.

import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { ethers } from 'ethers';

const SUBSTRATE_WS = process.env.SUBSTRATE_WS || 'wss://test-node-v3.portaldot.dev';
const VAULT_MIN_UPTIME_BPS = Number(process.env.VAULT_MIN_UPTIME_BPS || 9500);

// Deployer's mapped H160 (sr25519 account → EVM address)
// 5EjtabLnbcc1EDhnC7Du7QPJEwicdRLXe4o4BGH4Z4vD8W4y → 0xf6461a109077917996bf96ca23b7d97386d7ceae
// The EVM deployer key (0x7AeDB...) is also funded and can be relayer.
const EVM_DEPLOYER = process.env.DEPLOYER_EVM_ADDR || '0x7AeDB4bb950dFD8E85Bef931A024D43C646f7FBf';

const keystorePath = process.argv[2];
if (!keystorePath || !existsSync(keystorePath)) {
  console.error('Usage: node scripts/deploy-revive.mjs <keystore.json>');
  process.exit(1);
}

async function askPassword() {
  if (process.env.ACCOUNT_PASSWORD) return process.env.ACCOUNT_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question('Keystore password: ', ans => { rl.close(); resolve(ans); });
  });
}

function loadArtifact(name) {
  // Use EVM bytecode (allowEVMBytecode: true on this chain) — much smaller storage deposit
  // than PolkaVM bytecode (~4KB EVM vs ~27KB PolkaVM = ~240 tPOT vs ~1645 tPOT deposit)
  const hardhatArtifact = JSON.parse(
    readFileSync(`artifacts/contracts/${name}.sol/${name}.json`, 'utf8')
  );
  return {
    code: hardhatArtifact.bytecode, // 0x-prefixed EVM deployment bytecode
    abi: hardhatArtifact.abi,
  };
}

async function waitFinalized(api, tx, signer) {
  return new Promise((resolve, reject) => {
    tx.signAndSend(signer, ({ status, events, dispatchError }) => {
      if (dispatchError) {
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule);
          reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs}`));
        } else {
          reject(new Error(dispatchError.toString()));
        }
        return;
      }
      if (status.isInBlock) console.log(`  In block: ${status.asInBlock.toHex()}`);
      if (status.isFinalized) {
        resolve({ blockHash: status.asFinalized.toHex(), events });
      }
    }).catch(reject);
  });
}

function extractContractAddress(api, events) {
  for (const { event } of events) {
    if (api.events.revive?.Instantiated?.is(event)) {
      const { contract } = event.data;
      return contract.toString();
    }
  }
  return null;
}

await cryptoWaitReady();
const password = await askPassword();

const keystore = JSON.parse(readFileSync(keystorePath, 'utf8'));
const keyring = new Keyring({ type: 'sr25519' });
const pair = keyring.addFromJson(keystore);
pair.decodePkcs8(password);
console.log(`Deployer (substrate): ${pair.address}`);

const wsProvider = new WsProvider(SUBSTRATE_WS, 1000, {}, 60000);
const api = await ApiPromise.create({ provider: wsProvider });
await api.isReady;
console.log(`Connected: ${SUBSTRATE_WS}`);

// Generous weight for PolkaVM instantiation (pre-compiled, so much cheaper than EVM bytecode)
const gasLimit = api.registry.createType('SpWeightsWeightV2Weight', {
  refTime: 10_000_000_000n,
  proofSize: 131072n,
});
const storageDepositLimit = null; // no cap

const deployedAt = {};
const out = { network: 'portaldotV3', deployer: pair.address, contracts: {} };

async function deploy(contractName, constructorArgs) {
  const { code, abi } = loadArtifact(contractName);
  const iface = new ethers.Interface(abi);

  // ABI-encode constructor arguments (without the selector)
  const constructorFrag = iface.fragments.find(f => f.type === 'constructor');
  const encodedArgs = constructorFrag && constructorArgs.length
    ? ethers.AbiCoder.defaultAbiCoder().encode(
        constructorFrag.inputs.map(i => i.type),
        constructorArgs
      ).slice(2) // strip 0x
    : '';

  const data = `0x${encodedArgs}`;
  const salt = `0x${'00'.repeat(32)}`;

  const codeBytes = (code.length - 2) / 2;
  console.log(`\nDeploying ${contractName} (${codeBytes} bytes EVM bytecode)...`);
  const tx = api.tx.revive.instantiateWithCode(
    0,          // value
    gasLimit,
    storageDepositLimit,
    code,
    data,
    salt,
  );

  const { blockHash, events } = await waitFinalized(api, tx, pair);
  const address = extractContractAddress(api, events);
  if (!address) throw new Error(`No Instantiated event for ${contractName}`);

  console.log(`  Finalized: ${blockHash}`);
  console.log(`  Address  : ${address}`);
  out.contracts[contractName] = { address, deployTx: blockHash };
  deployedAt[contractName] = address;
  return address;
}

// 1. StakingOracle — relayer = EVM deployer address
const oracle = await deploy('StakingOracle', [EVM_DEPLOYER]);

// 2. PolicyRegistry — agent = EVM deployer address
await deploy('PolicyRegistry', [EVM_DEPLOYER]);

// 3. GatedVault — oracle address from step 1, minUptimeBps from env
await deploy('GatedVault', [oracle, VAULT_MIN_UPTIME_BPS]);

writeFileSync('deployments.json', JSON.stringify(out, null, 2));
console.log('\nSaved deployments.json');
console.log('Oracle   :', deployedAt.StakingOracle);
console.log('Registry :', deployedAt.PolicyRegistry);
console.log('Vault    :', deployedAt.GatedVault);

await api.disconnect();
