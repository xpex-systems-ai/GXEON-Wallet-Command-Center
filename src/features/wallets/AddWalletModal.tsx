import React, { useState } from 'react';
import { X, Shield, AlertTriangle, Plus } from 'lucide-react';
import { WalletItem } from '../../types';

interface AddWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (wallet: Omit<WalletItem, 'id'>) => void;
}

export const AddWalletModal: React.FC<AddWalletModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [name, setName] = useState('');
  const [network, setNetwork] = useState('rustchain');
  const [symbol, setSymbol] = useState('RTC');
  const [publicAddress, setPublicAddress] = useState('');
  const [purpose, setPurpose] = useState('bounties');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNetworkChange = (net: string) => {
    setNetwork(net);
    if (net === 'rustchain') setSymbol('RTC');
    else if (net === 'ethereum' || net === 'base' || net === 'arbitrum') setSymbol('ETH');
    else if (net === 'polygon') setSymbol('POL');
    else if (net === 'solana') setSymbol('SOL');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedAddr = publicAddress.trim();

    if (!trimmedAddr) {
      setError('Public address is required.');
      return;
    }

    // Security heuristic check: prevent user from pasting a 12/24 word seed phrase or raw private key
    if (trimmedAddr.includes(' ') && trimmedAddr.split(' ').length >= 12) {
      setError('SECURITY VIOLATION: Never enter a seed phrase. Enter only a public address.');
      return;
    }

    if (trimmedAddr.length === 64 && !trimmedAddr.startsWith('0x') && !trimmedAddr.startsWith('RTC')) {
      setError('SECURITY WARNING: This looks like a raw private key. Only public addresses are permitted.');
      return;
    }

    onAdd({
      name: name.trim() || `${network.toUpperCase()} Watch Wallet`,
      network,
      symbol,
      publicAddress: trimmedAddr,
      connectionType: 'WATCH_ONLY',
      ownershipStatus: 'UNVERIFIED',
      mode: 'watch_only',
      balance: null,
      purpose,
      notes: notes.trim() || 'Watch-only wallet registered manually.',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in">
        <div className="flex items-center justify-between border-b border-[#1E314F] pb-4">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#FF7A00]" />
            <h2 className="text-lg font-bold text-white font-mono">
              Register Watch-Only Wallet
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#152238]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Alert Banner */}
        <div className="bg-[#FF7A00]/10 border border-[#FF7A00]/30 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-[#FF7A00] shrink-0 mt-0.5" />
          <p>
            <strong className="text-[#FF7A00]">PUBLIC ADDRESS ONLY:</strong> Never provide seed phrases or private keys. New addresses are created with <code className="text-white">UNVERIFIED</code> ownership status.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div>
            <label className="text-slate-400 uppercase block mb-1">Network</label>
            <select
              value={network}
              onChange={(e) => handleNetworkChange(e.target.value)}
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#FF7A00]"
            >
              <option value="rustchain">RustChain (RTC)</option>
              <option value="ethereum">Ethereum (ETH)</option>
              <option value="base">Base (ETH)</option>
              <option value="polygon">Polygon (POL)</option>
              <option value="arbitrum">Arbitrum One (ETH)</option>
              <option value="solana">Solana (SOL - Watch)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 uppercase block mb-1">Wallet Name / Label</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. RustChain Bounty Receiver"
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#FF7A00]"
            />
          </div>

          <div>
            <label className="text-slate-400 uppercase block mb-1">
              Public Address <span className="text-[#FF7A00]">*</span>
            </label>
            <input
              type="text"
              value={publicAddress}
              onChange={(e) => setPublicAddress(e.target.value)}
              placeholder="e.g. RTC... or 0x..."
              required
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-[#FF7A00]"
            />
          </div>

          <div>
            <label className="text-slate-400 uppercase block mb-1">Purpose</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="bounties, grants, operations"
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#FF7A00]"
            />
          </div>

          <div>
            <label className="text-slate-400 uppercase block mb-1">Notes / Context</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes regarding bounty verification"
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#FF7A00]"
            />
          </div>

          <div className="pt-3 border-t border-[#1E314F] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#152238] hover:bg-[#1E314F] text-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-black font-bold rounded-lg shadow-glow-orange"
            >
              Register Address
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
