'use client';
import { useState } from 'react';
import { ethers } from 'ethers';
import { useDashboard } from '../DashboardContext';
import { ADDRESSES, VAULT_ABI, EVM_RPC } from '@/lib/contracts';
import TxLink from '@/components/TxLink';

const fmt   = (v: bigint, d = 4) => Number(ethers.formatEther(v)).toFixed(d);
const bps   = (n: number) => `${(n / 100).toFixed(0)}%`;
const short = (s: string) => s.slice(0, 6) + '…' + s.slice(-4);

export default function VaultPage() {
  const { address, provider, snap, vaultMinUptime } = useDashboard();

  const [depositIdx, setDepositIdx] = useState(0);
  const [depositAmt, setDepositAmt] = useState('0.001');
  const [balances,   setBalances]   = useState<Record<string, bigint>>({});
  const [tx,         setTx]         = useState('');
  const [err,        setErr]        = useState('');
  const [busy,       setBusy]       = useState(false);

  const submit = async () => {
    if (!provider || !snap) return;
    setErr(''); setTx(''); setBusy(true);
    try {
      const signer = await provider.getSigner();
      const vault  = new ethers.Contract(ADDRESSES.vault, VAULT_ABI, signer);
      const vid    = snap.validators[depositIdx]?.id;
      if (!vid) throw new Error('No validator selected');
      const t = await signer.sendTransaction({
        to: ADDRESSES.vault,
        data: vault.interface.encodeFunctionData('deposit', [vid]),
        value: ethers.parseEther(depositAmt),
        type: 0,
      });
      setTx(t.hash);
      await t.wait();
      const ro  = new ethers.JsonRpcProvider(EVM_RPC);
      const v2  = new ethers.Contract(ADDRESSES.vault, VAULT_ABI, ro);
      const bal = await v2.balanceOf(address, vid);
      setBalances(prev => ({ ...prev, [vid]: bal }));
    } catch (e: any) { setErr(e.message ?? 'Transaction failed'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.15em', color: 'rgba(143,185,168,0.6)' }}>// GATED VAULT</div>

      <div style={{ border: '1px solid rgba(232,224,212,0.08)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[['ADDRESS', short(ADDRESSES.vault)], ['GATE: MIN UPTIME', bps(vaultMinUptime)], ['ORACLE', short(ADDRESSES.oracle)]].map(([l, v]) => (
          <div key={l}>
            <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.1em', color: 'rgba(232,224,212,0.35)', marginBottom: 4 }}>{l}</div>
            <div style={{ fontFamily: 'var(--font)', fontSize: 16, color: 'var(--cream)' }}>{v}</div>
          </div>
        ))}
      </div>

      {!address ? (
        <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(232,224,212,0.4)' }}>Connect wallet to deposit.</p>
      ) : snap ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(232,224,212,0.4)' }}>SELECT VALIDATOR</label>
            <select value={depositIdx} onChange={e => setDepositIdx(Number(e.target.value))}
              style={{ background: 'rgba(232,224,212,0.04)', border: '1px solid rgba(232,224,212,0.12)', color: 'var(--cream)', padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, outline: 'none', borderRadius: 0, width: '100%' }}>
              {snap.validators.map((v, i) => (
                <option key={v.id} value={i} style={{ background: '#0d1117' }}>
                  V{i} — {(v.uptimeBps/100).toFixed(0)}% uptime {v.healthy ? '✓' : '✗'}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(232,224,212,0.4)' }}>AMOUNT (tPOT)</label>
            <input value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
              style={{ background: 'rgba(232,224,212,0.04)', border: '1px solid rgba(232,224,212,0.12)', color: 'var(--cream)', padding: '9px 12px', fontFamily: 'monospace', fontSize: 13, outline: 'none', borderRadius: 0, width: '100%' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(232,224,212,0.3)' }}>e.g. 0.001</span>
          </div>

          <button onClick={submit} disabled={busy} style={{
            background: busy ? 'rgba(243,163,93,0.3)' : 'var(--orange)',
            color: busy ? 'rgba(8,11,18,0.4)' : '#08090f',
            border: 'none', padding: '13px 0', fontFamily: 'var(--font)', fontSize: 16,
            cursor: busy ? 'not-allowed' : 'pointer', width: '100%',
          }}>
            {busy ? 'DEPOSITING…' : 'DEPOSIT'}
          </button>

          {snap.validators[depositIdx] && balances[snap.validators[depositIdx].id] !== undefined && (
            <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(232,224,212,0.5)' }}>
              Your balance: {fmt(balances[snap.validators[depositIdx].id])} tPOT
            </p>
          )}
          {tx  && <TxLink hash={tx} />}
          {err && <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--orange)' }}>{err}</p>}
        </div>
      ) : (
        <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(232,224,212,0.3)' }}>Loading vault…</p>
      )}
    </div>
  );
}
