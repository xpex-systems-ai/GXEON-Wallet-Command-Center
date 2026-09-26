import React, { useState } from 'react';
import { X, ShieldCheck, Wallet, AlertCircle } from 'lucide-react';
import { evmAdapter } from '../../wallets/adapters/evm';
import { WalletItem } from '../../types';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (wallet: Omit<WalletItem, 'id'>) => void;
}

export const ConnectWalletModal: React.FC<ConnectWalletModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnectEvm = async () => {
    setLoading(true);
    setError(null);

    const res = await evmAdapter.connect();
    setLoading(false);

    if (res.success && res.publicAddress) {
      let chainName = 'Ethereum';
      if (res.chainId === 8453) chainName = 'Base';
      else if (res.chainId === 137) chainName = 'Polygon';
      else if (res.chainId === 42161) chainName = 'Arbitrum';

      onConnected({
        name: `MetaMask (${chainName})`,
        network: chainName.toLowerCase(),
        chainId: res.chainId,
        symbol: 'ETH',
        publicAddress: res.publicAddress,
        connectionType: 'BROWSER_PROVIDER',
        ownershipStatus: 'VERIFIED',
        mode: 'connected_provider',
        balance: null,
        purpose: 'EVM Operations',
        notes: `Connected via EIP-1193 Browser Provider. Chain ID: ${res.chainId}.`,
      });
      onClose();
    } else {
      setError(res.error || 'Connection failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in">
        <div className="flex items-center justify-between border-b border-[#1E314F] pb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#00D4FF]" />
            <h2 className="text-lg font-bold text-white font-mono">Connect Web3 Wallet</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#152238]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Invariant Box */}
        <div className="bg-[#152238] border border-emerald-500/30 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-emerald-400 font-mono">ZERO-SEED PROMISE:</strong>
            <p className="text-slate-300 text-[11px] mt-0.5 leading-relaxed">
              We never ask for seed phrases or private keys. The browser extension prompts you to confirm connection and signing locally.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2.5">
          {/* MetaMask / Injected Provider */}
          <button
            onClick={handleConnectEvm}
            disabled={loading}
            className="w-full p-3.5 rounded-lg bg-[#0B1220] hover:bg-[#152238] border border-[#1E314F] hover:border-[#00D4FF]/50 flex items-center justify-between transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[#152238] flex items-center justify-center font-mono font-bold text-[#FF7A00] text-xs">
                🦊
              </div>
              <div className="text-left">
                <div className="text-sm font-bold font-mono text-white group-hover:text-[#00D4FF]">
                  MetaMask / Browser Extension
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Ethereum, Base, Polygon, Arbitrum
                </div>
              </div>
            </div>
            <span className="text-xs font-mono text-[#00D4FF]">Connect →</span>
          </button>

          {/* Coinbase Wallet */}
          <div className="w-full p-3.5 rounded-lg bg-[#0B1220]/50 border border-[#1E314F] flex items-center justify-between opacity-80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[#152238] flex items-center justify-center font-mono font-bold text-[#00D4FF] text-xs">
                🔵
              </div>
              <div className="text-left">
                <div className="text-sm font-bold font-mono text-white">
                  Coinbase Wallet
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Self-Custodial Wallet Connector
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              READY
            </span>
          </div>

          {/* Solana */}
          <div className="w-full p-3.5 rounded-lg bg-[#0B1220]/30 border border-[#1E314F] flex items-center justify-between opacity-60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[#152238] flex items-center justify-center font-mono font-bold text-purple-400 text-xs">
                ◎
              </div>
              <div className="text-left">
                <div className="text-sm font-bold font-mono text-slate-300">
                  Solana (Phantom / Solflare)
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Solana Non-Custodial Monitor
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#152238] text-purple-400 border border-purple-500/30">
              COMING SOON
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-[#1E314F] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#152238] hover:bg-[#1E314F] text-slate-300 rounded-lg text-xs font-mono"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
