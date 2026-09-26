import React from 'react';
import { X, Copy, Check, Info } from 'lucide-react';
import { WalletItem } from '../../types';
import { Badge } from '../../components/common/Badge';
import { walletRegistry } from '../../wallets/registry';

interface WalletDetailModalProps {
  wallet: WalletItem | null;
  onClose: () => void;
}

export const WalletDetailModal: React.FC<WalletDetailModalProps> = ({
  wallet,
  onClose,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!wallet) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(wallet.publicAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const adapter = walletRegistry.getAdapterByNetwork(wallet.network);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E314F] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0B1220] border border-[#1E314F] flex items-center justify-center font-mono font-bold text-base text-[#FF7A00]">
              {wallet.symbol || 'W'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">{wallet.name}</h2>
              <p className="text-xs text-slate-400 uppercase font-mono">{wallet.network}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#152238] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Section */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0B1220] p-3 rounded-lg border border-[#1E314F]/80">
            <span className="text-[11px] text-slate-400 font-mono uppercase block mb-1">
              Operation Mode
            </span>
            <Badge variant="orange">{wallet.mode.toUpperCase()}</Badge>
          </div>
          <div className="bg-[#0B1220] p-3 rounded-lg border border-[#1E314F]/80">
            <span className="text-[11px] text-slate-400 font-mono uppercase block mb-1">
              Ownership Status
            </span>
            {wallet.ownershipStatus === 'VERIFIED' ? (
              <Badge variant="green">VERIFIED</Badge>
            ) : (
              <Badge variant="amber">UNVERIFIED</Badge>
            )}
          </div>
        </div>

        {/* Public Address */}
        <div>
          <label className="text-xs font-mono text-slate-400 uppercase block mb-1.5">
            Full Public Address
          </label>
          <div className="bg-[#0B1220] border border-[#1E314F] rounded-lg p-3 flex items-center justify-between gap-2">
            <code className="text-xs text-[#00D4FF] font-mono break-all select-all">
              {wallet.publicAddress}
            </code>
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-[#152238] shrink-0"
              title="Copy"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Adapter Capabilities */}
        <div>
          <label className="text-xs font-mono text-slate-400 uppercase block mb-1.5">
            Adapter Capabilities
          </label>
          <div className="bg-[#0B1220] border border-[#1E314F] rounded-lg p-3 space-y-1.5">
            <div className="text-xs text-slate-300 font-mono font-semibold">
              {adapter?.name || 'Generic Adapter'}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {adapter?.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#152238] text-slate-300 border border-[#1E314F]"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Notes / Ownership verification advisory */}
        {wallet.notes && (
          <div className="bg-[#152238]/60 border border-[#1E314F] rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#00D4FF] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold font-mono text-white block">Security Advisory:</span>
              <p className="text-slate-300 leading-relaxed">{wallet.notes}</p>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="pt-2 border-t border-[#1E314F] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#152238] hover:bg-[#1E314F] text-white text-xs font-mono rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
