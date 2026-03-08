import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  Plus,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  BarChart3,
  Search,
  User,
  FileText,
} from 'lucide-react';
import {motion, AnimatePresence} from 'motion/react';
import {DEFAULT_ACCOUNTS, type Account, type AccountsResponse} from './types';

type ViewMode = 'dashboard' | 'report';

const AUTOPOLL_MS = 30000;

const App: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>(DEFAULT_ACCOUNTS);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(DEFAULT_ACCOUNTS[0]?.id ?? '1');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0],
    [accounts, selectedAccountId],
  );

  const filteredAccounts = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) {
      return accounts;
    }

    return accounts.filter((account) => {
      if (account.name.toLowerCase().includes(needle)) {
        return true;
      }

      return account.quotas.some((quota) => quota.modelName.toLowerCase().includes(needle));
    });
  }, [accounts, searchQuery]);

  const getStatusColor = (percentage: number) => {
    if (percentage <= 5) return 'bg-red-500';
    if (percentage <= 20) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getStatusText = (percentage: number) => {
    if (percentage <= 5) return 'Critical';
    if (percentage <= 20) return 'Low';
    return 'Healthy';
  };

  const loadAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/accounts');
      if (!response.ok) {
        throw new Error(`failed to load accounts: ${response.status}`);
      }

      const data = (await response.json()) as AccountsResponse;
      if (!Array.isArray(data.accounts)) {
        throw new Error('invalid accounts payload');
      }

      setAccounts(data.accounts);
      setLastFetchedAt(data.fetchedAt ?? new Date().toISOString());
      setSyncError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to load accounts';
      setSyncError(message);
    }
  }, []);

  const triggerRefresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`refresh failed: ${response.status}`);
      }

      await loadAccounts();
      setSyncError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'refresh failed';
      setSyncError(message);
    } finally {
      setIsSyncing(false);
    }
  }, [loadAccounts]);

  useEffect(() => {
    loadAccounts();
    const timer = setInterval(() => {
      loadAccounts();
    }, AUTOPOLL_MS);

    return () => clearInterval(timer);
  }, [loadAccounts]);

  useEffect(() => {
    if (!selectedAccount && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [selectedAccount, accounts]);

  return (
    <div className="flex h-screen bg-[#E4E3E0] text-[#141414] font-sans overflow-hidden">
      <aside className="w-64 border-r border-[#141414] flex flex-col bg-[#E4E3E0]">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#141414] rounded-sm flex items-center justify-center">
              <BarChart3 size={18} className="text-[#E4E3E0]" />
            </div>
            <h1 className="font-bold text-lg tracking-tight uppercase">Quota.Track</h1>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setViewMode('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-colors ${viewMode === 'dashboard' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-black/5'}`}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </button>
            <button
              onClick={() => setViewMode('report')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-colors ${viewMode === 'report' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-black/5'}`}
            >
              <FileText size={16} />
              Full Report
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-black/5 rounded-sm text-sm font-medium transition-colors opacity-50 cursor-not-allowed">
              <Users size={16} />
              Accounts
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-black/5 rounded-sm text-sm font-medium transition-colors opacity-50 cursor-not-allowed">
              <Settings size={16} />
              Settings
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-[#141414]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center overflow-hidden">
              <User size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">Admin User</p>
              <p className="text-xs opacity-50 truncate">mooja4870@gmail.com</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-[#141414] flex items-center justify-between px-8 bg-[#E4E3E0]">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <Search size={18} className="opacity-40" />
            <input
              type="text"
              placeholder="Search accounts or models..."
              className="bg-transparent border-none outline-none text-sm w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 px-4 py-2 border border-[#141414] text-xs font-bold uppercase tracking-wider hover:bg-[#141414] hover:text-[#E4E3E0] transition-all opacity-50 cursor-not-allowed">
              <Plus size={14} />
              New Account
            </button>
            <button
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
              onClick={triggerRefresh}
              disabled={isSyncing}
              title="Refresh now"
            >
              <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {syncError && (
          <div className="px-8 py-3 text-xs font-mono text-red-700 border-b border-red-400/40 bg-red-50">
            API error: {syncError}
          </div>
        )}

        {!syncError && lastFetchedAt && (
          <div className="px-8 py-2 text-[11px] font-mono opacity-60 border-b border-[#141414]/15">
            Last fetch: {new Date(lastFetchedAt).toLocaleString()}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {viewMode === 'dashboard' ? (
            <>
              <div className="w-80 border-r border-[#141414] overflow-y-auto bg-[#E4E3E0]">
                <div className="p-4 border-b border-[#141414] bg-black/5">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 italic font-serif">Profiles</p>
                </div>
                {filteredAccounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className={`w-full text-left p-4 border-b border-[#141414] transition-all group ${
                      selectedAccountId === account.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-black/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-sm">{account.name}</h3>
                        <p className={`text-xs mt-1 ${selectedAccountId === account.id ? 'opacity-60' : 'opacity-40'}`}>
                          {account.email || 'No email linked'}
                        </p>
                      </div>
                      <ChevronRight
                        size={14}
                        className={`transition-transform ${selectedAccountId === account.id ? 'translate-x-1' : 'opacity-0 group-hover:opacity-100'}`}
                      />
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-[#E4E3E0]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedAccountId}
                    initial={{opacity: 0, y: 10}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -10}}
                    transition={{duration: 0.2}}
                  >
                    <div className="flex items-end justify-between mb-12">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mb-2 font-serif italic">Account Overview</p>
                        <h2 className="text-4xl font-bold tracking-tighter">{selectedAccount?.name ?? 'N/A'}</h2>
                        <p className="text-sm opacity-50 mt-1">{selectedAccount?.email ?? 'No email linked'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mb-2 font-serif italic">Status</p>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${selectedAccount && selectedAccount.quotas.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
                          ></div>
                          <span className="text-sm font-bold uppercase tracking-widest">
                            {selectedAccount && selectedAccount.quotas.length > 0 ? 'Active' : 'No Data'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedAccount && selectedAccount.quotas.length > 0 ? (
                      <div className="space-y-8">
                        <div className="grid grid-cols-1 gap-6">
                          <div className="border border-[#141414] p-6 bg-white/50">
                            <div className="flex items-center justify-between mb-6">
                              <h4 className="text-xs font-bold uppercase tracking-widest font-serif italic">Model Quota Report</h4>
                              <span className="text-[10px] opacity-40">Auto-refresh every 30s</span>
                            </div>

                            <div className="space-y-8">
                              {selectedAccount.quotas.map((quota) => (
                                <div key={quota.id} className="group">
                                  <div className="flex items-center justify-between mb-3">
                                    <div>
                                      <span className="text-sm font-bold tracking-tight">{quota.modelName}</span>
                                      <div className="flex items-center gap-2 mt-1">
                                        <AlertCircle size={10} className="opacity-40" />
                                        <span className="text-[10px] opacity-40 uppercase tracking-wider">Refreshes in {quota.refreshTime}</span>
                                        {quota.source && <span className="text-[10px] opacity-40">({quota.source})</span>}
                                      </div>
                                    </div>
                                    <div className="text-right flex items-center gap-4">
                                      <div className="px-2 py-1 rounded">
                                        <span className="text-sm font-mono font-bold">{quota.remainingPercentage}%</span>
                                        <p
                                          className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${
                                            quota.remainingPercentage <= 5
                                              ? 'text-red-600'
                                              : quota.remainingPercentage <= 20
                                                ? 'text-amber-600'
                                                : 'text-emerald-600'
                                          }`}
                                        >
                                          {getStatusText(quota.remainingPercentage)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{width: 0}}
                                      animate={{width: `${quota.remainingPercentage}%`}}
                                      transition={{duration: 1, ease: 'easeOut'}}
                                      className={`h-full ${getStatusColor(quota.remainingPercentage)}`}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                          <div className="border border-[#141414] p-6 bg-white/30">
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2 font-serif italic">Avg. Remaining</p>
                            <p className="text-3xl font-bold font-mono">
                              {(
                                selectedAccount.quotas.reduce((acc, quota) => acc + quota.remainingPercentage, 0) /
                                selectedAccount.quotas.length
                              ).toFixed(1)}
                              %
                            </p>
                          </div>
                          <div className="border border-[#141414] p-6 bg-white/30">
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2 font-serif italic">Critical Quotas</p>
                            <p className="text-3xl font-bold font-mono text-red-600">
                              {selectedAccount.quotas.filter((quota) => quota.remainingPercentage <= 5).length}
                            </p>
                          </div>
                          <div className="border border-[#141414] p-6 bg-white/30">
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2 font-serif italic">Total Agents</p>
                            <p className="text-3xl font-bold font-mono">{selectedAccount.quotas.length}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-32 border border-dashed border-[#141414] bg-white/20">
                        <AlertCircle size={48} className="opacity-20 mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest opacity-40">No quota data available for this account</p>
                        <p className="mt-4 text-xs opacity-50">Set ACCOUNT_&lt;id&gt;_QUOTA_SOURCE_URL or push /api/ingest.</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-8 bg-[#E4E3E0]">
              <div className="mb-12">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mb-2 font-serif italic">Global Monitoring</p>
                <h2 className="text-4xl font-bold tracking-tighter">Quota Report</h2>
                <p className="text-sm opacity-50 mt-1">Aggregated remaining percentage for all accounts and agents</p>
              </div>

              <div className="border border-[#141414] overflow-hidden bg-white/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#141414] bg-black/5">
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest font-serif italic">Account</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest font-serif italic">Gemini 3.1 Pro</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest font-serif italic">Gemini 3 Flash</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest font-serif italic">Claude Sonnet</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest font-serif italic">GPT-OSS</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest font-serif italic">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => {
                      const gPro = account.quotas.find((q) => q.modelName.includes('3.1 Pro'))?.remainingPercentage;
                      const gFlash = account.quotas.find((q) => q.modelName.includes('3 Flash'))?.remainingPercentage;
                      const cSonnet = account.quotas.find((q) => q.modelName.includes('Claude Sonnet'))?.remainingPercentage;
                      const gpt = account.quotas.find((q) => q.modelName.includes('GPT-OSS'))?.remainingPercentage;

                      const avg =
                        account.quotas.length > 0
                          ? account.quotas.reduce((acc, quota) => acc + quota.remainingPercentage, 0) / account.quotas.length
                          : null;

                      return (
                        <tr key={account.id} className="border-b border-[#141414] hover:bg-black/5 transition-colors">
                          <td className="p-4">
                            <p className="text-sm font-bold">{account.name}</p>
                            <p className="text-[10px] opacity-40">{account.email || 'N/A'}</p>
                          </td>
                          <td className="p-4 font-mono text-sm">
                            {gPro !== undefined ? <span className={gPro <= 5 ? 'text-red-600 font-bold' : ''}>{gPro}%</span> : '—'}
                          </td>
                          <td className="p-4 font-mono text-sm">
                            {gFlash !== undefined ? <span className={gFlash <= 5 ? 'text-red-600 font-bold' : ''}>{gFlash}%</span> : '—'}
                          </td>
                          <td className="p-4 font-mono text-sm">
                            {cSonnet !== undefined ? <span className={cSonnet <= 5 ? 'text-red-600 font-bold' : ''}>{cSonnet}%</span> : '—'}
                          </td>
                          <td className="p-4 font-mono text-sm">
                            {gpt !== undefined ? <span className={gpt <= 5 ? 'text-red-600 font-bold' : ''}>{gpt}%</span> : '—'}
                          </td>
                          <td className="p-4">
                            {avg !== null ? (
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(avg)}`}></div>
                                <span className="text-[10px] font-bold uppercase tracking-widest">{getStatusText(avg)}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] opacity-30 uppercase tracking-widest">No Data</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
