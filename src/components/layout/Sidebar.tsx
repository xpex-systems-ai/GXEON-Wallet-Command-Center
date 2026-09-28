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
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'agent-economy'
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
    </aside>
  );
};
