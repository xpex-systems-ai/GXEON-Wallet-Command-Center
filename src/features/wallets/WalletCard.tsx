import React from 'react';
import {
  Copy,
  Check,
  Eye,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { WalletItem } from '../../types';
import { Badge } from '../../components/common/Badge';
import { walletRegistry } from '../../wallets/registry';

interface WalletCardProps {
  wallet: WalletItem;
  onView: (wallet: WalletItem) => void;
  onSync: (wallet: WalletItem) => void;
  isSyncing?: boolean;
}

export const WalletCard: React.FC<WalletCardProps> = ({
  wallet,
  onView,
  onSync,
  isSyncing = false,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(wallet.publicAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedAddress = walletRegistry.formatAddress(
    wallet.network,
    wallet.publicAddress
  );

  return (
    <div className="bg-[#111C30]/90 border border-[#1E314F] hover:border-[#1E314F]/80 rounded-xl p-5 flex flex-col justify-between transition-all hover:shadow-cyber-card group">
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0B1220] border border-[#1E314F] flex items-center justify-center font-mono font-bold text-sm text-[#FF7A00]">
              {wallet.symbol || 'W3'}
            </div>
            <div>
              <h3 className="font-bold text-white font-mono text-base group-hover:text-[#FF7A00] transition-colors">
                {wallet.name}
              </h3>
              <p className="text-xs text-slate-400 uppercase font-mono tracking-wider">
                {wallet.network}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            {wallet.mode === 'watch_only' && (
              <Badge variant="orange">
                <Eye className="w-3 h-3 inline mr-1" />
                WATCH ONLY
              </Badge>
            )}
            {wallet.ownershipStatus === 'VERIFIED' ? (
              <Badge variant="green">
                <ShieldCheck className="w-3 h-3 inline mr-1" />
                OWNERSHIP VERIFIED
              </Badge>
            ) : (
              <Badge variant="amber">
                <ShieldAlert className="w-3 h-3 inline mr-1" />
                UNVERIFIED
              </Badge>
            )}
          </div>
        </div>

        {/* Public Address Bar */}
        <div className="bg-[#0B1220] border border-[#1E314F]/80 rounded-lg p-2.5 flex items-center justify-between gap-2 my-3">
          <span className="font-mono text-xs text-[#00D4FF] select-all truncate">
            {formattedAddress}
          </span>
          <button
            onClick={handleCopy}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#152238] transition-colors shrink-0"
            title="Copy Public Address"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Balance Display */}
        <div className="my-4">
          <div className="text-xs font-mono text-slate-400 mb-1 uppercase">
            On-Chain Balance
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {wallet.balance !== null && wallet.balance !== undefined
              ? `${wallet.balance} ${wallet.symbol}`
              : '--'}
          </div>
          {wallet.balance === null && (
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              * Live balance unavailable (No active node query)
            </p>
          )}
        </div>

        {/* Metadata badges */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1E314F]/60">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#152238] text-slate-300 border border-[#1E314F]">
            Type: {wallet.connectionType}
          </span>
          {wallet.purpose && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#152238] text-slate-300 border border-[#1E314F]">
              Purpose: {wallet.purpose}
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[#1E314F]">
        <button
          onClick={() => onView(wallet)}
          className="flex-1 py-1.5 px-3 bg-[#152238] hover:bg-[#1E314F] text-slate-200 hover:text-white text-xs font-mono rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View Details
        </button>

        <button
          onClick={() => onSync(wallet)}
          disabled={isSyncing}
          className="py-1.5 px-3 bg-[#152238] hover:bg-[#1E314F] text-slate-200 hover:text-white text-xs font-mono rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          title="Sync wallet state"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#00D4FF]' : ''}`} />
          Sync
        </button>
      </div>
    </div>
  );
};
