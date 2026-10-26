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
        setStake((Number(snap.totalStake) / 1e14).toFixed(2));
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
    <div style={{ background: '#0a0705', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

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
      <div className="hero-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 'calc(100vh - 80px)' }}>

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

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '100px 64px', borderTop: '1px solid rgba(232,224,212,0.07)' }}>
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(143,185,168,0.7)', marginBottom: 16 }}>HOW IT WORKS</div>
        <h2 style={{ fontSize: 'clamp(28px, 3vw, 42px)', fontWeight: 400, color: 'var(--cream)', margin: '0 0 64px', letterSpacing: '-0.02em', maxWidth: 520 }}>
          Four steps. Fully autonomous.
        </h2>
        <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(232,224,212,0.07)' }}>
          {[
            { step: '01', label: 'Set Policy', desc: 'Write your staking rules on-chain — min validator uptime, max stake concentration, max nominations. One EVM transaction.', color: 'var(--teal)' },
            { step: '02', label: 'Bond Funds', desc: 'Bond tPOT into staking on the Substrate side. The agent auto-bonds the minimum required amount if you skip this step.', color: 'var(--orange)' },
            { step: '03', label: 'Agent Monitors', desc: 'Every era the agent reads your policy + live oracle data + current nominations. If all rules pass, nothing changes.', color: 'var(--cream)' },
            { step: '04', label: 'Auto Re-Nominate', desc: 'On any violation the agent picks a compliant set, submits staking.nominate, and logs the action on-chain as immutable proof.', color: 'var(--orange)' },
          ].map(({ step, label, desc, color }) => (
            <div key={step} style={{ background: '#0a0705', padding: '40px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(232,224,212,0.2)', letterSpacing: '0.15em' }}>{step}</div>
              <div style={{ width: 32, height: 1, background: color }} />
              <div style={{ fontSize: 17, fontWeight: 400, color: 'var(--cream)', letterSpacing: '-0.01em' }}>{label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(232,224,212,0.4)' }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── THREE FEATURES ── */}
      <section style={{ padding: '0 64px 100px', borderTop: '1px solid rgba(232,224,212,0.07)' }}>
        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, paddingTop: 64 }}>

          {/* Oracle */}
          <div style={{ border: '1px solid rgba(232,224,212,0.09)', padding: '40px 36px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(143,185,168,0.6)' }}>ORACLE</div>
            <div style={{ fontSize: 22, fontWeight: 400, color: 'var(--cream)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>Live validator<br />data on EVM</div>
            <div style={{ fontSize: 13, lineHeight: 1.75, color: 'rgba(232,224,212,0.38)', flex: 1 }}>
              Portaldot V3 has no staking precompiles. Potake's relayer bridges erasStakers from Substrate into StakingOracle every era — making validator uptime, stake share, and commission readable by any Solidity contract via the IStakingView interface.
            </div>
            <div style={{ borderTop: '1px solid rgba(232,224,212,0.07)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[`ERA ${era ?? '—'}`, `${validators ?? '—'} VALIDATORS`, `${stake ?? '—'} tPOT STAKED`].map(s => (
                <div key={s} style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(232,224,212,0.3)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#8FB9A8', flexShrink: 0 }} />
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Policy */}
          <div style={{ border: '1px solid rgba(232,224,212,0.09)', padding: '40px 36px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(243,163,93,0.6)' }}>POLICY</div>
            <div style={{ fontSize: 22, fontWeight: 400, color: 'var(--cream)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>Your rules,<br />stored on-chain</div>
            <div style={{ fontSize: 13, lineHeight: 1.75, color: 'rgba(232,224,212,0.38)', flex: 1 }}>
              Define staking rules as a PolicyRegistry entry under your EVM address. The agent reads these rules every era — not a config file, not a server setting — actual on-chain state. Update any time with a single transaction.
            </div>
            <div style={{ borderTop: '1px solid rgba(232,224,212,0.07)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['MIN UPTIME THRESHOLD', 'MAX STAKE CONCENTRATION', 'MAX VALIDATOR COUNT'].map(s => (
                <div key={s} style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(232,224,212,0.3)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#F3A35D', flexShrink: 0 }} />
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Audit Trail */}
          <div style={{ border: '1px solid rgba(232,224,212,0.09)', padding: '40px 36px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(232,224,212,0.4)' }}>AUDIT TRAIL</div>
            <div style={{ fontSize: 22, fontWeight: 400, color: 'var(--cream)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>Every action<br />proved on-chain</div>
            <div style={{ fontSize: 13, lineHeight: 1.75, color: 'rgba(232,224,212,0.38)', flex: 1 }}>
              Each nomination change is logged in PolicyRegistry: the era, the rule that broke, the Substrate extrinsic hash, and the before/after validator sets. actionCount(stakingKey) is publicly queryable — immutable proof the agent acted without human input.
            </div>
            <div style={{ borderTop: '1px solid rgba(232,224,212,0.07)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['EXTRINSIC HASH LOGGED', 'ERA + RULE RECORDED', 'BEFORE / AFTER SETS'].map(s => (
                <div key={s} style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(232,224,212,0.3)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(232,224,212,0.3)', flexShrink: 0 }} />
                  {s}
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── CTA STRIP ── */}
      <section style={{ borderTop: '1px solid rgba(232,224,212,0.07)', padding: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(143,185,168,0.7)', marginBottom: 14 }}>BUILT ON PORTALDOT V3</div>
          <div style={{ fontSize: 'clamp(22px, 2.5vw, 34px)', fontWeight: 400, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
            pallet-revive · PolkaVM · <em style={{ color: 'var(--orange)', fontStyle: 'italic' }}>deployed.</em>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <WalletButton />
        </div>
      </section>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #8FB9A8; }
          50%       { opacity: 0.4; box-shadow: none; }
        }
        @media (max-width: 900px) {
          .steps-grid { grid-template-columns: 1fr 1fr !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .hero-grid { grid-template-columns: 1fr !important; }
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
