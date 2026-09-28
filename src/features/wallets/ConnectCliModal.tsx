import React, { useState, useEffect } from 'react';
import {
  Terminal,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  ArrowRight,
  Cpu,
  Unplug,
  HardDriveDownload,
  XCircle,
} from 'lucide-react';
import { bridgeService } from '../../services/bridgeService';
import { BridgeDetectionResult, DetectedWallet, WalletItem } from '../../types';
import { Badge } from '../../components/common/Badge';

interface ConnectCliModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletImported: (wallet: Omit<WalletItem, 'id'>) => void;
}

export const ConnectCliModal: React.FC<ConnectCliModalProps> = ({
  isOpen,
  onClose,
  onWalletImported,
}) => {
  const [step, setStep] = useState<'check' | 'pair' | 'detected' | 'import_done'>('check');
  const [isCheckingBridge, setIsCheckingBridge] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [detectionData, setDetectionData] = useState<BridgeDetectionResult | null>(null);
  const [importedWallets, setImportedWallets] = useState<Set<string>>(new Set());
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedPairCmd, setCopiedPairCmd] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkBridgeStatus();
    } else {
      setStep('check');
      setInputCode('');
      setPairingError(null);
    }
  }, [isOpen]);

  const checkBridgeStatus = async () => {
    setIsCheckingBridge(true);
    setPairingError(null);
    try {
      const health = await bridgeService.getHealth();
      const online = Boolean(health?.ok);

      if (online) {
        // If already paired in this session, jump directly to detection
        if (bridgeService.isPaired()) {
          fetchDetection();
        } else {
          setStep('pair');
        }
      } else {
        setStep('check');
      }
    } catch {
      setStep('check');
    } finally {
      setIsCheckingBridge(false);
    }
  };

  const handleConfirmPairing = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputCode || inputCode.length !== 6) {
      setPairingError('Enter a valid 6-digit numeric pairing code.');
      return;
    }

    setIsPairing(true);
    setPairingError(null);

    try {
      const result = await bridgeService.confirmPairing(inputCode);
      if (result.success) {
        await fetchDetection();
      } else {
        setPairingError(result.error || 'Pairing confirmation failed.');
      }
    } catch {
      setPairingError('Could not verify pairing code with local companion.');
    } finally {
      setIsPairing(false);
    }
  };

  const fetchDetection = async () => {
    try {
      const detection = await bridgeService.detectToolsAndWallets();
      setDetectionData(detection);
      setStep('detected');
    } catch {
      setPairingError('Failed to scan local tooling.');
    }
  };

  const handleImportWallet = (w: DetectedWallet) => {
    onWalletImported({
      name: w.name,
      network: w.network,
      symbol: w.symbol,
      publicAddress: w.publicAddress,
      connectionType: 'LOCAL_CONFIG',
      mode: 'watch_only',
      ownershipStatus: 'UNVERIFIED',
      purpose: w.purpose || 'Local CLI Companion Discovery',
      notes: 'Imported via GXEON Local Companion V1.1 zero-trust pairing',
    });
    setImportedWallets((prev) => new Set(prev).add(w.id));
  };

  const copyLaunchCommand = () => {
    navigator.clipboard.writeText('python bridge.py');
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0F172A] border border-[#1E314F] rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E314F] bg-[#111C30]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF7A00] to-[#00D4FF] p-[1px] flex items-center justify-center shadow-glow-orange">
              <div className="w-full h-full bg-[#0B1220] rounded-[11px] flex items-center justify-center">
                <Terminal className="w-5 h-5 text-[#FF7A00]" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                GXEON LOCAL COMPANION
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40 font-bold">
                  CLI PAIRING V1.1
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Few-click non-custodial local wallet discovery
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

        {/* Security Invariant Banner */}
        <div className="px-6 py-2.5 bg-[#0B1220] border-b border-[#1E314F] flex items-center gap-2 text-xs font-mono text-emerald-400">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>
            <strong>ZERO-TRUST INVARIANT:</strong> Private keys never leave your machine. The companion only exposes public addresses.
          </span>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* STEP 1: Bridge Offline Warning */}
          {step === 'check' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs font-mono text-amber-200">
                  <div className="font-bold text-sm text-amber-300">COMPANION BRIDGE OFFLINE (127.0.0.1:8790)</div>
                  <p>
                    The GXEON Local Companion is not running on your machine. Start it locally to detect installed CLIs and public wallets.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#111C30] border border-[#1E314F] space-y-3">
                <div className="text-xs font-mono text-slate-300 font-bold">1. START LOCAL COMPANION:</div>
                <div className="flex items-center justify-between gap-2 p-3 bg-[#0B1220] rounded-lg border border-[#1E314F] font-mono text-xs text-emerald-400">
                  <span>python bridge.py</span>
                  <button
                    onClick={copyLaunchCommand}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1E314F] hover:bg-[#2A436B] text-white text-xs transition-all"
                  >
                    {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="text-xs font-mono text-slate-300 font-bold pt-2">2. OR USE WINDOWS LAUNCHER:</div>
                <div className="text-xs font-mono text-slate-400">
                  Double-click <code className="text-[#FF7A00]">Start-GXEON-Companion.cmd</code> in repository root.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={checkBridgeStatus}
                  disabled={isCheckingBridge}
                  className="px-5 py-2.5 rounded-lg bg-[#FF7A00] hover:bg-[#FF8B1F] text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-glow-orange disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingBridge ? 'animate-spin' : ''}`} />
                  {isCheckingBridge ? 'CHECKING...' : 'RE-CHECK BRIDGE'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 & 3: Pairing Code */}
          {step === 'pair' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-[#111C30] border border-[#1E314F] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono text-emerald-300 font-bold">COMPANION BRIDGE CONNECTED (127.0.0.1:8790)</span>
                </div>
                <Badge variant="green">ONLINE</Badge>
              </div>

              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#0B1220] border border-[#1E314F] space-y-2">
                  <div className="text-xs font-mono text-slate-300 font-bold">
                    GENERATE PAIRING CODE IN YOUR TERMINAL:
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
                    For zero-trust security, pairing codes are generated and displayed solely inside your local CLI.
                  </p>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-[#111C30] rounded-lg border border-[#1E314F] font-mono text-xs text-[#00D4FF]">
                    <span>python gxeon_wallet.py pair</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('python gxeon_wallet.py pair');
                        setCopiedPairCmd(true);
                        setTimeout(() => setCopiedPairCmd(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1E314F] hover:bg-[#2A436B] text-white text-[11px] transition-all"
                    >
                      {copiedPairCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPairCmd ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="text-xs font-mono text-slate-300">
                  Enter the <strong>6-digit Pairing Code</strong> printed in your terminal:
                </div>

                <form onSubmit={handleConfirmPairing} className="space-y-4">
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full bg-[#111C30] border border-[#1E314F] rounded-lg pl-10 pr-4 py-2.5 text-center font-mono font-bold text-lg text-[#00D4FF] tracking-[0.3em] placeholder-slate-600 focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>

                  {pairingError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-mono text-rose-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <span>{pairingError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg bg-[#111C30] hover:bg-[#1E314F] text-slate-400 text-xs font-mono"
                    >
                      CANCEL
                    </button>
                    <button
                      type="submit"
                      disabled={isPairing || inputCode.length !== 6}
                      className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#FF7A00] to-[#E06A00] hover:from-[#FF8B1F] hover:to-[#FF7A00] text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-glow-orange disabled:opacity-50"
                    >
                      {isPairing ? 'VERIFYING...' : 'CONFIRM PAIRING'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* STEP 4 & 5: Detected Tools & Public Addresses */}
          {step === 'detected' && detectionData && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-mono text-emerald-300 font-bold">COMPANION PAIRING ACTIVE</span>
                </div>
                <Badge variant="green">PAIRED (1h TTL)</Badge>
              </div>

              {/* Detected CLI Tools */}
              <div className="space-y-3">
                <div className="text-xs font-mono text-slate-300 font-bold flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#FF7A00]" />
                  LOCAL TOOLING DETECTED:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {detectionData.tools.map((t) => (
                    <div
                      key={t.tool}
                      className="p-3 rounded-lg bg-[#111C30] border border-[#1E314F] flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-mono font-bold text-white">{t.tool}</div>
                        <div className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]">
                          {t.version || (t.installed ? 'Detected' : 'Not installed')}
                        </div>
                      </div>
                      <Badge variant={t.installed ? 'cyan' : 'slate'}>
                        {t.installed ? 'DETECTED' : 'NOT FOUND'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Detected CLI Public Wallets */}
              {detectionData.detected_wallets.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-mono text-slate-300 font-bold flex items-center gap-2">
                    <HardDriveDownload className="w-4 h-4 text-[#00D4FF]" />
                    DISCOVERED CLI WALLETS ({detectionData.detected_wallets.length}):
                  </div>

                  <div className="space-y-2.5">
                    {detectionData.detected_wallets.map((w) => {
                      const isImported = importedWallets.has(w.id);
                      return (
                        <div
                          key={w.id}
                          className="p-3 rounded-xl bg-[#111C30] border border-[#1E314F] flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-white">{w.name}</span>
                              <Badge variant="orange">{w.network.toUpperCase()}</Badge>
                              <Badge variant="cyan">CLI DISCOVERED</Badge>
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 truncate max-w-sm">
                              {w.publicAddress}
                            </div>
                          </div>

                          <button
                            onClick={() => handleImportWallet(w)}
                            disabled={isImported}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 ${
                              isImported
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-[#FF7A00] hover:bg-[#FF8B1F] text-black shadow-glow-orange'
                            }`}
                          >
                            {isImported ? 'ADDED' : 'ADD TO GXEON'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Statically Configured Watch-Only Wallets */}
              {detectionData.registered_wallets && detectionData.registered_wallets.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-mono text-slate-300 font-bold flex items-center gap-2">
                    <HardDriveDownload className="w-4 h-4 text-[#FF7A00]" />
                    REGISTERED WATCH-ONLY CONFIGURATIONS ({detectionData.registered_wallets.length}):
                  </div>

                  <div className="space-y-2.5">
                    {detectionData.registered_wallets.map((w) => {
                      const isImported = importedWallets.has(w.id);
                      return (
                        <div
                          key={w.id}
                          className="p-3 rounded-xl bg-[#111C30] border border-[#1E314F] flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-white">{w.name}</span>
                              <Badge variant="orange">{w.network.toUpperCase()}</Badge>
                              <Badge variant="slate">WATCH-ONLY</Badge>
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 truncate max-w-sm">
                              {w.publicAddress}
                            </div>
                          </div>

                          <button
                            onClick={() => handleImportWallet(w)}
                            disabled={isImported}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 ${
                              isImported
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-[#FF7A00] hover:bg-[#FF8B1F] text-black shadow-glow-orange'
                            }`}
                          >
                            {isImported ? 'ADDED' : 'ADD TO GXEON'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-[#1E314F]">
                <button
                  type="button"
                  onClick={async () => {
                    await bridgeService.revokePairing();
                    setStep('check');
                    checkBridgeStatus();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-mono flex items-center gap-1.5"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span>REVOKE SESSION</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-[#1E314F] hover:bg-[#2A436B] text-white text-xs font-mono font-bold"
                >
                  DONE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
