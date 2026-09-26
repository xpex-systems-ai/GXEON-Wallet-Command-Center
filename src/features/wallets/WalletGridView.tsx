import React, { useState } from 'react';
import {
  Plus,
  Wallet,
  Layers,
} from 'lucide-react';
import { WalletItem } from '../../types';
import { WalletCard } from './WalletCard';
import { WalletDetailModal } from './WalletDetailModal';
import { AddWalletModal } from './AddWalletModal';
import { ConnectWalletModal } from './ConnectWalletModal';
import { walletRegistry } from '../../wallets/registry';
import { Badge } from '../../components/common/Badge';

interface WalletGridViewProps {
  wallets: WalletItem[];
  onAddWallet: (wallet: Omit<WalletItem, 'id'>) => void;
  onSyncWallet: (wallet: WalletItem) => void;
  isSyncing: boolean;
}

export const WalletGridView: React.FC<WalletGridViewProps> = ({
  wallets,
  onAddWallet,
  onSyncWallet,
  isSyncing,
}) => {
  const [selectedWallet, setSelectedWallet] = useState<WalletItem | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'watch_only' | 'verified' | 'unverified'>('all');

  const adapterInfos = walletRegistry.getAdapterInfos();

  const filteredWallets = wallets.filter((w) => {
    if (filter === 'watch_only') return w.mode === 'watch_only';
    if (filter === 'verified') return w.ownershipStatus === 'VERIFIED';
    if (filter === 'unverified') return w.ownershipStatus === 'UNVERIFIED';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E314F] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-mono">
              Wallet Command Center
            </h1>
            <Badge variant="cyan">{wallets.length} REGISTERED</Badge>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Operator-controlled addresses, watch-only monitors, and adapter capability registry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsAddOpen(true)}
            className="px-3.5 py-2 bg-[#152238] hover:bg-[#1E314F] text-slate-200 hover:text-white border border-[#1E314F] text-xs font-mono rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-[#FF7A00]" />
            Add Watch-Only
          </button>
          <button
            onClick={() => setIsConnectOpen(true)}
            className="px-3.5 py-2 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-black font-bold text-xs font-mono rounded-lg transition-colors shadow-glow-orange flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            Connect Web3 Provider
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'all'
              ? 'bg-[#FF7A00]/20 text-[#FF7A00] border border-[#FF7A00]/40 font-bold'
              : 'bg-[#111C30] text-slate-400 hover:text-white border border-[#1E314F]'
          }`}
        >
          All Wallets ({wallets.length})
        </button>
        <button
          onClick={() => setFilter('watch_only')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'watch_only'
              ? 'bg-[#FF7A00]/20 text-[#FF7A00] border border-[#FF7A00]/40 font-bold'
              : 'bg-[#111C30] text-slate-400 hover:text-white border border-[#1E314F]'
          }`}
        >
          Watch Only ({wallets.filter((w) => w.mode === 'watch_only').length})
        </button>
        <button
          onClick={() => setFilter('verified')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'verified'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
              : 'bg-[#111C30] text-slate-400 hover:text-white border border-[#1E314F]'
          }`}
        >
          Verified ({wallets.filter((w) => w.ownershipStatus === 'VERIFIED').length})
        </button>
        <button
          onClick={() => setFilter('unverified')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'unverified'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold'
              : 'bg-[#111C30] text-slate-400 hover:text-white border border-[#1E314F]'
          }`}
        >
          Unverified ({wallets.filter((w) => w.ownershipStatus === 'UNVERIFIED').length})
        </button>
      </div>

      {/* Wallet Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredWallets.map((wallet) => (
          <WalletCard
            key={wallet.id}
            wallet={wallet}
            onView={(w) => setSelectedWallet(w)}
            onSync={onSyncWallet}
            isSyncing={isSyncing}
          />
        ))}
      </div>

      {/* Wallet Adapters Layer Catalog */}
      <div className="mt-10 pt-8 border-t border-[#1E314F]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#00D4FF]" />
              Wallet Adapter Capability Matrix
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Strict capabilities declared per integration. No fake connections permitted.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {adapterInfos.map((adapter) => (
            <div
              key={adapter.id}
              className="bg-[#111C30]/80 border border-[#1E314F] rounded-xl p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-sm text-white">
                    {adapter.name}
                  </span>
                  {adapter.status === 'ACTIVE' && <Badge variant="green">ACTIVE</Badge>}
                  {adapter.status === 'READY' && <Badge variant="cyan">READY</Badge>}
                  {adapter.status === 'COMING_SOON' && (
                    <Badge variant="purple">COMING SOON</Badge>
                  )}
                </div>

                <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                  {adapter.description}
                </p>

                {adapter.supportedChains && (
                  <div className="text-[11px] text-slate-400 font-mono mb-2">
                    Chains: {adapter.supportedChains.join(', ')}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] uppercase font-mono text-slate-400 mb-1">
                  Declared Capabilities:
                </div>
                <div className="flex flex-wrap gap-1">
                  {adapter.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#152238] text-slate-300 border border-[#1E314F]"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      <WalletDetailModal
        wallet={selectedWallet}
        onClose={() => setSelectedWallet(null)}
      />
      <AddWalletModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={onAddWallet}
      />
      <ConnectWalletModal
        isOpen={isConnectOpen}
        onClose={() => setIsConnectOpen(false)}
        onConnected={onAddWallet}
      />
    </div>
  );
};
