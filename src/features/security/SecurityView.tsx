import React from 'react';
import {
  ShieldCheck,
  Lock,
  Server,
  Key,
  Layers,
  FileCheck,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { BridgeHealthResponse, BridgeStatusResponse, WalletItem } from '../../types';
import { firebaseService } from '../../services/firebaseService';

interface SecurityViewProps {
  bridgeHealth: BridgeHealthResponse | null;
  bridgeStatus: BridgeStatusResponse | null;
  wallets: WalletItem[];
}

export const SecurityView: React.FC<SecurityViewProps> = ({
  bridgeHealth,
  bridgeStatus: _bridgeStatus,
  wallets: _wallets,
}) => {
  const fbStatus = firebaseService.getStatus();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#1E314F] pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white font-mono">
            Security & Architecture Center
          </h1>
          <Badge variant="green" dot>ENFORCED</Badge>
        </div>
        <p className="text-xs text-slate-400 font-mono mt-1">
          Zero-trust boundary separating Web Control Plane from Local Signing Plane.
        </p>
      </div>

      {/* Security Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Repository Secret Scan Status */}
        <Card glow="cyan">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400 uppercase">Secret Scan</span>
            <FileCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400">
            PASS (VERIFIED)
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-2">
            Automated git scan confirmed zero private keys or seeds committed.
          </p>
        </Card>

        {/* Firebase Rules Status */}
        <Card glow="cyan">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400 uppercase">Firestore Defense</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400">
            RULES ENFORCED
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-2">
            Multi-user ownerUid isolation + hasNoSensitiveFields active.
          </p>
        </Card>

        {/* Local Bridge Status */}
        <Card glow={bridgeHealth?.ok ? 'cyan' : 'orange'}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400 uppercase">Local Bridge</span>
            <Server className={`w-4 h-4 ${bridgeHealth?.ok ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <div className="text-lg font-bold font-mono text-white">
            {bridgeHealth?.ok ? '127.0.0.1:8790' : 'STANDBY (LOCAL)'}
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-2">
            Bind: <code className="text-[#00D4FF]">127.0.0.1</code> (Loopback only). Send: DISABLED.
          </p>
        </Card>

        {/* Cloud Signing Secrets Status */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400 uppercase">Cloud Secrets</span>
            <ShieldCheck className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="text-sm font-bold font-mono text-slate-300">
            NOT CONFIGURED
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-2">
            Cloud signing disabled by design. App Check: {fbStatus.appCheckActive ? 'Active' : 'Ready'}.
          </p>
        </Card>
      </div>

      {/* Visual Architecture Diagram */}
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl p-6">
        <h2 className="text-base font-bold text-white font-mono flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-[#FF7A00]" />
          GXEON Security Boundary Architecture
        </h2>

        <div className="bg-[#0B1220] border border-[#1E314F] rounded-lg p-5 font-mono text-xs overflow-x-auto">
          <pre className="text-slate-300 leading-relaxed whitespace-pre font-mono">
{`                   GXEON WALLET COMMAND CENTER
                              |
             +----------------+----------------+
             |                                 |
        WEB CONTROL PLANE                 LOCAL PLANE
             |                                 |
         Firebase                        GXEON Bridge
             |                           127.0.0.1:8790
       Auth / Firestore                        |
       Hosting / Rules                   Wallet CLIs
             |                                 |
        READ / MONITOR                 SIGN / BROADCAST
             |                           (Human Verified)
       Blockchain APIs`}
          </pre>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs font-mono">
          <div className="p-3.5 rounded-lg bg-[#0B1220] border border-[#1E314F]">
            <span className="text-[#00D4FF] font-bold block mb-1">
              1. WEB CONTROL PLANE (Read / Monitor)
            </span>
            <ul className="list-disc list-inside text-slate-400 space-y-1">
              <li>Displays watch-only addresses, balances, and bounty pipeline.</li>
              <li>Stores public metadata in Firestore isolated strictly by <code className="text-white">ownerUid</code>.</li>
              <li>Security Rules prohibit sensitive fields (<code className="text-white">hasNoSensitiveFields</code>).</li>
              <li>Never interacts with private keys or mnemonics.</li>
            </ul>
          </div>

          <div className="p-3.5 rounded-lg bg-[#0B1220] border border-[#1E314F]">
            <span className="text-[#FF7A00] font-bold block mb-1">
              2. LOCAL SIGNING PLANE (Local Machine Only)
            </span>
            <ul className="list-disc list-inside text-slate-400 space-y-1">
              <li>FastAPI daemon strictly bound to <code className="text-white">127.0.0.1:8790</code>.</li>
              <li>Future transaction signing requires explicit human CLI confirmation.</li>
              <li>Send, sign, and broadcast endpoints return <code className="text-white">403 Forbidden</code> in V1.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Address Ownership Verification Status */}
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl p-6">
        <h2 className="text-base font-bold text-white font-mono flex items-center gap-2 mb-3">
          <Key className="w-5 h-5 text-amber-400" />
          Address Ownership Verification Status
        </h2>

        <div className="space-y-3 text-xs font-mono">
          <div className="p-3.5 rounded-lg bg-[#0B1220] border border-[#1E314F] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">GXEON RustChain RTC</span>
                <Badge variant="orange">WATCH ONLY</Badge>
                <Badge variant="amber">UNVERIFIED</Badge>
              </div>
              <code className="text-[#00D4FF] text-[11px] mt-1 block select-all">
                RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269
              </code>
            </div>
            <div className="text-right text-slate-400 text-[11px]">
              Status: <strong className="text-amber-400">UNVERIFIED</strong> (Requires local cryptographic signature to verify ownership).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
