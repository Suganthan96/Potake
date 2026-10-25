export const CHAIN_ID   = 420420777;
export const EVM_RPC    = 'https://test-evm-rpc-v3.portaldot.dev';

export const ADDRESSES = {
  oracle:   '0x0bfB6f131A99D5aaA3071618FFBD5bb3ea87C619',
  registry: '0x68283AAa8899A4aA299141ca6f04dF8e5802509f',
  vault:    '0x9d80B22A0D2da86AA1406c1d587cd2E94793429c',
} as const;

export const ORACLE_ABI = [
  'function latestEra() view returns (uint32)',
  'function snapshot() view returns (tuple(uint32 era, uint64 relayedAt, uint16 validatorCount, bytes32 validatorSetHash, uint256 totalStake, uint256 eraReward))',
  'function validatorIds() view returns (bytes32[])',
  'function validatorInfo(bytes32) view returns (tuple(uint128 totalStake, uint16 commissionBps, uint16 uptimeBps, bool active))',
  'function isHealthy(bytes32, uint16) view returns (bool)',
  'function stakeShareBps(bytes32) view returns (uint16)',
];

export const REGISTRY_ABI = [
  'function setPolicy(bytes32 stakingAccount, uint16 maxShareBps, uint16 minUptimeBps, uint8 maxValidators) external',
  'function policies(address) view returns (bytes32 stakingAccount, uint16 maxShareBps, uint16 minUptimeBps, uint8 maxValidators, uint32 version, bool active)',
  'function actionCount(bytes32) view returns (uint256)',
];

export const VAULT_ABI = [
  'function minUptimeBps() view returns (uint16)',
  'function staking() view returns (address)',
  'function balanceOf(address, bytes32) view returns (uint256)',
  'function deposit(bytes32 validator) external payable',
  'function withdraw(bytes32 validator, uint256 amount) external',
];

export const PORTALDOT_NETWORK = {
  chainId:         `0x${CHAIN_ID.toString(16)}`,
  chainName:       'Portaldot V3 Testnet',
  nativeCurrency:  { name: 'tPOT', symbol: 'tPOT', decimals: 18 },
  rpcUrls:         [EVM_RPC],
  blockExplorerUrls: [],
};
