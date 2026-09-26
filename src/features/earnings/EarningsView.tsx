import React, { useState } from 'react';
import {
  Plus,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { BountyItem, BountyStatus, WalletItem } from '../../types';
import { Badge } from '../../components/common/Badge';
import { AddBountyModal } from './AddBountyModal';

interface EarningsViewProps {
  bounties: BountyItem[];
  wallets: WalletItem[];
  onAddBounty: (bounty: Omit<BountyItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateStatus: (id: string, status: BountyStatus, txHash?: string) => void;
}

export const EarningsView: React.FC<EarningsViewProps> = ({
  bounties,
  wallets,
  onAddBounty,
  onUpdateStatus,
}) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [filter, setFilter] = useState<string>('ALL');

  const getStatusBadgeVariant = (status: BountyStatus) => {
    switch (status) {
      case 'PAID':
        return 'green';
      case 'PAYOUT_PENDING':
      case 'ACCEPTED':
        return 'cyan';
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return 'orange';
      case 'IN_PROGRESS':
      case 'DISCOVERED':
        return 'slate';
      case 'REJECTED':
        return 'red';
      default:
        return 'slate';
    }
  };

  const filteredBounties = bounties.filter((b) => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING') {
      return (
        b.status === 'SUBMITTED' ||
        b.status === 'UNDER_REVIEW' ||
        b.status === 'ACCEPTED' ||
        b.status === 'PAYOUT_PENDING'
      );
    }
    if (filter === 'PAID') return b.status === 'PAID';
    return b.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E314F] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-mono">
              Bounties & Earnings Center
            </h1>
            <Badge variant="cyan">{bounties.length} SUBMISSIONS</Badge>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Track Web3 grant submissions, bounties, review lifecycles, and confirmed payouts.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-bold text-xs font-mono rounded-lg transition-colors shadow-glow-cyan flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Submission / Bounty
        </button>
      </div>

      {/* Strict Accounting Rule Notice */}
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1">
          <span className="font-bold text-amber-400 font-mono block">
            GXEON ACCOUNTING INVARIANT: SUBMITTED ≠ PAID
          </span>
          <p className="text-slate-400 leading-relaxed">
            Bounties in <em>SUBMITTED</em>, <em>UNDER_REVIEW</em>, or <em>PAYOUT_PENDING</em> status represent pipeline value and are <strong>never</strong> added to confirmed liquid balances until cryptographically verified on-chain.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
        {['ALL', 'PENDING', 'PAID', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'].map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === f
                  ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40 font-bold'
                  : 'bg-[#111C30] text-slate-400 hover:text-white border border-[#1E314F]'
              }`}
            >
              {f}
            </button>
          )
        )}
      </div>

      {/* Bounties Table / List */}
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0B1220] text-slate-400 border-b border-[#1E314F]">
              <tr>
                <th className="p-3.5">Bounty / Task</th>
                <th className="p-3.5">Platform</th>
                <th className="p-3.5">Expected Reward</th>
                <th className="p-3.5">Destination</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E314F]/60">
              {filteredBounties.map((b) => (
                <tr key={b.id} className="hover:bg-[#152238]/50 transition-colors">
                  <td className="p-3.5">
                    <div className="font-bold text-white max-w-xs truncate">{b.title}</div>
                    {b.evidenceUrl && (
                      <a
                        href={b.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[#00D4FF] hover:underline flex items-center gap-1 mt-0.5"
                      >
                        Evidence / Link <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </td>
                  <td className="p-3.5 text-slate-300">{b.platform}</td>
                  <td className="p-3.5">
                    <span className="font-bold text-white text-sm">
                      {b.expectedReward} {b.currency}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-400">
                    <code className="text-[11px] text-[#00D4FF]">
                      {b.destinationWalletAddress
                        ? `${b.destinationWalletAddress.slice(0, 8)}...${b.destinationWalletAddress.slice(-4)}`
                        : 'Unassigned'}
                    </code>
                  </td>
                  <td className="p-3.5">
                    <Badge variant={getStatusBadgeVariant(b.status)}>{b.status}</Badge>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {b.status !== 'PAID' && (
                        <button
                          onClick={() => onUpdateStatus(b.id, 'PAID')}
                          className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[11px] transition-colors"
                          title="Mark as Paid"
                        >
                          Mark Paid
                        </button>
                      )}
                      {b.status === 'SUBMITTED' && (
                        <button
                          onClick={() => onUpdateStatus(b.id, 'UNDER_REVIEW')}
                          className="px-2 py-1 bg-[#152238] hover:bg-[#1E314F] text-slate-300 rounded text-[11px] transition-colors"
                        >
                          Reviewing
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredBounties.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No bounties found matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddBountyModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        wallets={wallets}
        onAdd={onAddBounty}
      />
    </div>
  );
};
