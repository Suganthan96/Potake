'use client';
import { useDashboard } from '../DashboardContext';
import { ethers } from 'ethers';
import { useEffect, useState } from 'react';
import { ADDRESSES, REGISTRY_ABI, EVM_RPC } from '@/lib/contracts';

const fmt   = (v: bigint, d = 2) => (Number(v) / 1e14).toFixed(d);
const bps   = (n: number) => `${(n / 100).toFixed(0)}%`;
const short = (s: string) => s.slice(0, 6) + '…' + s.slice(-4);

export default function OraclePage() {
  const { snap, policy, loading, vaultMinUptime, address } = useDashboard();
  const [actionCount, setActionCount] = useState<number | null>(null);

  // Poll actionCount every 15s when wallet connected + policy active
  useEffect(() => {
    if (!address || !policy?.active) return;
    const load = async () => {
      try {
        const ro  = new ethers.JsonRpcProvider(EVM_RPC);
        const reg = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, ro);
        // actionCount keyed by stakingAccount (bytes32 version of address)
        // Use policy.stakingAccount (bytes32 public key) — not the zero-padded EVM address
        const stakingKey = policy?.stakingAccount ?? ethers.zeroPadValue(address, 32);
        const count = await reg.actionCount(stakingKey);
        setActionCount(Number(count));
      } catch {}
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [address, policy]);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.15em', color: 'rgba(143,185,168,0.6)' }}>// ORACLE STATUS</div>

      {loading && <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(232,224,212,0.3)' }}>Loading oracle…</p>}

      {/* Agent action counter — proof the agent has acted */}
      {policy?.active && (
        <div style={{ border: '1px solid rgba(143,185,168,0.2)', background: 'rgba(143,185,168,0.04)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(143,185,168,0.6)' }}>AGENT NOMINATIONS (on-chain)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font)', fontSize: 32, color: '#8FB9A8', lineHeight: 1 }}>
              {actionCount ?? '—'}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(143,185,168,0.5)' }}>
              times auto-renominated
            </span>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(232,224,212,0.3)' }}>
            registry.actionCount · updates every era · verifiable on-chain
          </div>
        </div>
      )}

      {snap && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, border: '1px solid rgba(232,224,212,0.08)' }}>
            {[['ERA', snap.era.toString()], ['VALIDATORS', snap.validatorCount.toString()], ['TOTAL STAKE', `${fmt(snap.totalStake)} tPOT`], ['VAULT MIN', bps(vaultMinUptime)]].map(([l, v]) => (
              <div key={l} style={{ padding: '12px 14px', background: 'rgba(232,224,212,0.03)', borderBottom: '1px solid rgba(232,224,212,0.06)' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(232,224,212,0.4)', marginBottom: 5 }}>{l}</div>
                <div style={{ fontFamily: 'var(--font)', fontSize: 18, color: 'var(--cream)' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(232,224,212,0.35)' }}>VALIDATORS</div>
          {snap.validators.map((v, i) => (
            <div key={v.id} style={{ border: `1px solid ${v.healthy ? 'rgba(143,185,168,0.2)' : 'rgba(232,224,212,0.07)'}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(232,224,212,0.4)' }}>V{i}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.08em', color: v.healthy ? '#8FB9A8' : '#F3A35D', border: `1px solid ${v.healthy ? 'rgba(143,185,168,0.3)' : 'rgba(243,163,93,0.3)'}`, padding: '2px 6px' }}>
                  {v.healthy ? 'HEALTHY' : 'UNHEALTHY'}
                </span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(232,224,212,0.3)', wordBreak: 'break-all' }}>{v.id.slice(0, 16)}…</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[['UPTIME', `${(v.uptimeBps/100).toFixed(0)}%`], ['COMM', `${(v.commissionBps/100).toFixed(0)}%`], ['SHARE', `${(v.shareBps/100).toFixed(1)}%`]].map(([l, val]) => (
                  <div key={l}>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.1em', color: 'rgba(232,224,212,0.35)', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontFamily: 'var(--font)', fontSize: 15, color: 'var(--cream)' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 2, background: 'rgba(232,224,212,0.07)' }}>
                <div style={{ height: '100%', width: `${v.uptimeBps / 100}%`, background: v.healthy ? '#8FB9A8' : '#F3A35D', transition: 'width 0.6s' }} />
              </div>
            </div>
          ))}

          <div style={{ border: '1px solid rgba(232,224,212,0.08)' }}>
            {[['ORACLE', ADDRESSES.oracle], ['REGISTRY', ADDRESSES.registry], ['VAULT', ADDRESSES.vault]].map(([l, a]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid rgba(232,224,212,0.06)' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.1em', color: 'rgba(232,224,212,0.35)' }}>{l}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(232,224,212,0.6)' }}>{short(a)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
