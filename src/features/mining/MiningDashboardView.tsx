import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  ShieldCheck,
  Zap,
  RefreshCw,
  Play,
  Square,
  Settings,
  Clock,
  Coins,
  CheckCircle2,
  Activity,
  Bot,
  Terminal,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import {
  ProofOfAntiquityState,
  RewardHistoryItem,
  PendingRewardItem,
  MiningAgentState,
} from '../../types';
import { clawRtcService } from '../../services/clawRtcService';
import { rustchainService } from '../../services/rustchainService';
import { miningAgent } from '../../services/quantumAgents';
import { bridgeService } from '../../services/bridgeService';

interface MiningDashboardViewProps {
  onAddToast?: (type: 'success' | 'error' | 'info' | 'warning', title: string, description?: string) => void;
}

export const MiningDashboardView: React.FC<MiningDashboardViewProps> = ({
  onAddToast,
}) => {
  const [miningState, setMiningState] = useState<ProofOfAntiquityState>({
    status: 'ERROR',
    clawrtc_installed: false,
    clawrtc_version: null,
    miner_id: null,
    reward_destination: null,
    config_source: 'UNAVAILABLE',
    hardware: {
      cpu_arch: 'UNKNOWN',
      processor: 'UNKNOWN',
      os: 'UNKNOWN',
      compatibility: 'UNKNOWN',
    },
    attestation_state: 'UNATTESTED',
    last_attestation_timestamp: null,
    current_epoch: null,
    antiquity_multiplier: null,
    confirmed_rtc: null,
    pending_rewards: null,
    source: 'bridge_unavailable',
    queried_at: new Date().toISOString(),
  });

  const [pendingRewards, setPendingRewards] = useState<PendingRewardItem[]>([]);
  const [rewardHistory, setRewardHistory] = useState<RewardHistoryItem[]>([]);
  const [pendingRewardsStatus, setPendingRewardsStatus] = useState<'AVAILABLE' | 'UNAVAILABLE'>('UNAVAILABLE');
  const [rewardHistoryStatus, setRewardHistoryStatus] = useState<'AVAILABLE' | 'UNAVAILABLE'>('UNAVAILABLE');
  const [agentState, setAgentState] = useState<MiningAgentState>(miningAgent.getState());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // Configuration form state
  const [configMinerId, setConfigMinerId] = useState('');
  const [configRewardDest, setConfigRewardDest] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);

  const isPaired = bridgeService.isPaired();

  const refreshMiningData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const liveState = await clawRtcService.getStatus();
      setMiningState(liveState);

      const [pendingRes, historyRes] = await Promise.all([
        rustchainService.getPendingRewards(liveState.miner_id || null),
        rustchainService.getRewardHistory(liveState.miner_id || null),
      ]);
      setPendingRewards(pendingRes.pending || []);
      setRewardHistory(historyRes.rewards || []);
      setPendingRewardsStatus(pendingRes.status);
      setRewardHistoryStatus(historyRes.status);

      // Run mining agent observer assessment
      const agentUpdate = miningAgent.evaluate(liveState);
      setAgentState(agentUpdate);
    } catch (err) {
      console.error('Failed to load mining status:', err);
      if (onAddToast) {
        onAddToast('error', 'Mining Status Error', 'Unable to retrieve status from local bridge.');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [onAddToast]);

  useEffect(() => {
    if (!bridgeService.isPaired()) return;
    refreshMiningData();
    const interval = setInterval(() => {
      if (bridgeService.isPaired()) refreshMiningData();
    }, 15000);
    return () => clearInterval(interval);
  }, [refreshMiningData, isPaired]);

  const handleStartMining = async () => {
    setIsActionPending(true);
    const result = await clawRtcService.startMining();
    setIsActionPending(false);
    if (result.success) {
      if (onAddToast) onAddToast('success', 'Mining Started', 'ClawRTC process initiated.');
      refreshMiningData();
    } else {
      if (onAddToast) onAddToast('warning', 'Mining Start Blocked', result.message || 'Failed to start mining.');
    }
  };

  const handleStopMining = async () => {
    setIsActionPending(true);
    const result = await clawRtcService.stopMining();
    setIsActionPending(false);
    if (result.success) {
      if (onAddToast) onAddToast('info', 'Mining Stopped', 'Mining process halted safely.');
      refreshMiningData();
    } else {
      if (onAddToast) onAddToast('error', 'Stop Failed', result.message || 'Failed to stop mining.');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configMinerId.trim()) return;
    setIsActionPending(true);
    const res = await clawRtcService.configure(configMinerId.trim(), configRewardDest.trim() || undefined);
    setIsActionPending(false);
    if (res.success) {
      if (onAddToast) onAddToast('success', 'Configured', `Mining identity configured (${res.configSource}).`);
      setShowConfigModal(false);
      refreshMiningData();
    } else {
      if (onAddToast) onAddToast('warning', 'Config Blocked', res.message || 'Failed to update configuration.');
    }
  };

  const getStatusBadge = (status: ProofOfAntiquityState['status']) => {
    switch (status) {
      case 'MINING':
        return <Badge variant="green" dot>ACTIVE MINING</Badge>;
      case 'CONFIGURED':
      case 'INSTALLED':
        return <Badge variant="cyan" dot>READY</Badge>;
      case 'NOT_CONFIGURED':
        return <Badge variant="orange">CONFIGURE MINER</Badge>;
      case 'NOT_INSTALLED':
        return <Badge variant="slate">NOT INSTALLED</Badge>;
      case 'ERROR':
        return <Badge variant="red" dot>ERROR</Badge>;
      default:
        return <Badge variant="slate">STOPPED</Badge>;
    }
  };

  const getAttestationBadge = (attestation: ProofOfAntiquityState['attestation_state']) => {
    switch (attestation) {
      case 'ATTESTED':
        return <Badge variant="green">CONFIRMED</Badge>;
      case 'PENDING':
        return <Badge variant="cyan">PENDING</Badge>;
      case 'FAILED':
        return <Badge variant="red">REJECTED</Badge>;
      case 'EXPIRED':
        return <Badge variant="amber">EXPIRED</Badge>;
      default:
        return <Badge variant="slate">UNATTESTED</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#111C30] via-[#152238] to-[#111C30] border border-[#1E314F] p-6">
        <div className="absolute right-0 top-0 w-96 h-full bg-gradient-to-l from-[#FF7A00]/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-[#FF7A00] tracking-widest uppercase">
                RUSTCHAIN PROTOCOL
              </span>
              <span className="text-slate-600">//</span>
              <span className="text-xs font-mono text-slate-400">Proof of Antiquity</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight flex items-center gap-3">
              ClawRTC Mining & Attestation Hub
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Local miner process monitoring with attestation/reward fields shown only when a verified RustChain source is available.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={refreshMiningData}
              disabled={isRefreshing}
              className="px-3.5 py-2 bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] text-slate-200 text-xs font-mono rounded-lg transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#00D4FF]' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                setConfigMinerId(miningState.miner_id || '');
                setConfigRewardDest(miningState.reward_destination || '');
                setShowConfigModal(true);
              }}
              className="px-3.5 py-2 bg-[#152238] hover:bg-[#1E314F] border border-[#1E314F] text-slate-200 text-xs font-mono rounded-lg transition-all flex items-center gap-2"
            >
              <Settings className="w-4 h-4 text-[#FF7A00]" />
              Configure
            </button>
            {miningState.status === 'MINING' ? (
              <button
                onClick={handleStopMining}
                disabled={isActionPending}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-mono text-xs font-bold rounded-lg transition-all flex items-center gap-2 shadow-sm"
              >
                <Square className="w-4 h-4" />
                Stop Mining
              </button>
            ) : (
              <button
                onClick={handleStartMining}
                disabled={isActionPending}
                className="px-4 py-2 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-black font-mono text-xs font-bold rounded-lg transition-all shadow-glow-orange flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Mining
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Critical Architecture Notice: Invariant Guard */}
      <div className="p-4 rounded-xl bg-[#111C30] border-l-4 border-[#00D4FF] border-y border-r border-[#1E314F] text-xs font-mono text-slate-300">
        <div className="flex items-center gap-2 font-bold text-[#00D4FF] mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>CRITICAL IDENTITY INVARIANT</span>
        </div>
        <p>
          RTC Public Address (<code className="text-[#FF7A00]">RTC82c21b...</code>) and RustChain <code className="text-white">miner_id</code> are strictly distinct entities.
          The public address is the payout receiver, while miner_id is the cryptographic hardware attestation subject.
        </p>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Miner Status */}
        <Card glow={miningState.status === 'MINING' ? 'orange' : undefined}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Miner Status
            </span>
            <Cpu className="w-4 h-4 text-[#FF7A00]" />
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              {getStatusBadge(miningState.status)}
            </div>
            <div className="text-xs text-slate-400 mt-2 font-mono truncate">
              ID: <span className="text-white">{miningState.miner_id || 'Unconfigured'}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] font-mono flex items-center justify-between">
            <span className="text-slate-400">ClawRTC:</span>
            {miningState.clawrtc_installed ? (
              <span className="text-emerald-400 font-bold">INSTALLED</span>
            ) : (
              <span className="text-slate-400">NOT FOUND</span>
            )}
          </div>
        </Card>

        {/* Card 2: Antiquity Multiplier & Epoch */}
        <Card glow="cyan">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Proof of Antiquity
            </span>
            <Zap className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              {miningState.antiquity_multiplier ? `${miningState.antiquity_multiplier}x` : 'UNCONFIRMED'}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono flex items-center gap-1.5">
              <span>Attestation:</span>
              {getAttestationBadge(miningState.attestation_state)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] font-mono flex items-center justify-between">
            <span className="text-slate-400">Epoch:</span>
            <span className="text-[#00D4FF] font-bold">
              {miningState.current_epoch ? `#${miningState.current_epoch}` : 'UNAVAILABLE'}
            </span>
          </div>
        </Card>

        {/* Card 3: Pending Rewards */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Pending Epoch Rewards
            </span>
            <Coins className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-amber-400">
              {miningState.pending_rewards !== null && miningState.pending_rewards !== undefined
                ? `${miningState.pending_rewards} RTC`
                : 'UNAVAILABLE'}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono">
              Subject to epoch block finalization
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] text-slate-400 font-mono flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Multi-epoch batch distribution</span>
          </div>
        </Card>

        {/* Card 4: Confirmed Mined RTC */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Confirmed Mined RTC
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {miningState.confirmed_rtc !== null && miningState.confirmed_rtc !== undefined
                ? `${miningState.confirmed_rtc} RTC`
                : 'UNAVAILABLE'}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono truncate">
              To: {miningState.reward_destination ? `${miningState.reward_destination.slice(0, 10)}...` : 'Not Set'}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E314F] text-[11px] text-slate-400 font-mono">
            * Verified on-chain receipts only
          </div>
        </Card>
      </div>

      {/* Two Column Grid: Hardware & Agent Observer / Rewards History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Hardware Attestation Details & Payout History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hardware & Attestation Details Card */}
          <Card>
            <div className="flex items-center justify-between pb-3 border-b border-[#1E314F]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#FF7A00]" />
                <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                  Hardware Environment & Node Attestation
                </h2>
              </div>
              <Badge variant={isPaired ? 'cyan' : 'slate'}>
                {isPaired ? 'COMPANION PAIRED' : 'UNPAIRED'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 font-mono text-xs">
              <div className="p-3 bg-[#0B1220] rounded-lg border border-[#1E314F]">
                <div className="text-slate-400 mb-1">CPU ARCHITECTURE / MODEL</div>
                <div className="text-white font-bold truncate">
                  {miningState.hardware?.processor || 'Standard CPU'}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Architecture: {miningState.hardware?.cpu_arch || 'x86_64'}
                </div>
              </div>

              <div className="p-3 bg-[#0B1220] rounded-lg border border-[#1E314F]">
                <div className="text-slate-400 mb-1">NODE RUNTIME & OS</div>
                <div className="text-white font-bold truncate">
                  {miningState.hardware?.os || 'Windows NT / POSIX compatible'}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Local Bridge Port: 127.0.0.1:8790
                </div>
              </div>

              <div className="p-3 bg-[#0B1220] rounded-lg border border-[#1E314F] sm:col-span-2">
                <div className="text-slate-400 mb-1">REWARD DESTINATION (RTC WALLET)</div>
                <div className="text-[#00D4FF] font-bold select-all break-all">
                  {miningState.reward_destination || 'NOT CONFIGURED'}
                </div>
              </div>
            </div>
          </Card>

          {/* Pending Rewards Table */}
          <Card>
            <div className="flex items-center justify-between pb-3 border-b border-[#1E314F]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                  Epoch Reward Pipeline ({pendingRewards.length})
                </h2>
              </div>
            </div>

            {pendingRewardsStatus === 'UNAVAILABLE' ? (
              <div className="p-8 text-center text-xs font-mono text-amber-400">
                Reward source UNAVAILABLE — no verified RustChain reward endpoint is connected.
              </div>
            ) : pendingRewards.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400">
                Verified reward source is available and returned no pending rewards.
              </div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-[#1E314F] text-slate-400">
                      <th className="pb-2">Epoch #</th>
                      <th className="pb-2">Estimated RTC</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E314F]">
                    {pendingRewards.map((reward) => (
                      <tr key={reward.id} className="text-slate-200">
                        <td className="py-2.5 text-[#00D4FF]">#{reward.epoch}</td>
                        <td className="py-2.5 font-bold text-amber-400">{reward.estimatedAmount} RTC</td>
                        <td className="py-2.5">
                          <Badge variant="cyan">{reward.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Col: Mining Agent Observer & Quick Guide */}
        <div className="space-y-6">
          {/* Quantum Mining Observer Agent */}
          <Card glow="cyan">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E314F]">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#00D4FF]" />
                <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                  Mining Observer Agent
                </h2>
              </div>
              <Badge variant="cyan">READ ONLY</Badge>
            </div>

            <div className="mt-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Agent Status:</span>
                <span className="text-emerald-400 font-bold">
                  {agentState.isObserving ? 'ACTIVE OBSERVER' : 'IDLE'}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-400">
                <span>Observed Miner State:</span>
                <span className="text-white font-bold">{agentState.minerStatus}</span>
              </div>

              <div className="flex items-center justify-between text-slate-400">
                <span>Attestation Stream:</span>
                <span className={agentState.activeAttestation ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {agentState.activeAttestation ? 'LIVE ATTESTING' : 'IDLE'}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-400 text-[10px]">
                <span>Historical Events Tracked:</span>
                <span className="text-slate-300">{rewardHistoryStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : rewardHistory.length}</span>
              </div>

              <div className="p-3 bg-[#0B1220] rounded-lg border border-[#1E314F]">
                <div className="text-slate-400 text-[10px] mb-1">AGENT RECOMMENDATIONS</div>
                {agentState.recommendations.length === 0 ? (
                  <div className="text-slate-400 text-[11px]">System operating optimally.</div>
                ) : (
                  <ul className="space-y-1 text-slate-200 text-[11px] list-disc list-inside">
                    {agentState.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {/* Quick CLI Reference */}
          <Card>
            <div className="flex items-center gap-2 pb-3 border-b border-[#1E314F]">
              <Terminal className="w-4 h-4 text-[#FF7A00]" />
              <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                CLI Commands
              </h2>
            </div>

            <div className="mt-4 space-y-2 font-mono text-xs">
              <div className="p-2 bg-[#0B1220] rounded border border-[#1E314F]">
                <code className="text-[#00D4FF]">python gxeon_wallet.py mining status</code>
              </div>
              <div className="p-2 bg-[#0B1220] rounded border border-[#1E314F]">
                <code className="text-[#00D4FF]">python gxeon_wallet.py mining start</code>
              </div>
              <div className="p-2 bg-[#0B1220] rounded border border-[#1E314F]">
                <code className="text-[#00D4FF]">python gxeon_wallet.py mining stop</code>
              </div>
              <div className="p-2 bg-[#0B1220] rounded border border-[#1E314F]">
                <code className="text-[#00D4FF]">python gxeon_wallet.py rustchain balance</code>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#0F172A] border border-[#1E314F] rounded-xl p-6 shadow-2xl text-slate-100 font-mono">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E314F] mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#FF7A00]" />
                Configure Mining Identity
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Miner ID / Hardware Handle</label>
                <input
                  type="text"
                  value={configMinerId}
                  onChange={(e) => setConfigMinerId(e.target.value)}
                  placeholder="e.g. gxeon-alpha-node-01"
                  className="w-full px-3 py-2 bg-[#0B1220] border border-[#1E314F] rounded text-white focus:outline-none focus:border-[#FF7A00]"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Reward Destination (RTC Address)</label>
                <input
                  type="text"
                  value={configRewardDest}
                  onChange={(e) => setConfigRewardDest(e.target.value)}
                  placeholder="RTC..."
                  className="w-full px-3 py-2 bg-[#0B1220] border border-[#1E314F] rounded text-white focus:outline-none focus:border-[#FF7A00]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-[#152238] hover:bg-[#1E314F] text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionPending}
                  className="px-4 py-2 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-black font-bold rounded shadow-glow-orange"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
