import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { DashboardView } from './features/dashboard/DashboardView';
import { WalletGridView } from './features/wallets/WalletGridView';
import { MiningDashboardView } from './features/mining/MiningDashboardView';
import { EarningsView } from './features/earnings/EarningsView';
import { TransactionsView } from './features/transactions/TransactionsView';
import { SecurityView } from './features/security/SecurityView';
import { AuditLogView } from './features/audit/AuditLogView';
import { AuthGate } from './features/auth/AuthGate';

import {
  WalletItem,
  BountyItem,
  BountyStatus,
  TransactionItem,
  AuditEvent,
  BridgeHealthResponse,
  BridgeStatusResponse,
} from './types';

import { isFirebaseConfigured } from './firebase/config';
import { subscribeToAuthState, logoutUser } from './firebase/auth';
import { bridgeService } from './services/bridgeService';
import { walletService } from './services/walletService';
import { bountyService } from './services/bountyService';
import { transactionService } from './services/transactionService';
import { auditService } from './services/auditService';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [bypassLocalMode, setBypassLocalMode] = useState(false);

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

  const isConfigured = isFirebaseConfigured();

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

  const loadAllData = useCallback(async () => {
    setIsRefreshing(true);
    const ownerUid = currentUser?.uid;
    try {
      // 1. Fetch Local Bridge
      const [health, status] = await Promise.all([
        bridgeService.getHealth(),
        bridgeService.getStatus(),
      ]);
      setBridgeHealth(health);
      setBridgeStatus(status);

      // 2. Fetch Wallets (cloud if ownerUid exists, plus bridge & local)
      const loadedWallets = await walletService.getAllWallets(ownerUid);
      setWallets(loadedWallets);

      // 3. Fetch Bounties, Transactions & Audit
      if (ownerUid) {
        const [cloudBounties, cloudTx, cloudAudit] = await Promise.all([
          bountyService.loadFromCloud(ownerUid),
          transactionService.loadFromCloud(ownerUid),
          auditService.loadFromCloud(ownerUid),
        ]);
        setBounties(cloudBounties);
        setTransactions(cloudTx);
        setAuditEvents(cloudAudit);
      } else {
        setBounties(bountyService.getBounties());
        setTransactions(transactionService.getTransactions());
        setAuditEvents(auditService.getEvents());
      }
    } catch (e) {
      console.error('Error loading data:', e);
      addToast('error', 'Sync Failed', 'Unable to sync state with services.');
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUser?.uid]);

  // Firebase auth state subscription
  useEffect(() => {
    if (!isConfigured) {
      setAuthChecked(true);
      return;
    }

    const unsubscribe = subscribeToAuthState((user) => {
      setCurrentUser(user);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [isConfigured]);

  useEffect(() => {
    if (authChecked) {
      loadAllData();
    }
  }, [authChecked, currentUser, loadAllData]);

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    addToast('info', 'Logged Out', 'Signed out of Firebase Control Plane.');
  };

  const handleAddWallet = async (wallet: Omit<WalletItem, 'id'>) => {
    try {
      const created = await walletService.addWallet(wallet, currentUser?.uid);
      setWallets((prev) => [...prev, created]);
      setAuditEvents(auditService.getEvents());
      addToast('success', 'Wallet Registered', `Added ${wallet.name} (${wallet.mode})`);
    } catch {
      addToast('error', 'Registration Failed', 'Could not register wallet.');
    }
  };

  const handleSyncWallet = async (wallet: WalletItem) => {
    setIsSyncing(true);
    auditService.recordEvent('sync_started', `Initiated sync for wallet ${wallet.id}`, 'info', 'operator', currentUser?.uid);
    setAuditEvents(auditService.getEvents());

    setTimeout(async () => {
      setIsSyncing(false);
      auditService.recordEvent('sync_completed', `Completed sync for wallet ${wallet.id}`, 'info', 'operator', currentUser?.uid);
      setAuditEvents(auditService.getEvents());
      addToast('info', 'Sync Completed', `Synced ${wallet.name} (Watch-Only)`);
    }, 800);
  };

  const handleAddBounty = async (bounty: Omit<BountyItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await bountyService.addBounty(bounty, currentUser?.uid);
    setBounties(bountyService.getBounties());
    setAuditEvents(auditService.getEvents());
    addToast('success', 'Bounty Registered', `Tracked "${created.title}"`);
  };

  const handleUpdateBountyStatus = async (id: string, status: BountyStatus) => {
    const result = await bountyService.updateBountyStatus(id, status, undefined, currentUser?.uid);
    if (result.success) {
      setBounties(bountyService.getBounties());
      setAuditEvents(auditService.getEvents());
      addToast('info', 'Bounty Updated', `Status changed to ${status}`);
    } else {
      addToast('warning', 'Transition Blocked', result.error || 'Invalid transition');
    }
  };

  // Auth Gate check: If Firebase is configured and user is unauthenticated
  const isDevMode = Boolean(import.meta.env.DEV);
  const isBypassedInDev = isDevMode && bypassLocalMode;

  if (isConfigured && !currentUser && !isBypassedInDev) {
    if (!authChecked) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B1220] text-slate-400 font-mono text-xs">
          INITIALIZING SECURE CONTROL PLANE...
        </div>
      );
    }
    return (
      <AuthGate
        onAuthenticated={() => {}}
        onBypassLocal={isDevMode ? () => setBypassLocalMode(true) : undefined}
      />
    );
  }

  const bountyStats = bountyService.getStats();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1220] text-slate-100 selection:bg-[#FF7A00] selection:text-black">
      {/* Top Cyber Navigation Bar */}
      <Navbar
        bridgeHealth={bridgeHealth}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
        currentUserEmail={currentUser?.email}
        isFirebaseActive={Boolean(currentUser)}
        onLogout={currentUser ? handleLogout : undefined}
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
              onNavigateToMining={() => setCurrentTab('mining')}
            />
          )}

          {currentTab === 'mining' && (
            <MiningDashboardView onAddToast={addToast} />
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
