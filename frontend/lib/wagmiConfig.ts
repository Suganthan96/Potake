import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';
import { QueryClient } from '@tanstack/react-query';
import { CHAIN_ID, EVM_RPC } from './contracts';

export const portaldotV3 = defineChain({
  id: CHAIN_ID,
  name: 'Portaldot V3 Testnet',
  nativeCurrency: { name: 'tPOT', symbol: 'tPOT', decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
  blockExplorers: { default: { name: 'Explorer', url: '' } },
  testnet: true,
});

export const wagmiConfig = getDefaultConfig({
  appName: 'Potake',
  // Replace with a real WalletConnect project ID from cloud.walletconnect.com
  // Injected wallets (MetaMask, Talisman) work without one.
  projectId: 'potake-demo-placeholder',
  chains: [portaldotV3],
  ssr: true,
});

export const queryClient = new QueryClient();
