import React from 'react';
import { Shield, Terminal, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-[#1E314F] bg-[#0B1220] py-6 px-4 sm:px-6 lg:px-8 mt-auto text-xs font-mono text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>GXEON SECURITY MODEL: Control Plane (Web/Cloud) ≠ Signing Plane (Local CLI).</span>
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1 text-slate-400">
            <Lock className="w-3.5 h-3.5 text-[#FF7A00]" /> Zero Private Keys in Source/Cloud
          </span>
          <span className="text-slate-600">|</span>
          <a href="/ecosystem" className="text-slate-400 hover:text-[#00D4FF] transition-colors">Ecossistema aberto</a>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1 text-slate-400">
            <Terminal className="w-3.5 h-3.5 text-[#00D4FF]" /> Bridge: 127.0.0.1:8790
          </span>
        </div>
      </div>
    </footer>
  );
};
