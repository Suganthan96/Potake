'use client';
import { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig, queryClient } from '@/lib/wagmiConfig';
import '@rainbow-me/rainbowkit/styles.css';

const rkTheme = darkTheme({
  accentColor: '#F3A35D',
  accentColorForeground: '#08090f',
  borderRadius: 'none',
  fontStack: 'system',
  overlayBlur: 'small',
});

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
