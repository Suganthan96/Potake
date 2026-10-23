// Deploys StakingOracle, PolicyRegistry and GatedVault, then writes deployments.json.
// Usage: npx hardhat run scripts/deploy.js --network portaldotV3
// Requires DEPLOYER_PRIVATE_KEY (EVM test key) in .env. Never commit the key.
const fs = require("fs");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const relayer = process.env.RELAYER_ADDRESS || deployer.address;
  const agent = process.env.AGENT_ADDRESS || deployer.address;
  const minUptimeBps = Number(process.env.VAULT_MIN_UPTIME_BPS || 9500);

  console.log("Network  :", hre.network.name);
  console.log("Deployer :", deployer.address);
  console.log("Relayer  :", relayer);
  console.log("Agent    :", agent);

  const out = { network: hre.network.name, deployer: deployer.address, contracts: {} };

  async function deploy(name, args) {
    const factory = await hre.ethers.getContractFactory(name);
    const c = await factory.deploy(...args);
    const tx = c.deploymentTransaction();
    await c.waitForDeployment();
    const address = await c.getAddress();
    console.log(`${name.padEnd(15)} ${address}  tx ${tx.hash}`);
    out.contracts[name] = { address, deployTx: tx.hash };
    return address;
  }

  const oracle = await deploy("StakingOracle", [relayer]);
  await deploy("PolicyRegistry", [agent]);
  await deploy("GatedVault", [oracle, minUptimeBps]);

  fs.writeFileSync("deployments.json", JSON.stringify(out, null, 2));
  console.log("Saved deployments.json (put these addresses and tx hashes in the README).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
