import React from 'react';
import {
  Coins,
  TrendingUp,
  AlertTriangle,
  Wallet,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { WalletItem, MultiAssetEarningsStats } from '../../types';

interface QuantumTreasuryViewProps {
  wallets: WalletItem[];
  bountyStats: MultiAssetEarningsStats;
  onNavigateToWallets?: () => void;
  onNavigateToEarnings?: () => void;
}

export const QuantumTreasuryView: React.FC<QuantumTreasuryViewProps> = ({
  wallets,
  bountyStats,
  onNavigateToWallets,
  onNavigateToEarnings,
}) => {
  // Aggregate balances per asset across all registered wallets
  // Non-summed across different currencies!
  const balancesByAsset: Record<string, { total: number; hasUnavailable: boolean; count: number }> = {};

  wallets.forEach((w) => {
    const symbol = w.symbol.toUpperCase();
    if (!balancesByAsset[symbol]) {
      balancesByAsset[symbol] = { total: 0, hasUnavailable: false, count: 0 };
    }
    balancesByAsset[symbol].count += 1;
    if (w.balance !== null && w.balance !== undefined) {
      balancesByAsset[symbol].total += Number(w.balance);
    } else {
      balancesByAsset[symbol].hasUnavailable = true;
    }
  });

  const assetEntries = Object.entries(balancesByAsset);
  const pendingAssets = Object.entries(bountyStats.pendingByAsset);
  const confirmedAssets = Object.entries(bountyStats.confirmedByAsset);

  return (
    <div className="space-y-6">
      {/* Treasury Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E314F]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white font-mono flex items-center gap-2">
              <Coins className="w-5 h-5 text-[#FF7A00]" />
              Quantum Multi-Asset Treasury
            </h2>
            <Badge variant="cyan">REAL BALANCES ONLY</Badge>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Strict multi-currency accounting. No artificial fiat conversions without cryptographic oracle verification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToEarnings && (
            <button
              onClick={onNavigateToEarnings}
              className="px-3 py-1.5 bg-[#152238] hover:bg-[#1E314F] text-slate-200 border border-[#1E314F] text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5 text-[#00D4FF]" />
              Earnings Pipeline
            </button>
          )}
          {onNavigateToWallets && (
            <button
              onClick={onNavigateToWallets}
              className="px-3 py-1.5 bg-[#111C30] hover:bg-[#152238] text-slate-200 border border-[#1E314F] text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Wallet className="w-3.5 h-3.5 text-[#FF7A00]" />
              All Wallets
            </button>
          )}
        </div>
      </div>

      {/* Asset Cards Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {assetEntries.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-[#111C30]/50 rounded-xl border border-[#1E314F] text-xs font-mono text-slate-400">
            No active wallets registered. Add or connect wallets to monitor asset holdings.
          </div>
        ) : (
          assetEntries.map(([symbol, data]) => (
            <Card key={symbol} glow={symbol === 'RTC' ? 'orange' : undefined}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400 font-bold uppercase tracking-wider">
                  {symbol} Holdings
                </span>
                <Badge variant={symbol === 'RTC' ? 'orange' : 'cyan'}>{symbol}</Badge>
              </div>

              <div className="mt-3">
                <div className="text-2xl font-bold font-mono text-white">
                  {data.hasUnavailable && data.total === 0 ? (
                    <span className="text-slate-400 text-lg">UNAVAILABLE</span>
                  ) : (
                    <span>
                      {data.total} <span className="text-xs text-slate-400">{symbol}</span>
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-mono">
                  Tracked across {data.count} address{data.count > 1 ? 'es' : ''}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] font-mono flex items-center justify-between">
                <span className="text-slate-400">Status:</span>
                {data.hasUnavailable ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    RPC Pending
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Payout & Earnings Flow Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pending Payouts Pipeline */}
        <Card>
          <div className="flex items-center justify-between pb-3 border-b border-[#1E314F]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00D4FF]" />
              <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                Unconfirmed Payout Pipeline
              </h3>
            </div>
            <Badge variant="cyan">{bountyStats.submittedCount} SUBMITTED</Badge>
          </div>

          <div className="mt-4 space-y-2">
            {pendingAssets.length === 0 ? (
              <div className="p-4 text-center text-xs font-mono text-slate-400">
                Pipeline clear. No submitted bounties awaiting on-chain verification.
              </div>
            ) : (
              pendingAssets.map(([asset, amount]) => (
                <div
                  key={asset}
                  className="flex items-center justify-between p-3 bg-[#0B1220] rounded-lg border border-[#1E314F] font-mono text-xs"
                >
                  <span className="text-slate-300 font-bold">{asset}</span>
                  <span className="text-[#00D4FF] font-bold text-sm">{amount} {asset}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 text-[11px] text-slate-400 font-mono">
            ⚠️ Status requires operator on-chain txHash submission to transition to PAID.
          </div>
        </Card>

        {/* Confirmed Received */}
        <Card>
          <div className="flex items-center justify-between pb-3 border-b border-[#1E314F]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                Confirmed & Verified Payouts
              </h3>
            </div>
            <Badge variant="green">{bountyStats.paidCount} CONFIRMED</Badge>
          </div>

          <div className="mt-4 space-y-2">
            {confirmedAssets.length === 0 ? (
              <div className="p-4 text-center text-xs font-mono text-slate-400">
                No confirmed payouts recorded yet.
              </div>
            ) : (
              confirmedAssets.map(([asset, amount]) => (
                <div
                  key={asset}
                  className="flex items-center justify-between p-3 bg-[#0B1220] rounded-lg border border-[#1E314F] font-mono text-xs"
                >
                  <span className="text-slate-300 font-bold">{asset}</span>
                  <span className="text-emerald-400 font-bold text-sm">{amount} {asset}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 text-[11px] text-slate-400 font-mono">
            * Verified against cryptographic on-chain transaction receipts.
          </div>
        </Card>
      </div>
    </div>
  );
};
