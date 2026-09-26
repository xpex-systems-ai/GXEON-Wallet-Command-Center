import { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { DashboardView } from './features/dashboard/DashboardView';
import { WalletGridView } from './features/wallets/WalletGridView';
import { EarningsView } from './features/earnings/EarningsView';
import { TransactionsView } from './features/transactions/TransactionsView';
import { SecurityView } from './features/security/SecurityView';
import { AuditLogView } from './features/audit/AuditLogView';

import {
  WalletItem,
  BountyItem,
  BountyStatus,
  TransactionItem,
  AuditEvent,
  BridgeHealthResponse,
  BridgeStatusResponse,
} from './types';

import { bridgeService } from './services/bridgeService';
import { walletService } from './services/walletService';
import { bountyService } from './services/bountyService';
import { transactionService } from './services/transactionService';
import { auditService } from './services/auditService';

export function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [bounties, setBounties] = useState<BountyItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealthResponse | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatusResponse | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (
    type: ToastMessage['type'],
    title: string,
    description?: string
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loadAllData = async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch Local Bridge
      const [health, status] = await Promise.all([
        bridgeService.getHealth(),
        bridgeService.getStatus(),
      ]);
      setBridgeHealth(health);
      setBridgeStatus(status);

      // 2. Fetch Wallets
      const loadedWallets = await walletService.getAllWallets();
      setWallets(loadedWallets);

      // 3. Fetch Bounties & Transactions
      setBounties(bountyService.getBounties());
      setTransactions(transactionService.getTransactions());
      setAuditEvents(auditService.getEvents());
    } catch (e) {
      console.error('Error loading data:', e);
      addToast('error', 'Sync Failed', 'Unable to sync state with local services.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleAddWallet = async (wallet: Omit<WalletItem, 'id'>) => {
    try {
      const created = await walletService.addWallet(wallet);
      setWallets((prev) => [...prev, created]);
      setAuditEvents(auditService.getEvents());
      addToast('success', 'Wallet Registered', `Added ${wallet.name} (${wallet.mode})`);
    } catch {
      addToast('error', 'Registration Failed', 'Could not register wallet.');
    }
  };

  const handleSyncWallet = async (wallet: WalletItem) => {
    setIsSyncing(true);
    auditService.recordEvent('sync_started', `Initiated sync for wallet ${wallet.id}`);
    setAuditEvents(auditService.getEvents());

    setTimeout(async () => {
      setIsSyncing(false);
      auditService.recordEvent('sync_completed', `Completed sync for wallet ${wallet.id}`);
      setAuditEvents(auditService.getEvents());
      addToast('info', 'Sync Completed', `Synced ${wallet.name} (Watch-Only)`);
    }, 800);
  };

  const handleAddBounty = (bounty: Omit<BountyItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = bountyService.addBounty(bounty);
    setBounties(bountyService.getBounties());
    setAuditEvents(auditService.getEvents());
    addToast('success', 'Bounty Registered', `Tracked "${created.title}"`);
  };

  const handleUpdateBountyStatus = (id: string, status: BountyStatus, txHash?: string) => {
    bountyService.updateBountyStatus(id, status, txHash);
    setBounties(bountyService.getBounties());
    setAuditEvents(auditService.getEvents());
    addToast('info', 'Bounty Updated', `Status changed to ${status}`);
  };

  const bountyStats = bountyService.getStats();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1220] text-slate-100 selection:bg-[#FF7A00] selection:text-black">
      {/* Top Cyber Navigation Bar */}
      <Navbar
        bridgeHealth={bridgeHealth}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
      />

      {/* Main Body Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => setCurrentTab(tab)}
          walletsCount={wallets.length}
          pendingBountiesCount={bountyStats.submittedCount}
        />

        {/* Dynamic Tab Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {currentTab === 'dashboard' && (
            <DashboardView
              wallets={wallets}
              bridgeHealth={bridgeHealth}
              bridgeStatus={bridgeStatus}
              bountyStats={bountyStats}
              onNavigate={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === 'wallets' && (
            <WalletGridView
              wallets={wallets}
              onAddWallet={handleAddWallet}
              onSyncWallet={handleSyncWallet}
              isSyncing={isSyncing}
            />
          )}

          {currentTab === 'earnings' && (
            <EarningsView
              bounties={bounties}
              wallets={wallets}
              onAddBounty={handleAddBounty}
              onUpdateStatus={handleUpdateBountyStatus}
            />
          )}

          {currentTab === 'transactions' && (
            <TransactionsView transactions={transactions} />
          )}

          {currentTab === 'security' && (
            <SecurityView
              bridgeHealth={bridgeHealth}
              bridgeStatus={bridgeStatus}
              wallets={wallets}
            />
          )}

          {currentTab === 'audit' && (
            <AuditLogView events={auditEvents} />
          )}
        </main>
      </div>

      {/* Footer */}
      <Footer />

      {/* Floating Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

export default App;
