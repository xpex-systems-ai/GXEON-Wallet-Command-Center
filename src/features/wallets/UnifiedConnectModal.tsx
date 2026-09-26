import React, { useState } from 'react';
import {
  XCircle,
  Terminal,
  Wallet,
  ShieldCheck,
  Plus,
  Cpu,
  ArrowRight,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { WalletItem } from '../../types';
import { Badge } from '../../components/common/Badge';
import { evmAdapter } from '../../wallets/adapters/evm';
import { coinbaseAdapter } from '../../wallets/adapters/coinbase';
import { ConnectCliModal } from './ConnectCliModal';
import { AddWalletModal } from './AddWalletModal';

interface UnifiedConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (wallet: Omit<WalletItem, 'id'>) => void;
  onNavigateToMining?: () => void;
}

type ConnectMode = 'menu' | 'cli' | 'watch_only';

export const UnifiedConnectModal: React.FC<UnifiedConnectModalProps> = ({
  isOpen,
  onClose,
  onConnected,
  onNavigateToMining,
}) => {
  const [activeSubModal, setActiveSubModal] = useState<ConnectMode>('menu');
  const [isConnectingBrowser, setIsConnectingBrowser] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnectEVM = async () => {
    setIsConnectingBrowser(true);
    setErrorMessage(null);
    try {
      const result = await evmAdapter.connect();
      if (result.success && result.publicAddress) {
        onConnected({
          name: 'MetaMask EVM Connected',
          network: 'evm',
          symbol: 'ETH',
          publicAddress: result.publicAddress,
          connectionType: 'BROWSER_PROVIDER',
          mode: 'connected_provider',
          ownershipStatus: 'VERIFIED',
          purpose: 'Web3 Provider Interaction',
          notes: 'Connected via browser EIP-1193 provider',
        });
        onClose();
      } else {
        setErrorMessage(result.error || 'Failed to connect browser wallet.');
      }
    } catch {
      setErrorMessage('Error requesting account authorization from browser extension.');
    } finally {
      setIsConnectingBrowser(false);
    }
  };

  const handleConnectCoinbase = async () => {
    setIsConnectingBrowser(true);
    setErrorMessage(null);
    try {
      const result = await coinbaseAdapter.connect();
      if (result.success && result.publicAddress) {
        onConnected({
          name: 'Coinbase Wallet Extension',
          network: 'evm',
          symbol: 'ETH',
          publicAddress: result.publicAddress,
          connectionType: 'BROWSER_PROVIDER',
          mode: 'connected_provider',
          ownershipStatus: 'VERIFIED',
          purpose: 'Self-Custodial Provider',
          notes: 'Connected via Coinbase Wallet extension',
        });
        onClose();
      } else {
        setErrorMessage(result.error || 'Coinbase Wallet extension not detected.');
      }
    } catch {
      setErrorMessage('Could not connect to Coinbase Wallet.');
    } finally {
      setIsConnectingBrowser(false);
    }
  };

  return (
    <>
      {activeSubModal === 'menu' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl bg-[#0F172A] border border-[#1E314F] rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E314F] bg-[#111C30]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF7A00] to-[#00D4FF] p-[1px] flex items-center justify-center shadow-glow-orange">
                  <div className="w-full h-full bg-[#0B1220] rounded-[11px] flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-[#FF7A00]" />
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                    CONNECT TO GXEON
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40 font-bold">
                      QUANTUM CORE
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Unified non-custodial Web3 & Local Companion integration hub
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1E314F] transition-all"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Security Guarantee Banner */}
            <div className="px-6 py-2 bg-[#0B1220] border-b border-[#1E314F] flex items-center gap-2 text-xs font-mono text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                <strong>ZERO-TRUST GUARANTEE:</strong> No seed phrases, passwords, or private keys are ever requested.
              </span>
            </div>

            {/* Error Display */}
            {errorMessage && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-mono text-rose-300">
                {errorMessage}
              </div>
            )}

            {/* Connection Method Grid */}
            <div className="p-6 overflow-y-auto space-y-3">
              {/* 1. CLI / Local Companion */}
              <div
                onClick={() => setActiveSubModal('cli')}
                className="p-4 rounded-xl bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] hover:border-[#00D4FF]/50 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20 mt-0.5">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white group-hover:text-[#00D4FF] transition-colors">
                        Local CLI Companion
                      </span>
                      <Badge variant="cyan">RECOMMENDED</Badge>
                      <Badge variant="slate">127.0.0.1:8790</Badge>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1 leading-relaxed">
                      Safe tool detection, Solana CLI discovery, and ClawRTC Proof of Antiquity controller.
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-[#00D4FF] group-hover:translate-x-1 transition-all shrink-0 ml-2" />
              </div>

              {/* 2. MetaMask / EVM */}
              <div
                onClick={isConnectingBrowser ? undefined : handleConnectEVM}
                className={`p-4 rounded-xl bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] hover:border-[#FF7A00]/50 transition-all cursor-pointer flex items-center justify-between group ${
                  isConnectingBrowser ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-[#FF7A00]/10 text-[#FF7A00] border border-[#FF7A00]/20 mt-0.5">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white group-hover:text-[#FF7A00] transition-colors">
                        MetaMask / EVM Provider
                      </span>
                      <Badge variant="green">ACTIVE</Badge>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1 leading-relaxed">
                      Direct EIP-1193 authorization for Ethereum, Base, Polygon, and Arbitrum.
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-[#FF7A00] group-hover:translate-x-1 transition-all shrink-0 ml-2" />
              </div>

              {/* 3. Coinbase Wallet */}
              <div
                onClick={handleConnectCoinbase}
                className="p-4 rounded-xl bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] hover:border-[#00D4FF]/50 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20 mt-0.5">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white group-hover:text-[#00D4FF] transition-colors">
                        Coinbase Wallet Extension
                      </span>
                      <Badge variant="orange">SELF-CUSTODIAL</Badge>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1 leading-relaxed">
                      Self-custodial browser extension connector (separate from custodial exchange).
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-[#00D4FF] group-hover:translate-x-1 transition-all shrink-0 ml-2" />
              </div>

              {/* 4. Add Watch-Only Address */}
              <div
                onClick={() => setActiveSubModal('watch_only')}
                className="p-4 rounded-xl bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] hover:border-slate-500 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 mt-0.5">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white">
                        Add Watch-Only Address
                      </span>
                      <Badge variant="slate">MONITOR</Badge>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1 leading-relaxed">
                      Track public balances and bounty payouts on any network without linking an extension.
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0 ml-2" />
              </div>

              {/* 5. RustChain & ClawRTC Mining Hub */}
              <div
                onClick={() => {
                  onClose();
                  if (onNavigateToMining) onNavigateToMining();
                }}
                className="p-4 rounded-xl bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] hover:border-[#FF7A00]/50 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-[#FF7A00]/10 text-[#FF7A00] border border-[#FF7A00]/20 mt-0.5">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white group-hover:text-[#FF7A00] transition-colors">
                        ClawRTC & Proof of Antiquity
                      </span>
                      <Badge variant="orange">RUSTCHAIN</Badge>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1 leading-relaxed">
                      Configure miner identity, observe epoch attestations, and track RTC mining rewards.
                    </p>
                  </div>
                </div>
                <ExternalLink className="w-5 h-5 text-slate-500 group-hover:text-[#FF7A00] transition-all shrink-0 ml-2" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-modals */}
      <ConnectCliModal
        isOpen={activeSubModal === 'cli'}
        onClose={() => setActiveSubModal('menu')}
        onWalletImported={(wallet) => {
          onConnected(wallet);
          setActiveSubModal('menu');
          onClose();
        }}
      />

      <AddWalletModal
        isOpen={activeSubModal === 'watch_only'}
        onClose={() => setActiveSubModal('menu')}
        onAdd={(wallet) => {
          onConnected(wallet);
          setActiveSubModal('menu');
          onClose();
        }}
      />
    </>
  );
};
