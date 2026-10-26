'use client';
import { useState } from 'react';
import { ethers } from 'ethers';
import { useDashboard } from '../DashboardContext';
import { ADDRESSES, REGISTRY_ABI } from '@/lib/contracts';
import TxLink from '@/components/TxLink';

const bps = (n: number) => `${(n / 100).toFixed(0)}%`;

export default function PolicyPage() {
  const { address, provider, policy, reloadPolicy } = useDashboard();

  const [pMaxShare,  setPMaxShare]  = useState('5000');
  const [pMinUptime, setPMinUptime] = useState('9000');
  const [pMaxVal,    setPMaxVal]    = useState('16');
  const [pStaking,   setPStaking]   = useState('');
  const [tx,         setTx]         = useState('');
  const [err,        setErr]        = useState('');
  const [busy,       setBusy]       = useState(false);

  const submit = async () => {
    if (!provider || !address) return;
    setErr(''); setTx(''); setBusy(true);
    try {
      const signer = await provider.getSigner();
      const reg = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, signer);
      let stakingBytes32: string;
      if (pStaking.trim()) {
        // Decode SS58 → 32-byte public key using base58check (no BigInt literals)
        const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const addr = pStaking.trim();
        // Accumulate as byte array to avoid BigInt
        const bytes = new Uint8Array(35);
        for (const c of addr) {
          const idx = BASE58.indexOf(c);
          if (idx < 0) throw new Error('Invalid SS58 character');
          let carry = idx;
          for (let i = 34; i >= 0; i--) {
            carry += 58 * bytes[i];
            bytes[i] = carry & 0xff;
            carry >>= 8;
          }
        }
        // bytes = [1 prefix byte][32 pubkey bytes][2 checksum bytes]
        stakingBytes32 = '0x' + Array.from(bytes.slice(1, 33)).map(b => b.toString(16).padStart(2, '0')).join('');
      } else {
        stakingBytes32 = ethers.zeroPadValue(address, 32);
      }
      const t = await signer.sendTransaction({
        to: ADDRESSES.registry,
        data: reg.interface.encodeFunctionData('setPolicy', [stakingBytes32, Number(pMaxShare), Number(pMinUptime), Number(pMaxVal)]),
        type: 0,
      });
      setTx(t.hash);
      await t.wait();
      reloadPolicy();
    } catch (e: any) { setErr(e.message ?? 'Transaction failed'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.15em', color: 'rgba(143,185,168,0.6)' }}>// POLICY REGISTRY</div>

      {policy?.active && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(143,185,168,0.2)', padding: '10px 14px', background: 'rgba(143,185,168,0.04)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8FB9A8', display: 'inline-block' }} />
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#8FB9A8', letterSpacing: '0.08em' }}>ACTIVE v{policy.version}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(232,224,212,0.45)', marginLeft: 6 }}>
            {bps(policy.maxShareBps)} max · {bps(policy.minUptimeBps)} min uptime · {policy.maxValidators} validators
          </span>
        </div>
      )}

      {!address ? (
        <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(232,224,212,0.4)' }}>Connect wallet to manage policy.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="MAX SHARE BPS"    hint="e.g. 5000 = 50%"   value={pMaxShare}  onChange={setPMaxShare} />
          <Field label="MIN UPTIME BPS"   hint="e.g. 9000 = 90%"   value={pMinUptime} onChange={setPMinUptime} />
          <Field label="MAX VALIDATORS"   hint="0 = no limit"       value={pMaxVal}    onChange={setPMaxVal} />
          <Field label="STAKING ACCOUNT (SS58, optional)" hint="Leave blank for EVM address" value={pStaking} onChange={setPStaking} />

          <button onClick={submit} disabled={busy} style={{
            background: busy ? 'rgba(243,163,93,0.3)' : 'var(--orange)',
            color: busy ? 'rgba(8,11,18,0.4)' : '#08090f',
            border: 'none', padding: '13px 0', fontFamily: 'var(--font)', fontSize: 16,
            cursor: busy ? 'not-allowed' : 'pointer', width: '100%', letterSpacing: '0.02em',
          }}>
            {busy ? 'SUBMITTING…' : policy?.active ? 'UPDATE POLICY' : 'SET POLICY'}
          </button>

          {tx  && <TxLink hash={tx} />}
          {err && <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--orange)' }}>{err}</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(232,224,212,0.4)' }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} style={{ background: 'rgba(232,224,212,0.04)', border: '1px solid rgba(232,224,212,0.12)', color: 'var(--cream)', padding: '9px 12px', fontFamily: 'monospace', fontSize: 13, outline: 'none', borderRadius: 0, width: '100%' }} />
      <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(232,224,212,0.3)' }}>{hint}</span>
    </div>
  );
}
