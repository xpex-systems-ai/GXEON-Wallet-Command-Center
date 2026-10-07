import React from 'react';
import {
  Wallet,
  Globe,
  Coins,
  CheckCircle2,
  Server,
  AlertTriangle,
  ShieldCheck,
  Eye,
  Cpu,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { WalletItem, BridgeHealthResponse, BridgeStatusResponse, MultiAssetEarningsStats } from '../../types';
import { NavTab } from '../../components/layout/Sidebar';
import { walletRegistry } from '../../wallets/registry';
import { QuantumTreasuryView } from './QuantumTreasuryView';
import { RealRevenuePanel } from './RealRevenuePanel';
import { SwapRadarPanel } from './SwapRadarPanel';

interface DashboardViewProps {
  wallets: WalletItem[];
  bridgeHealth: BridgeHealthResponse | null;
  bridgeStatus: BridgeStatusResponse | null;
  bountyStats: MultiAssetEarningsStats;
  onNavigate: (tab: NavTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  wallets,
  bridgeHealth,
  bridgeStatus,
  bountyStats,
  onNavigate,
}) => {
  const watchOnlyCount = wallets.filter((w) => w.mode === 'watch_only').length;
  const unverifiedCount = wallets.filter((w) => w.ownershipStatus === 'UNVERIFIED').length;
  const networkCounts = walletRegistry.getNetworkCounts();

  // Multi-asset pending list
  const pendingAssets = Object.entries(bountyStats.pendingByAsset);
  const confirmedAssets = Object.entries(bountyStats.confirmedByAsset);

  return (
    <div className="space-y-6">
      {/* Top Banner / Mission Context */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#111C30] via-[#152238] to-[#111C30] border border-[#1E314F] p-6">
        <div className="absolute right-0 top-0 w-96 h-full bg-gradient-to-l from-[#FF7A00]/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-[#FF7A00] tracking-widest uppercase">
                GXEON Financial HQ
              </span>
              <span className="text-slate-600">//</span>
              <span className="text-xs font-mono text-slate-400">Control Plane Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
              Command Center Dashboard
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Centralized watch-only monitoring and Web3 bounty tracking. Cryptographic signing strictly isolated to local machine.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate('mining')}
              className="px-4 py-2 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-black font-semibold text-xs font-mono rounded-lg transition-all shadow-glow-orange flex items-center gap-2"
            >
              <Cpu className="w-4 h-4" />
              ClawRTC Mining
            </button>
            <button
              onClick={() => onNavigate('wallets')}
              className="px-4 py-2 bg-[#152238] hover:bg-[#1E314F] border border-[#1E314F] text-slate-200 text-xs font-mono rounded-lg transition-all flex items-center gap-2"
            >
              <Wallet className="w-4 h-4 text-[#00D4FF]" />
              Manage Wallets
            </button>
            <button
              onClick={() => onNavigate('security')}
              className="px-4 py-2 bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] text-slate-200 text-xs font-mono rounded-lg transition-all flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Security Center
            </button>
          </div>
        </div>
      </div>

      {/* Real Revenue & Money Truth */}
      <RealRevenuePanel />

      {/* Multi-asset conversion intelligence: discovery only, no signing or asset movement */}
      <SwapRadarPanel />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: TOTAL PORTFOLIO */}
        <Card glow="orange" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Total Portfolio (Fiat)
            </span>
            <Badge variant="orange" dot>MONITORING</Badge>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-slate-300">
              UNAVAILABLE
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {watchOnlyCount} Watch-Only ({unverifiedCount} Unverified)
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] text-slate-400 font-mono">
            * Price oracle & live balance RPC not configured. No synthetic $0 values shown.
          </div>
        </Card>

        {/* Card 2: WALLETS REGISTERED */}
        <Card glow="cyan">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Registered Wallets
            </span>
            <Wallet className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold font-mono text-white">
              {wallets.length}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span className="text-emerald-400">{wallets.length - unverifiedCount} Verified</span>
              <span>•</span>
              <span className="text-amber-400">{unverifiedCount} Unverified</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] text-slate-400 font-mono flex justify-between">
            <span>Primary: RustChain RTC</span>
            <button onClick={() => onNavigate('wallets')} className="text-[#00D4FF] hover:underline">
              View All →
            </button>
          </div>
        </Card>

        {/* Card 3: NETWORKS */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Network Adapters
            </span>
            <Globe className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold font-mono text-white">
              {networkCounts.total}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {networkCounts.active} Active • {networkCounts.partial} Partial • {networkCounts.comingSoon} Coming Soon
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
            <Badge variant="cyan">{networkCounts.active} Live Provider</Badge>
            <Badge variant="orange">{networkCounts.partial} Watch-Only</Badge>
          </div>
        </Card>

        {/* Card 4: PENDING PAYOUTS */}
        <Card glow="cyan">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Pending Payout Pipeline
            </span>
            <Coins className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="mt-3">
            {pendingAssets.length > 0 ? (
              <div className="space-y-1">
                {pendingAssets.map(([asset, amount]) => (
                  <div key={asset} className="text-lg font-bold font-mono text-[#00D4FF]">
                    {amount} {asset}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-2xl font-bold font-mono text-slate-400">
                0 (Empty)
              </div>
            )}
            <div className="text-xs text-slate-400 mt-1">
              {bountyStats.submittedCount} submissions in pipeline
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] text-amber-400/90 font-mono">
            ⚠️ SUBMITTED ≠ PAID (Multi-asset breakdown; never summed)
          </div>
        </Card>

        {/* Card 5: CONFIRMED RECEIVED */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Confirmed Received
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            {confirmedAssets.length > 0 ? (
              <div className="space-y-1">
                {confirmedAssets.map(([asset, amount]) => (
                  <div key={asset} className="text-lg font-bold font-mono text-emerald-400">
                    {amount} {asset}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-2xl font-bold font-mono text-slate-400">
                0 (Empty)
              </div>
            )}
            <div className="text-xs text-slate-400 mt-1">
              {bountyStats.paidCount} verified paid payouts
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] text-slate-400 font-mono">
            Requires cryptographic TX verification
          </div>
        </Card>

        {/* Card 6: SYSTEM & BRIDGE STATUS */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Local Bridge Status
            </span>
            <Server className={`w-4 h-4 ${bridgeHealth?.ok ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold font-mono text-white flex items-center gap-2">
              {bridgeHealth?.ok ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE (127.0.0.1:8790)
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  STANDBY / LOCAL MODE
                </>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Mode: {bridgeHealth?.security_mode || 'local_only'} | Invariants: Strict
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] text-slate-400 font-mono flex justify-between items-center">
            <span>Uptime: {bridgeStatus?.uptime || 'Local process'}</span>
            <button onClick={() => onNavigate('security')} className="text-[#FF7A00] hover:underline">
              Inspect Security →
            </button>
          </div>
        </Card>
      </div>

      {/* Critical Alert: RustChain Initial Address Notice */}
      <div className="bg-[#111C30] border-l-4 border-[#FF7A00] border-y border-r border-[#1E314F] rounded-r-xl p-5">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-[#FF7A00] shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-white font-mono">
                Primary Watch Address: RustChain RTC
              </h3>
              <Badge variant="orange">WATCH ONLY</Badge>
              <Badge variant="amber">OWNERSHIP UNVERIFIED</Badge>
            </div>
            <p className="text-sm text-slate-300">
              Address:{' '}
              <code className="bg-[#0B1220] px-2 py-0.5 rounded text-[#00D4FF] font-mono text-xs select-all">
                RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269
              </code>
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              This address is monitored for bounty payouts. In accordance with GXEON security rules, possessing a public address does NOT grant operational control until cryptographic proof is verified by the local signing plane.
            </p>
          </div>
        </div>
      </div>

      {/* Multi-Asset Quantum Treasury Breakdown */}
      <QuantumTreasuryView
        wallets={wallets}
        bountyStats={bountyStats}
        onNavigateToWallets={() => onNavigate('wallets')}
        onNavigateToEarnings={() => onNavigate('earnings')}
      />
    </div>
  );
};
