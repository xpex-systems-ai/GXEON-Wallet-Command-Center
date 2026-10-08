import React from 'react';
import {
  LayoutDashboard, Wallet, Cpu, Coins, History, ShieldCheck, FileClock,
  Bot, Store, BriefcaseBusiness, CircleDollarSign, Settings2
} from 'lucide-react';

export type NavTab =
  | 'dashboard' | 'agent-economy' | 'sales' | 'wallets' | 'mining'
  | 'earnings' | 'transactions' | 'security' | 'audit';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  walletsCount: number;
  pendingBountiesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab, onSelectTab, walletsCount, pendingBountiesCount,
}) => {
  const groups = [
    {
      title: 'Overview',
      items: [
        { id: 'dashboard' as NavTab, label: 'Home', icon: LayoutDashboard },
        { id: 'wallets' as NavTab, label: 'Wallet', icon: Wallet, badge: walletsCount || undefined },
      ],
    },
    {
      title: 'Agent Economy',
      items: [
        { id: 'agent-economy' as NavTab, label: 'Agent Economy', icon: Bot, badge: 'LIVE' },
        { id: 'earnings' as NavTab, label: 'Earn & Jobs', icon: BriefcaseBusiness, badge: pendingBountiesCount || undefined },
        { id: 'sales' as NavTab, label: 'Commerce', icon: CircleDollarSign },
        { id: 'mining' as NavTab, label: 'Compute', icon: Cpu },
      ],
    },
    {
      title: 'Activity',
      items: [
        { id: 'transactions' as NavTab, label: 'Transactions', icon: History },
        { id: 'security' as NavTab, label: 'Security', icon: ShieldCheck },
        { id: 'audit' as NavTab, label: 'Audit', icon: FileClock },
      ],
    },
  ];

  return (
    <aside className="w-full md:w-[272px] md:sticky md:top-0 md:h-[calc(100vh-64px)] shrink-0 border-r border-white/[0.06] bg-[#090D14]/95 backdrop-blur-2xl px-3 py-4 overflow-x-auto md:overflow-y-auto">
      <div className="hidden md:flex items-center gap-3 px-3 pb-5">
        <div className="h-9 w-9 rounded-xl bg-white text-black grid place-items-center font-black tracking-tight">GX</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">GXEON</div>
          <div className="text-[11px] text-slate-500">Wallet & Agent Economy</div>
        </div>
      </div>

      <div className="flex md:block gap-2">
        {groups.map((group) => (
          <div key={group.title} className="md:mb-5 shrink-0">
            <div className="hidden md:block px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              {group.title}
            </div>
            <div className="flex md:block gap-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`w-auto md:w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all whitespace-nowrap ${
                      active
                        ? 'bg-white/[0.09] text-white shadow-sm ring-1 ring-white/[0.06]'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.045]'
                    }`}
                  >
                    <Icon className={`h-[18px] w-[18px] ${active ? 'text-white' : 'text-slate-500'}`} />
                    <span className="font-medium">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        item.badge === 'LIVE' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.06] text-slate-400'
                      }`}>{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block mt-auto border-t border-white/[0.06] pt-4">
        <a href="/market" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-white/[0.045] hover:text-white">
          <Store className="h-[18px] w-[18px]" /> Marketplace
        </a>
        <a href="/mcp" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-white/[0.045] hover:text-white">
          <Settings2 className="h-[18px] w-[18px]" /> Developer
        </a>
        <div className="mt-4 mx-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Agent Economy online
          </div>
          <div className="mt-1 text-[10px] text-slate-600">Read-only • Human approval gate</div>
        </div>
      </div>
    </aside>
  );
};
