import 'dotenv/config';

export const SUBSTRATE_WS   = process.env.SUBSTRATE_WS   || 'wss://test-node-v3.portaldot.dev';
export const EVM_RPC         = process.env.EVM_RPC         || 'https://test-evm-rpc-v3.portaldot.dev';
export const CHAIN_ID        = Number(process.env.CHAIN_ID  || 420420777);
export const RELAYER_KEY     = process.env.RELAYER_PRIVATE_KEY;
export const AGENT_SEED      = process.env.AGENT_SEED;
export const ORACLE_ADDRESS  = process.env.ORACLE_ADDRESS;
export const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
export const MANAGED_ACCOUNTS    = (process.env.MANAGED_ACCOUNTS || '').split(',').filter(Boolean);
export const STAKING_ACCOUNT_SS58 = process.env.STAKING_ACCOUNT_SS58 || '';
