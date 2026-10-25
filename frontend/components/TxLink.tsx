'use client';
import { useState } from 'react';

const explorerUrl = (_hash: string) =>
  `https://node-console.portaldot.dev/#/rpc`;

export default function TxLink({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <p style={{ fontFamily: 'monospace', fontSize: 10, color: '#8FB9A8', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      TX:&nbsp;
      <button onClick={copy} title={hash} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copied ? '#8FB9A8' : 'rgba(143,185,168,0.8)', fontFamily: 'monospace', fontSize: 10, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
        {copied ? 'copied!' : `${hash.slice(0, 14)}…`}
      </button>
      <a href={explorerUrl(hash)} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(232,224,212,0.35)', fontSize: 9, textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--cream)') as any}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(232,224,212,0.35)') as any}>
        ↗ verify
      </a>
    </p>
  );
}
