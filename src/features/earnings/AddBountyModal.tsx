import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { BountyItem, BountyStatus, WalletItem } from '../../types';

interface AddBountyModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: WalletItem[];
  onAdd: (bounty: Omit<BountyItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const AddBountyModal: React.FC<AddBountyModalProps> = ({
  isOpen,
  onClose,
  wallets,
  onAdd,
}) => {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('RustChain Grants');
  const [expectedReward, setExpectedReward] = useState('');
  const [currency, setCurrency] = useState('RTC');
  const [destinationWalletId, setDestinationWalletId] = useState(wallets[0]?.id || '');
  const [status, setStatus] = useState<BountyStatus>('SUBMITTED');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const selectedWallet = wallets.find((w) => w.id === destinationWalletId) || wallets[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !expectedReward.trim()) return;

    onAdd({
      title: title.trim(),
      platform: platform.trim(),
      submissionDate: new Date().toISOString().split('T')[0],
      expectedReward: expectedReward.trim(),
      currency,
      destinationWalletAddress: selectedWallet ? selectedWallet.publicAddress : '',
      destinationWalletId: selectedWallet ? selectedWallet.id : undefined,
      status,
      evidenceUrl: evidenceUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in">
        <div className="flex items-center justify-between border-b border-[#1E314F] pb-4">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#00D4FF]" />
            <h2 className="text-lg font-bold text-white font-mono">Register Bounty / Task</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#152238]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div>
            <label className="text-slate-400 uppercase block mb-1">
              Task / Bounty Title <span className="text-[#FF7A00]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. RustChain CLI Security Audit & Benchmarks"
              required
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#00D4FF]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 uppercase block mb-1">Platform / Sponsor</label>
              <input
                type="text"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder="e.g. Gitcoin, RustChain, Superteam"
                className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#00D4FF]"
              />
            </div>

            <div>
              <label className="text-slate-400 uppercase block mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BountyStatus)}
                className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#00D4FF]"
              >
                <option value="DISCOVERED">DISCOVERED</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="PAYOUT_PENDING">PAYOUT_PENDING</option>
                <option value="PAID">PAID</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 uppercase block mb-1">
                Expected Reward <span className="text-[#FF7A00]">*</span>
              </label>
              <input
                type="number"
                step="any"
                value={expectedReward}
                onChange={(e) => setExpectedReward(e.target.value)}
                placeholder="250"
                required
                className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#00D4FF]"
              />
            </div>

            <div>
              <label className="text-slate-400 uppercase block mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#00D4FF]"
              >
                <option value="RTC">RTC (RustChain)</option>
                <option value="USDC">USDC</option>
                <option value="ETH">ETH</option>
                <option value="SOL">SOL</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 uppercase block mb-1">Destination Wallet</label>
            <select
              value={destinationWalletId}
              onChange={(e) => setDestinationWalletId(e.target.value)}
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#00D4FF]"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.network}) - {w.publicAddress.slice(0, 10)}...
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-400 uppercase block mb-1">Evidence / PR URL</label>
            <input
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://github.com/.../issues/123"
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#00D4FF]"
            />
          </div>

          <div>
            <label className="text-slate-400 uppercase block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal tracking notes"
              className="w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#00D4FF]"
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
              className="px-4 py-2 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-bold rounded-lg shadow-glow-cyan"
            >
              Add Bounty
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
