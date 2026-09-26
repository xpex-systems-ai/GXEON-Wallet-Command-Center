import React from 'react';
import { ShieldCheck, Server, RefreshCw, Cpu, User, LogOut, Cloud, HardDrive, Terminal } from 'lucide-react';
import { Badge } from '../common/Badge';
import { BridgeHealthResponse } from '../../types';
import { bridgeService } from '../../services/bridgeService';

interface NavbarProps {
  bridgeHealth: BridgeHealthResponse | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  currentUserEmail?: string | null;
  isFirebaseActive?: boolean;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  bridgeHealth,
  onRefresh,
  isRefreshing,
  currentUserEmail,
  isFirebaseActive = false,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#0B1220]/90 backdrop-blur-md border-b border-[#1E314F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#FF7A00] to-[#00D4FF] p-[1px] shadow-glow-orange flex items-center justify-center">
            <div className="w-full h-full bg-[#0B1220] rounded-[7px] flex items-center justify-center">
              <Cpu className="w-5 h-5 text-[#FF7A00]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white tracking-wider font-mono text-base">
                GXEON
              </span>
              <span className="text-[11px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#FF7A00]/20 text-[#FF7A00] border border-[#FF7A00]/40 font-bold">
                COMMAND CENTER
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono tracking-tight hidden sm:block">
              Web3 Control Plane // Local Signing Plane V1
            </p>
          </div>
        </div>

        {/* Right Status / Invariant Indicators */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Cloud / Local Mode Indicator */}
          {isFirebaseActive ? (
            <Badge variant="cyan">
              <Cloud className="w-3.5 h-3.5 inline mr-1 text-[#00D4FF]" />
              <span className="hidden sm:inline">FIREBASE</span> ONLINE
            </Badge>
          ) : (
            <Badge variant="slate">
              <HardDrive className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
              LOCAL MODE
            </Badge>
          )}

          {/* Bridge Status */}
          {bridgeHealth?.ok ? (
            <>
              <Badge variant="green" dot>
                <Server className="w-3.5 h-3.5 inline mr-1" />
                <span className="hidden md:inline">BRIDGE </span>127.0.0.1:8790
              </Badge>
              {bridgeService.isPaired() ? (
                <Badge variant="cyan" dot>
                  <Terminal className="w-3.5 h-3.5 inline mr-1" />
                  <span className="hidden sm:inline">COMPANION </span>PAIRED
                </Badge>
              ) : (
                <Badge variant="slate">
                  <Terminal className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                  <span className="hidden sm:inline">CLI </span>UNPAIRED
                </Badge>
              )}
            </>
          ) : (
            <Badge variant="amber" dot>
              <Server className="w-3.5 h-3.5 inline mr-1" />
              BRIDGE OFFLINE
            </Badge>
          )}

          {/* Security Invariant Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#111C30] border border-[#1E314F] text-xs font-mono text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>KEYS: <strong className="text-emerald-400">LOCAL ONLY</strong></span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] text-slate-300 hover:text-white transition-all disabled:opacity-50"
            title="Refresh All States"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#00D4FF]' : ''}`} />
          </button>

          {/* Operator User / Logout */}
          {currentUserEmail && onLogout && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-[#1E314F]">
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-[#111C30] border border-[#1E314F] text-[11px] font-mono text-slate-300">
                <User className="w-3.5 h-3.5 text-[#FF7A00]" />
                <span className="max-w-[120px] truncate">{currentUserEmail}</span>
              </div>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-[#111C30] hover:bg-rose-500/20 border border-[#1E314F] hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition-all"
                title="Log out of Control Plane"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
