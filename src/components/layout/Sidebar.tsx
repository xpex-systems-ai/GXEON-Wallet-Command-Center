import React from 'react';
import {
  LayoutDashboard,
  Wallet,
  Cpu,
  Coins,
  History,
  ShieldAlert,
  FileText,
  Bot,
  Network,
  BriefcaseBusiness,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'agent-economy'
  | 'integrations'
  | 'revenue-operations'
  | 'sales'
  | 'wallets'
  | 'mining'
  | 'earnings'
  | 'transactions'
  | 'security'
  | 'audit';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  walletsCount: number;
  pendingBountiesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  walletsCount,
  pendingBountiesCount,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Command Center',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'integrations' as NavTab,
      label: 'Comunidades & Integrações',
      icon: Network,
      badge: null,
    },
    {
      id: 'revenue-operations' as NavTab,
      label: 'Revenue Operations',
      icon: BriefcaseBusiness,
      badge: 'GX',
      badgeColor: 'bg-amber-500/15 text-amber-300',
    },
    {
      id: 'agent-economy' as NavTab,
      label: 'Agent Economy V1',
      icon: Bot,
      badge: 'API',
      badgeColor: 'bg-cyan-500/20 text-cyan-400',
    },
    {
      id: 'sales' as NavTab,
      label: 'Stripe Direct Sales',
      icon: Coins,
      badge: 'R$49',
      badgeColor: 'bg-emerald-500/20 text-emerald-400',
    },
    {
      id: 'wallets' as NavTab,
      label: 'Wallets & Adapters',
      icon: Wallet,
      badge: walletsCount > 0 ? walletsCount.toString() : null,
      badgeColor: 'bg-[#FF7A00]/20 text-[#FF7A00]',
    },
    {
      id: 'mining' as NavTab,
      label: 'ClawRTC & Mining',
      icon: Cpu,
      badge: 'PoA',
      badgeColor: 'bg-[#FF7A00]/20 text-[#FF7A00]',
    },
    {
      id: 'earnings' as NavTab,
      label: 'Bounties & Earnings',
      icon: Coins,
      badge: pendingBountiesCount > 0 ? pendingBountiesCount.toString() : null,
      badgeColor: 'bg-[#00D4FF]/20 text-[#00D4FF]',
    },
    {
      id: 'transactions' as NavTab,
      label: 'Transactions',
      icon: History,
      badge: null,
    },
    {
      id: 'security' as NavTab,
      label: 'Security Center',
      icon: ShieldAlert,
      badge: 'STRICT',
      badgeColor: 'bg-emerald-500/20 text-emerald-400',
    },
    {
      id: 'audit' as NavTab,
      label: 'Audit Trail',
      icon: FileText,
      badge: null,
    },
  ];

  return (
    <aside className="w-full md:w-64 bg-[#111C30]/50 border-r border-[#1E314F] p-4 flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible shrink-0">
      <div className="hidden md:block px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-slate-400">
        Navigation Plane
      </div>

      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-left font-mono shrink-0 md:shrink ${
              isActive
                ? 'bg-gradient-to-r from-[#FF7A00]/15 to-transparent text-white border-l-2 border-[#FF7A00] shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#152238]/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon
                className={`w-4 h-4 ${
                  isActive ? 'text-[#FF7A00]' : 'text-slate-400'
                }`}
              />
              <span>{item.label}</span>
            </div>

            {item.badge && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                  item.badgeColor || 'bg-slate-800 text-slate-300'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}

      <div className="hidden md:block mt-4 pt-4 border-t border-slate-800">
        <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">
          Canais Comerciais
        </div>
        <a
          href="/fix"
          className="flex items-center justify-between px-3.5 py-2 text-xs font-mono text-slate-400 hover:text-[#FF7A00] transition rounded hover:bg-[#152238]/40"
        >
          <span>Página /fix</span>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">R$49</span>
        </a>
        <a
          href="/credits"
          className="flex items-center justify-between px-3.5 py-2 text-xs font-mono text-slate-400 hover:text-white transition rounded hover:bg-[#152238]/40"
        >
          <span>Página /credits</span>
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">BRL</span>
        </a>
        <a
          href="/mcp"
          className="flex items-center justify-between px-3.5 py-2 text-xs font-mono text-slate-400 hover:text-purple-400 transition rounded hover:bg-[#152238]/40"
        >
          <span>Docs /mcp</span>
          <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">MCP</span>
        </a>
      </div>
    </aside>
  );
};
