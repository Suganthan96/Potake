#!/usr/bin/env node
import { runRelayer }                         from './relayer/era-watcher.mjs';
import { runAgent }                           from './agent/index.mjs';
import { getApi, disconnect }                 from './chain/substrate.mjs';
import { getProvider, getOracleContract }     from './chain/evm.mjs';
import { ORACLE_ADDRESS }                     from './config.mjs';

const cmd        = process.argv[2];
const args       = process.argv.slice(3);
const flagDryRun = args.includes('--dry-run');
const keystoreArg = args.find(a => !a.startsWith('--'));

switch (cmd) {
  case 'relay':
    await runRelayer();
    // relayer runs indefinitely; no disconnect
    break;

  case 'agent': {
    // Usage: potake agent [keystore.json] [--dry-run]
    // If no keystore is given, runs in evaluate-only (dry-run) mode.
    let password;
    if (keystoreArg && !flagDryRun) {
      const { createInterface } = await import('readline');
      if (process.env.ACCOUNT_PASSWORD) {
        password = process.env.ACCOUNT_PASSWORD;
      } else {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        password = await new Promise(r => rl.question('Keystore password: ', ans => { rl.close(); r(ans); }));
      }
    }
    await runAgent({ keystorePath: keystoreArg, password, dryRun: flagDryRun });
    await disconnect();
    process.exit(0);
    break;
  }

  case 'status':
    await printStatus();
    await disconnect();
    process.exit(0);
    break;

  default:
    console.log('Usage: potake <command>');
    console.log('  relay                Watch eras and publish staking snapshots to the oracle');
    console.log('  agent [keystore]     Evaluate policy, nominate if needed, log action');
    console.log('    --dry-run          Evaluate only, do not submit any transactions');
    console.log('  status               Print current chain era, oracle era, and validator count');
    process.exit(1);
}

async function printStatus() {
  const api      = await getApi();
  const provider = getProvider();
  const oracle   = ORACLE_ADDRESS ? getOracleContract(provider) : null;

  // --- chain side ---
  let chainEra = '?';
  let validatorCount = '?';
  try {
    const activeEraOpt = await api.query.staking.activeEra();
    if (activeEraOpt.isSome) chainEra = Number(activeEraOpt.unwrap().index);
    const sv = await api.query.session.validators();
    validatorCount = sv.length;
  } catch {}

  // --- oracle side ---
  let oracleEra = 'n/a (ORACLE_ADDRESS not set)';
  let snap = null;
  if (oracle) {
    try {
      oracleEra = Number(await oracle.latestEra());
      if (oracleEra > 0) snap = await oracle.snapshot();
    } catch (e) {
      oracleEra = `error: ${e.message}`;
    }
  }

  console.log('=== Potake Status ===');
  console.log(`Chain era:          ${chainEra}`);
  console.log(`Active validators:  ${validatorCount}`);
  console.log(`Oracle era:         ${oracleEra}`);
  if (typeof oracleEra === 'number' && typeof chainEra === 'number') {
    console.log(`Synced:             ${oracleEra >= chainEra ? 'yes' : 'no — relayer behind'}`);
  }
  if (snap && snap.era > 0) {
    console.log(`Oracle validators:  ${snap.validatorCount}`);
    console.log(`Total stake:        ${snap.totalStake}`);
    console.log(`Relayed at:         ${new Date(Number(snap.relayedAt) * 1000).toISOString()}`);
  }
}
