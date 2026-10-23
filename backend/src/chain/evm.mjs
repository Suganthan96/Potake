import { ethers } from 'ethers';
import { EVM_RPC, RELAYER_KEY, ORACLE_ADDRESS, REGISTRY_ADDRESS } from '../config.mjs';

// Minimal ABIs — avoids depending on compiled artifacts being present
const ORACLE_ABI = [
  'function latestEra() view returns (uint32)',
  'function snapshot() view returns (tuple(uint32 era, uint64 relayedAt, uint16 validatorCount, bytes32 validatorSetHash, uint256 totalStake, uint256 eraReward))',
  'function validatorIds() view returns (bytes32[])',
  'function validatorInfo(bytes32) view returns (tuple(uint128 totalStake, uint16 commissionBps, uint16 uptimeBps, bool active))',
  'function isHealthy(bytes32, uint16) view returns (bool)',
  'function stakeShareBps(bytes32) view returns (uint16)',
  'function publish(uint32 era, uint256 totalStake, uint256 eraReward, bytes32[] ids, tuple(uint128 totalStake, uint16 commissionBps, uint16 uptimeBps, bool active)[] infos)',
  'event SnapshotPublished(uint32 indexed era, bytes32 validatorSetHash, uint256 totalStake, uint16 validatorCount)',
];

const REGISTRY_ABI = [
  'function policies(address) view returns (bytes32 stakingAccount, uint16 maxShareBps, uint16 minUptimeBps, uint8 maxValidators, uint32 version, bool active)',
  'function actionCount(bytes32) view returns (uint256)',
  'function getAction(bytes32, uint256) view returns (tuple(uint32 era, uint32 policyVersion, uint8 ruleBroken, bytes32 extrinsicHash, bytes32 fromSetHash, bytes32 toSetHash, uint64 loggedAt))',
  'function logAction(address policyOwner, uint32 era, uint32 policyVersion, uint8 ruleBroken, bytes32 extrinsicHash, bytes32 fromSetHash, bytes32 toSetHash)',
  'event ActionLogged(bytes32 indexed stakingAccount, address indexed policyOwner, uint32 era, uint32 policyVersion, uint8 ruleBroken, bytes32 extrinsicHash, bytes32 fromSetHash, bytes32 toSetHash)',
];

export function getProvider() {
  return new ethers.JsonRpcProvider(EVM_RPC);
}

export function getRelayerSigner() {
  if (!RELAYER_KEY) throw new Error('RELAYER_PRIVATE_KEY not set in .env');
  return new ethers.Wallet(RELAYER_KEY, getProvider());
}

export function getOracleContract(signerOrProvider) {
  if (!ORACLE_ADDRESS) throw new Error('ORACLE_ADDRESS not set in .env');
  return new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, signerOrProvider);
}

export function getRegistryContract(signerOrProvider) {
  if (!REGISTRY_ADDRESS) throw new Error('REGISTRY_ADDRESS not set in .env');
  return new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signerOrProvider);
}
