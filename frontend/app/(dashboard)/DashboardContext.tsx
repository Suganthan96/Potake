'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { ADDRESSES, ORACLE_ABI, REGISTRY_ABI, VAULT_ABI, EVM_RPC } from '@/lib/contracts';
import type { ValidatorData } from '@/components/WorldCanvas';

export interface ValidatorInfo extends ValidatorData { active: boolean; }
export interface Snapshot { era: number; totalStake: bigint; validatorCount: number; validators: ValidatorInfo[]; }
export interface Policy {
  stakingAccount: string; maxShareBps: number; minUptimeBps: number;
  maxValidators: number; version: number; active: boolean;
}

interface DashboardCtx {
  address: string;
  provider: ethers.BrowserProvider | null;
  snap: Snapshot | null;
  policy: Policy | null;
  loading: boolean;
  vaultMinUptime: number;
  reloadPolicy: () => void;
}

const Ctx = createContext<DashboardCtx | null>(null);
export const useDashboard = () => useContext(Ctx)!;

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected } = useAccount();

  const [address,        setAddress]        = useState('');
  const [provider,       setProvider]       = useState<ethers.BrowserProvider | null>(null);
  const [snap,           setSnap]           = useState<Snapshot | null>(null);
  const [policy,         setPolicy]         = useState<Policy | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [vaultMinUptime, setVaultMinUptime] = useState(0);

  const loadOracle = useCallback(async () => {
    setLoading(true);
    try {
      const ro = new ethers.JsonRpcProvider(EVM_RPC);
      const oracle = new ethers.Contract(ADDRESSES.oracle, ORACLE_ABI, ro);
      const [snapRaw, ids, vaultMin] = await Promise.all([
        oracle.snapshot(),
        oracle.validatorIds(),
        (new ethers.Contract(ADDRESSES.vault, VAULT_ABI, ro)).minUptimeBps(),
      ]);
      const validators: ValidatorInfo[] = await Promise.all(
        ids.map(async (id: string) => {
          const [info, shareBps, healthy] = await Promise.all([
            oracle.validatorInfo(id),
            oracle.stakeShareBps(id),
            oracle.isHealthy(id, 9000),
          ]);
          return { id, totalStake: info.totalStake, commissionBps: Number(info.commissionBps), uptimeBps: Number(info.uptimeBps), active: info.active, shareBps: Number(shareBps), healthy };
        })
      );
      setSnap({ era: Number(snapRaw.era), totalStake: snapRaw.totalStake, validatorCount: Number(snapRaw.validatorCount), validators });
      setVaultMinUptime(Number(vaultMin));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadPolicy = useCallback(async (addr: string) => {
    try {
      const ro = new ethers.JsonRpcProvider(EVM_RPC);
      const reg = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, ro);
      const p = await reg.policies(addr);
      setPolicy({ stakingAccount: p.stakingAccount, maxShareBps: Number(p.maxShareBps), minUptimeBps: Number(p.minUptimeBps), maxValidators: Number(p.maxValidators), version: Number(p.version), active: p.active });
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadOracle(); }, [loadOracle]);

  // Auto-connect when wagmi detects a connected wallet
  useEffect(() => {
    if (isConnected && wagmiAddress) {
      const prov = new ethers.BrowserProvider((window as any).ethereum);
      setAddress(wagmiAddress);
      setProvider(prov);
      loadPolicy(wagmiAddress);
    } else if (!isConnected) {
      setAddress('');
      setProvider(null);
      setPolicy(null);
    }
  }, [isConnected, wagmiAddress, loadPolicy]);

  const reloadPolicy = useCallback(() => { if (address) loadPolicy(address); }, [address, loadPolicy]);

  return (
    <Ctx.Provider value={{ address, provider, snap, policy, loading, vaultMinUptime, reloadPolicy }}>
      {children}
    </Ctx.Provider>
  );
}
