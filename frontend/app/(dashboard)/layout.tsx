'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useAccount, useDisconnect } from 'wagmi';
import { DashboardProvider, useDashboard } from './DashboardContext';
import Image from 'next/image';
import WalletButton from '@/components/WalletButton';

const WorldCanvas = dynamic(() => import('@/components/WorldCanvas'), { ssr: false });

const short = (s: string) => s.slice(0, 6) + '…' + s.slice(-4);

const TABS = [
  { href: '/oracle', label: 'ORACLE' },
  { href: '/policy', label: 'POLICY' },
  { href: '/vault',  label: 'VAULT'  },
];

function DashboardShell({ children }: { children: ReactNode }) {
  const { snap, policy, loading } = useDashboard();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const pathname = usePathname();

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#07090f' }}>

      {/* ── NAV ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52, flexShrink: 0,
        borderBottom: '1px solid rgba(232,224,212,0.08)',
        background: 'rgba(7,9,15,0.9)', backdropFilter: 'blur(12px)',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 32, textDecoration: 'none' }}>
            <Image src="/potake-icon.png" alt="Potake" width={28} height={28} style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.2em', color: 'var(--cream)' }}>POTAKE</span>
          </Link>
          {TABS.map(t => {
            const active = pathname === t.href;
            return (
              <Link key={t.href} href={t.href} style={{
                fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.15em', textDecoration: 'none',
                color: active ? 'var(--cream)' : 'rgba(232,224,212,0.35)',
                padding: '0 18px', height: 52, display: 'flex', alignItems: 'center',
                borderBottom: active ? '2px solid var(--orange)' : '2px solid transparent',
                transition: 'color 0.2s',
              }}>
                {`// ${t.label}`}
              </Link>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {loading && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(143,185,168,0.6)', letterSpacing: '0.1em' }}>SYNCING…</span>}
          {snap && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(143,185,168,0.7)', border: '1px solid rgba(143,185,168,0.2)', padding: '4px 10px', letterSpacing: '0.1em' }}>ERA {snap.era}</span>}
          {isConnected && address ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(232,224,212,0.5)', border: '1px solid rgba(232,224,212,0.12)', borderRight: 'none', padding: '6px 14px' }}>
                {short(address)}
              </div>
              <button
                onClick={() => disconnect()}
                title="Disconnect wallet"
                style={{
                  background: 'rgba(232,224,212,0.04)',
                  border: '1px solid rgba(232,224,212,0.12)',
                  color: 'rgba(232,224,212,0.4)',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                  borderRadius: 0,
                  transition: 'all 0.2s',
                  lineHeight: 1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#F3A35D'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(243,163,93,0.3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(232,224,212,0.4)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(232,224,212,0.12)'; }}
              >
                ×
              </button>
            </div>
          ) : <WalletButton compact />
          }
        </div>
      </nav>

      {/* ── MAIN: 3D left + page content right ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* 3D canvas — always visible */}
        <div style={{ flex: '1 1 0', position: 'relative', overflow: 'hidden' }}>
          <WorldCanvas
            validators={snap?.validators ?? []}
            era={snap?.era ?? 0}
            totalStake={snap?.totalStake ?? BigInt(0)}
            hasPolicy={policy?.active ?? false}
          />
        </div>

        {/* page panel */}
        <div style={{
          width: 400, flexShrink: 0,
          borderLeft: '1px solid rgba(232,224,212,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'rgba(7,9,15,0.95)',
        }}>
          {children}
        </div>

      </div>

      {/* ── STATUS BAR ── */}
      <div style={{
        height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', flexShrink: 0,
        borderTop: '1px solid rgba(232,224,212,0.07)',
        background: 'rgba(7,9,15,0.95)',
      }}>
        <div style={{ display: 'flex', gap: 24, fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.1em', color: 'rgba(232,224,212,0.3)' }}>
          <span>PORTALDOT V3</span>
          <span>CHAIN ID 420420777</span>
          {snap && <span>{snap.validatorCount} VALIDATORS</span>}
          {policy?.active && <span style={{ color: 'rgba(143,185,168,0.6)' }}>POLICY ACTIVE</span>}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.1em', color: 'rgba(232,224,212,0.2)' }}>
          pallet-revive · PolkaVM
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  );
}
