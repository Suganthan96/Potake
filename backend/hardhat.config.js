require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  mocha: {
    timeout: 60000,
  },
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 1 }, evmVersion: "paris" },
  },
  networks: {
    portaldotV3: {
      url: process.env.EVM_RPC || "https://test-evm-rpc-v3.portaldot.dev",
      chainId: 420420777,
      accounts,
      // Revive's eth_estimateGas returns Substrate weight (refTime), not EVM gas.
      // Must use "auto" so Hardhat passes the weight value as gasLimit; a fixed cap causes "Invalid Transaction".
      gas: "auto",
      gasPrice: 40_000,
    },
  },
};
