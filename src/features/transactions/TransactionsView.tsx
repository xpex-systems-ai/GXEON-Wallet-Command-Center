import React from 'react';
import { History, ShieldAlert, ExternalLink } from 'lucide-react';
import { TransactionItem, TransactionStatus } from '../../types';
import { Badge } from '../../components/common/Badge';

interface TransactionsViewProps {
  transactions: TransactionItem[];
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ transactions }) => {
  const getStatusBadge = (status: TransactionStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="green">CONFIRMED</Badge>;
      case 'PENDING':
        return <Badge variant="amber" dot>PENDING</Badge>;
      case 'DETECTED':
        return <Badge variant="cyan" dot>DETECTED</Badge>;
      case 'FAILED':
        return <Badge variant="red">FAILED</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#1E314F] pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white font-mono">
            Transaction Center
          </h1>
          <Badge variant="cyan">{transactions.length} LOGGED</Badge>
        </div>
        <p className="text-xs text-slate-400 font-mono mt-1">
          Cryptographically confirmed on-chain activity. Zero fabricated transactions.
        </p>
      </div>

      {/* Security Rule / Invariant Notice */}
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-[#00D4FF] shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1">
          <span className="font-bold text-[#00D4FF] font-mono block">
            VERIFIED DATA INVARIANT
          </span>
          <p className="text-slate-400 leading-relaxed">
            The GXEON Command Center only surfaces transaction logs returned by verified local nodes or official blockchain explorers. Simulated transaction records are strictly prohibited.
          </p>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0B1220] text-slate-400 border-b border-[#1E314F]">
              <tr>
                <th className="p-3.5">Date (UTC)</th>
                <th className="p-3.5">Network</th>
                <th className="p-3.5">Wallet / Address</th>
                <th className="p-3.5">Type</th>
                <th className="p-3.5">Asset / Amount</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">TX Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E314F]/60">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-[#152238]/50 transition-colors">
                  <td className="p-3.5 text-slate-300 whitespace-nowrap">
                    {new Date(tx.date).toLocaleString()}
                  </td>
                  <td className="p-3.5 text-white font-semibold uppercase">{tx.network}</td>
                  <td className="p-3.5 text-[#00D4FF]">
                    <code>
                      {tx.walletAddress.slice(0, 6)}...{tx.walletAddress.slice(-4)}
                    </code>
                  </td>
                  <td className="p-3.5 text-slate-300">{tx.type}</td>
                  <td className="p-3.5 font-bold text-white">
                    {tx.amount} {tx.asset}
                  </td>
                  <td className="p-3.5">{getStatusBadge(tx.status)}</td>
                  <td className="p-3.5 text-slate-400">
                    {tx.txHash ? (
                      <div className="flex items-center gap-1 text-[#00D4FF]">
                        <code>{tx.txHash.slice(0, 10)}...</code>
                        {tx.explorerUrl && (
                          <a
                            href={tx.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-white"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ) : (
                      '--'
                    )}
                  </td>
                </tr>
              ))}

              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <div className="font-semibold text-slate-300">No On-Chain Transactions Recorded</div>
                    <div className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                      Transactions will appear once verified by the local bridge or when bounty payouts are confirmed on-chain.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
