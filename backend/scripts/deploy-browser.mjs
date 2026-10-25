/**
 * Deploys contracts using Brave browser with puppeteer.
 * Brave already has Cloudflare clearance from previous visits.
 * ethers.js runs inside the browser page — no Node.js TLS/Cloudflare issue.
 */
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const RPC   = 'https://test-evm-rpc-v3.portaldot.dev';
const PK    = process.env.DEPLOYER_PRIVATE_KEY;

if (!PK) { console.error('Set DEPLOYER_PRIVATE_KEY'); process.exit(1); }

// Load bytecodes from artifacts
function loadBytecode(name) {
  const art = JSON.parse(readFileSync(
    join(__dir, `../artifacts/contracts/${name}.sol/${name}.json`), 'utf8'
  ));
  return art.bytecode;
}

const ORACLE_BC   = loadBytecode('StakingOracle');
const REGISTRY_BC = loadBytecode('PolicyRegistry');
const VAULT_BC    = loadBytecode('GatedVault');

const pk = PK.startsWith('0x') ? PK : '0x' + PK;

console.log('Launching Brave browser...');
const browser = await puppeteer.launch({
  executablePath: BRAVE,
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();

// Navigate to the EVM RPC domain so fetch calls are same-origin (no CORS block)
console.log('Navigating to RPC domain...');
try {
  await page.goto(RPC, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (_) { /* page may not have HTML — that's fine */ }
await new Promise(r => setTimeout(r, 2000));

await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js' });

// Wait for ethers to load
await page.waitForFunction(() => typeof window.ethers !== 'undefined', { timeout: 30000 });
console.log('ethers.js loaded in browser');

const result = await page.evaluate(async ({ rpc, pk, registryBc, vaultBc, knownOracle }) => {
  const logs = [];
  const log = msg => { logs.push(msg); console.log(msg); };

  async function waitReceipt(provider, txHash) {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await provider.getTransactionReceipt(txHash);
        if (r) return r;
      } catch (_) {}
      await new Promise(res => setTimeout(res, 3000));
    }
    throw new Error('Receipt timeout: ' + txHash);
  }

  async function deploy(provider, wallet, abi, bytecode, args) {
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const deployTx = await factory.getDeployTransaction(...args);
    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    const gasLimit = await provider.estimateGas({ from: wallet.address, data: deployTx.data, nonce });
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 40000n;
    const tx = await wallet.sendTransaction({ data: deployTx.data, gasLimit, gasPrice, type: 0, nonce });
    log('  tx: ' + tx.hash);
    const receipt = await waitReceipt(provider, tx.hash);
    return receipt.contractAddress;
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpc, { chainId: 420420777, name: 'portaldot' });
    const wallet = new ethers.Wallet(pk, provider);
    log('Deployer: ' + wallet.address);
    const bal = await provider.getBalance(wallet.address);
    log('Balance: ' + ethers.formatEther(bal) + ' tPOT');

    // StakingOracle already deployed — reuse known address
    const oracleAddr = knownOracle;
    log('StakingOracle (existing): ' + oracleAddr);

    log('Deploying PolicyRegistry...');
    const registryAddr = await deploy(provider, wallet, ['constructor(address agent)'], registryBc, [wallet.address]);
    log('PolicyRegistry: ' + registryAddr);

    log('Deploying GatedVault...');
    const vaultAddr = await deploy(provider, wallet, ['constructor(address oracle, uint16 minUptimeBps)'], vaultBc, [oracleAddr, 9500]);
    log('GatedVault: ' + vaultAddr);

    return { ok: true, oracle: oracleAddr, registry: registryAddr, vault: vaultAddr, logs };
  } catch (e) {
    return { ok: false, error: e.message, logs };
  }
}, { rpc: RPC, pk, registryBc: REGISTRY_BC, vaultBc: VAULT_BC, knownOracle: '0x0bfB6f131A99D5aaA3071618FFBD5bb3ea87C619' });

result.logs.forEach(l => console.log(l));

if (result.ok) {
  console.log('\n=== Deployed ===');
  console.log('StakingOracle:  ', result.oracle);
  console.log('PolicyRegistry: ', result.registry);
  console.log('GatedVault:     ', result.vault);

  const deployments = {
    StakingOracle:   result.oracle,
    PolicyRegistry:  result.registry,
    GatedVault:      result.vault,
  };
  writeFileSync(join(__dir, '../deployments.json'), JSON.stringify(deployments, null, 2));

  console.log('\nAdd to .env:');
  console.log('ORACLE_ADDRESS=' + result.oracle);
  console.log('REGISTRY_ADDRESS=' + result.registry);
} else {
  console.error('Deploy failed:', result.error);
}

await browser.close();
