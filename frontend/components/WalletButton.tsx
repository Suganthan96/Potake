'use client';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

interface Props {
  compact?: boolean;
}

export default function WalletButton({ compact }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <ConnectButton.Custom>
      {({ openConnectModal, connectModalOpen }) => (
        <button
          onClick={openConnectModal}
          disabled={connectModalOpen}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
            padding: compact
              ? '0.35rem 48px 0.35rem 0.85rem'
              : '0.55rem 56px 0.55rem 1.1rem',
            background: hovered
              ? 'linear-gradient(to top right, #d4c5a9, #e8dcc8)'
              : 'linear-gradient(to top right, #E8E0D4, #f5efe6)',
            color: '#1a1510',
            fontSize: compact ? 10 : 12,
            whiteSpace: 'nowrap',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            cursor: connectModalOpen ? 'not-allowed' : 'pointer',
            border: 'none',
            boxShadow: hovered
              ? '0 4px 30px rgba(232,224,212,0.15)'
              : '0 4px 6px -1px rgba(0,0,0,0.3)',
            transition: 'all 0.4s ease',
            opacity: connectModalOpen ? 0.7 : 1,
            fontFamily: 'monospace',
            borderRadius: 0,
            minWidth: compact ? 130 : 160,
            width: 'fit-content',
          }}
        >
          Connect Wallet

          {/* right icon panel */}
          <span style={{
            background: '#d4c5a9',
            display: 'grid',
            position: 'absolute',
            right: 0,
            placeItems: 'center',
            width: compact ? '2rem' : '2.5rem',
            height: '100%',
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
              width={compact ? 13 : 15} height={compact ? 13 : 15}
              fill="none" stroke="#1a1510" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M16 12h2" />
              <path d="M2 9h20" />
            </svg>
          </span>
        </button>
      )}
    </ConnectButton.Custom>
  );
}
