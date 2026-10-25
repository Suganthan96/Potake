const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "tPOT");

  // 1. StakingOracle
  console.log("\nDeploying StakingOracle...");
  const Oracle = await ethers.getContractFactory("StakingOracle");
  const oracle = await Oracle.deploy(deployer.address);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log("StakingOracle:", oracleAddr);

  // 2. PolicyRegistry
  console.log("\nDeploying PolicyRegistry...");
  const Registry = await ethers.getContractFactory("PolicyRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("PolicyRegistry:", registryAddr);

  // 3. GatedVault
  console.log("\nDeploying GatedVault...");
  const Vault = await ethers.getContractFactory("GatedVault");
  const vault = await Vault.deploy(oracleAddr, 9500);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("GatedVault:", vaultAddr);

  // Save deployments
  const deployments = { StakingOracle: oracleAddr, PolicyRegistry: registryAddr, GatedVault: vaultAddr };
  fs.writeFileSync(path.join(__dirname, "../deployments.json"), JSON.stringify(deployments, null, 2));
  console.log("\ndeployments.json written.");
  console.log("\nAdd to .env:");
  console.log("ORACLE_ADDRESS=" + oracleAddr);
  console.log("REGISTRY_ADDRESS=" + registryAddr);
}

main().catch(e => { console.error(e); process.exit(1); });
