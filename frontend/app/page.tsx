'use client';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import WalletButton from '@/components/WalletButton';
import { useAccount } from 'wagmi';
import { ADDRESSES, ORACLE_ABI, EVM_RPC } from '@/lib/contracts';

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [era,        setEra]        = useState<number | null>(null);
  const [validators, setValidators] = useState<number | null>(null);
  const [uptime,     setUptime]     = useState<number | null>(null);
  const [stake,      setStake]      = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const ro     = new ethers.JsonRpcProvider(EVM_RPC);
        const oracle = new ethers.Contract(ADDRESSES.oracle, ORACLE_ABI, ro);
        const [snap, ids] = await Promise.all([oracle.snapshot(), oracle.validatorIds()]);
        setEra(Number(snap.era));
        setValidators(Number(snap.validatorCount));
        setStake(Number(ethers.formatEther(snap.totalStake)).toFixed(2));
        // avg uptime
        const infos = await Promise.all(ids.map((id: string) => oracle.validatorInfo(id)));
        const avg = infos.reduce((s: number, v: any) => s + Number(v.uptimeBps), 0) / infos.length;
        setUptime(Math.round(avg / 100));
      } catch {}
    })();
  }, []);

  // Redirect to oracle dashboard once wallet is connected
  useEffect(() => {
    if (isConnected) router.push('/oracle');
  }, [isConnected, router]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0705', overflow: 'hidden', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column' }}>

      {/* ── TOP NAV ── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 48px', flexShrink: 0, borderBottom: '1px solid rgba(232,224,212,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image src="/potake-icon.png" alt="Potake" width={32} height={32} style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.2em', color: 'var(--cream)' }}>POTAKE</div>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(232,224,212,0.35)', letterSpacing: '0.1em' }}>Staking Policy Automation</div>
          </div>
        </div>
        <WalletButton />
      </nav>

      {/* ── MAIN TWO-COLUMN ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>

        {/* LEFT — all text */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 64px', gap: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(143,185,168,0.7)', marginBottom: 22 }}>STAKING AUTOMATION</div>

          <h1 style={{ fontSize: 'clamp(36px, 4vw, 58px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.02em', color: 'var(--cream)', margin: '0 0 22px' }}>
            Set it once.<br />
            <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>Stay compliant forever.</em>
          </h1>

          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'rgba(232,224,212,0.4)', margin: '0 0 36px', maxWidth: 400 }}>
            Write your staking rules on-chain. Potake reads validator health every era and re-nominates automatically when rules break.
          </p>

          <WalletButton />

          {/* Oracle / Policy / Vault links */}
          <div style={{ display: 'flex', gap: 24, marginTop: 36 }}>
            {['Oracle', 'Policy', 'Vault'].map((l, i) => (
              <button key={l} onClick={() => router.push(`/${l.toLowerCase()}`)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 15, color: i === 0 ? 'var(--cream)' : 'rgba(232,224,212,0.4)', padding: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: i === 0 ? 'var(--teal)' : 'rgba(232,224,212,0.2)', display: 'inline-block', flexShrink: 0 }} />
                {l}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(232,224,212,0.2)', marginTop: 10, letterSpacing: '0.05em' }}>
            {era !== null ? `era ${era} · ${validators} validators · ${uptime}% avg uptime` : 'connecting to oracle…'}
          </div>

          {/* live stats row */}
          <div style={{ display: 'flex', gap: 36, marginTop: 40, paddingTop: 28, borderTop: '1px solid rgba(232,224,212,0.07)' }}>
            <LiveStat label="LIVE ERA" value={era !== null ? String(era) : '—'} dot />
            <LiveStat label="VALIDATORS" value={validators !== null ? String(validators) : '—'} />
            <LiveStat label="TOTAL STAKE" value={stake !== null ? `${stake} tPOT` : '—'} />
          </div>
        </div>

        {/* RIGHT — pot only */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
          {/* glow */}
          <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(143,185,168,0.10) 0%, rgba(90,55,20,0.13) 55%, transparent 75%)', filter: 'blur(80px)', pointerEvents: 'none' }} />
          <Image
            src="/potake-icon.png"
            alt="Potake ceramic pot"
            width={800}
            height={800}
            priority
            style={{ width: 'min(800px, 95%)', height: 'auto', position: 'relative', userSelect: 'none' }}
          />
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{ padding: '14px 48px', display: 'flex', justifyContent: 'space-between', flexShrink: 0, borderTop: '1px solid rgba(232,224,212,0.07)' }}>
        <div style={{ display: 'flex', gap: 28, fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.1em', color: 'rgba(232,224,212,0.22)' }}>
          <span>CHAIN ID 420420777</span>
          <span>pallet-revive · PolkaVM</span>
          <span>Portaldot V3 Hacker House</span>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(232,224,212,0.18)', letterSpacing: '0.1em' }}>
          {ADDRESSES.oracle.slice(0, 14)}…
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #8FB9A8; }
          50%       { opacity: 0.4; box-shadow: none; }
        }
      `}</style>
    </div>
  );
}

function LiveStat({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#8FB9A8', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite', flexShrink: 0 }} />}
        <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(232,224,212,0.35)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 400, color: 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
    </div>
  );
}
