import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import LogDetailModal from '../../components/monitoring/LogDetailModal';
import { 
    Activity, CheckCircle, XCircle, AlertCircle, Info,
    Clock, RefreshCw, Download, Server, FileText, 
    ChevronDown, Search, AlertTriangle, Trash2, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import clsx from 'clsx';

interface ActionLog {
    id: number;
    action: string;
    entity_name: string;
    level: string;
    source: string;
    details: string | null;
    created_at: string;
    user_id: number | null;
}

interface LogStats {
    total: number;
    errors: number;
    warnings: number;
    by_source: Record<string, number>;
}

const levelConfig: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
    SUCCESS: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/20', border: 'border-green-500/30' },
    ERROR: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/20', border: 'border-red-500/30' },
    WARNING: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/20', border: 'border-amber-500/30' },
    INFO: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/20', border: 'border-blue-500/30' },
};

const sourceConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    APP: { icon: Activity, color: 'text-indigo-400', label: 'App' },
    VSPHERE: { icon: Server, color: 'text-cyan-400', label: 'vSphere' },
    PROXMOX: { icon: Server, color: 'text-orange-400', label: 'Proxmox' },
    SYSTEM: { icon: FileText, color: 'text-purple-400', label: 'System' },
};

const ITEMS_PER_PAGE = 15;

const Logs: React.FC = () => {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'operational' | 'application'>('operational');
    const [logs, setLogs] = useState<ActionLog[]>([]);
    const [appLogContent, setAppLogContent] = useState<string>('');
    const [stats, setStats] = useState<LogStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<ActionLog | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    
    // Filters & Search
    const [filterLevel, setFilterLevel] = useState<string>('');
    const [filterSource, setFilterSource] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { limit: 500 };
            if (filterLevel) params.level = filterLevel;
            if (filterSource) params.source = filterSource;
            
            const [logsRes, statsRes] = await Promise.all([
                api.get('/logs/', { params }),
                api.get('/logs/stats')
            ]);
            setLogs(logsRes.data);
            setStats(statsRes.data);
            setCurrentPage(1);
        } catch (err) {
            showToast('Failed to fetch logs', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchAppLog = async () => {
        setLoading(true);
        try {
            const res = await api.get('/logs/app-log', { params: { lines: 500 } });
            setAppLogContent(res.data.content || res.data.error || 'No content');
        } catch (err) {
            showToast('Failed to fetch application logs', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'operational') {
            fetchLogs();
        } else {
            fetchAppLog();
        }
    }, [activeTab, filterLevel, filterSource]);

    const handleDeleteLog = async (logId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.delete(`/logs/${logId}`);
            showToast('Log deleted', 'success');
            fetchLogs();
        } catch (err) {
            showToast('Failed to delete log', 'error');
        }
    };

    const handleClearAllLogs = async () => {
        try {
            await api.delete('/logs/clear/all?confirm=true');
            showToast('All logs cleared', 'success');
            setShowClearConfirm(false);
            fetchLogs();
        } catch (err) {
            showToast('Failed to clear logs', 'error');
        }
    };

    const handleExport = async (format: 'csv' | 'json') => {
        try {
            const res = await api.get(`/logs/export?format=${format}`, {
                responseType: format === 'csv' ? 'blob' : 'json'
            });
            
            const blob = format === 'csv' 
                ? new Blob([res.data]) 
                : new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `system_logs.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast(`Logs exported as ${format.toUpperCase()}`, 'success');
        } catch (err) {
            showToast('Failed to export logs', 'error');
        }
    };

    const formatAction = (action: string) => {
        // Convert SNAKE_CASE to Title Case
        return action
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

    const clearFilters = () => {
        setFilterLevel('');
        setFilterSource('');
        setSearchQuery('');
        setCurrentPage(1);
    };

    const hasActiveFilters = filterLevel || filterSource || searchQuery;

    // Filter logs by search query (client-side)
    const filteredLogs = logs.filter(log => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return log.action.toLowerCase().includes(q) || log.entity_name.toLowerCase().includes(q) || (log.details?.toLowerCase().includes(q));
    });

    // Pagination
    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const paginatedLogs = filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="space-y-5 animate-in fade-in duration-500">
            {/* Colorful Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25">
                        <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-primary">System Logs</h1>
                        <p className="text-sm text-secondary">Audit trail and event monitoring</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowClearConfirm(true)} className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white font-medium rounded-xl shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm">
                        <Trash2 className="w-4 h-4" /> Clear All
                    </button>
                    <div className="relative group">
                        <button className="flex items-center gap-1.5 px-4 py-2.5 bg-secondary/40 border border-theme rounded-xl text-sm text-primary font-medium hover:bg-secondary/60 transition-all">
                            <Download className="w-4 h-4" /> Export <ChevronDown className="w-3 h-3" />
                        </button>
                        <div className="absolute right-0 mt-1 w-32 bg-primary border border-theme rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 overflow-hidden">
                            <button onClick={() => handleExport('csv')} className="w-full px-4 py-2.5 text-left text-sm text-primary hover:bg-secondary/50 transition-colors">CSV</button>
                            <button onClick={() => handleExport('json')} className="w-full px-4 py-2.5 text-left text-sm text-primary hover:bg-secondary/50 transition-colors">JSON</button>
                        </div>
                    </div>
                    <button onClick={() => activeTab === 'operational' ? fetchLogs() : fetchAppLog()} className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm">
                        <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} /> Refresh
                    </button>
                </div>
            </div>

            {/* Colorful Stats Cards */}
            {stats && activeTab === 'operational' && (
                <div className="grid grid-cols-4 gap-4">
                    <div className="glass rounded-2xl p-4 border border-theme group hover:border-indigo-500/40 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                                <Activity className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-primary">{stats.total}</p>
                                <p className="text-xs text-secondary">Total Logs</p>
                            </div>
                        </div>
                    </div>
                    <div className="glass rounded-2xl p-4 border border-theme group hover:border-red-500/40 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 shadow-lg shadow-red-500/20 group-hover:scale-110 transition-transform">
                                <XCircle className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-red-400">{stats.errors}</p>
                                <p className="text-xs text-secondary">Errors</p>
                            </div>
                        </div>
                    </div>
                    <div className="glass rounded-2xl p-4 border border-theme group hover:border-amber-500/40 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                                <AlertTriangle className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-amber-400">{stats.warnings}</p>
                                <p className="text-xs text-secondary">Warnings</p>
                            </div>
                        </div>
                    </div>
                    <div className="glass rounded-2xl p-4 border border-theme group hover:border-emerald-500/40 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                                <CheckCircle className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-emerald-400">{stats.total - stats.errors - stats.warnings}</p>
                                <p className="text-xs text-secondary">Healthy</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Colorful Tabs */}
            <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl border border-theme w-fit">
                <button onClick={() => setActiveTab('operational')} className={clsx("px-5 py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center gap-2", activeTab === 'operational' ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg" : "text-secondary hover:text-primary hover:bg-secondary/50")}>
                    <Server className="w-4 h-4" /> Operational
                </button>
                <button onClick={() => setActiveTab('application')} className={clsx("px-5 py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center gap-2", activeTab === 'application' ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg" : "text-secondary hover:text-primary hover:bg-secondary/50")}>
                    <FileText className="w-4 h-4" /> Application
                </button>
            </div>

            {/* Search & Filter Bar */}
            {activeTab === 'operational' && (
                <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} placeholder="Search logs..." className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all" />
                    </div>
                    <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                        <option value="">All Levels</option>
                        <option value="SUCCESS">✓ Success</option>
                        <option value="INFO">ℹ Info</option>
                        <option value="WARNING">⚠ Warning</option>
                        <option value="ERROR">✕ Error</option>
                    </select>
                    <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                        <option value="">All Sources</option>
                        <option value="APP">App</option>
                        <option value="VSPHERE">vSphere</option>
                        <option value="PROXMOX">Proxmox</option>
                        <option value="SYSTEM">System</option>
                    </select>
                    {hasActiveFilters && <button onClick={clearFilters} className="p-2.5 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"><X className="w-4 h-4" /></button>}
                </div>
            )}

            {/* Content */}
            {activeTab === 'operational' ? (
                <div className="space-y-2">
                    {loading && logs.length === 0 ? (
                        <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
                    ) : paginatedLogs.length === 0 ? (
                        <div className="text-center py-16 glass rounded-2xl border border-theme">
                            <Activity className="w-12 h-12 text-secondary mx-auto mb-3" />
                            <p className="text-secondary">No logs found</p>
                        </div>
                    ) : (
                        paginatedLogs.map(log => {
                            const levelStyle = levelConfig[log.level] || levelConfig.INFO;
                            const sourceStyle = sourceConfig[log.source] || sourceConfig.APP;
                            const LevelIcon = levelStyle.icon;

                            return (
                                <div key={log.id} onClick={() => setSelectedLog(log)} className="glass rounded-xl px-4 py-3 hover:border-blue-500/40 border border-theme transition-all cursor-pointer group flex items-center gap-4">
                                    <div className={clsx("p-2.5 rounded-xl shrink-0", levelStyle.bg)}>
                                        <LevelIcon className={clsx("w-4 h-4", levelStyle.color)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-primary truncate">{formatAction(log.action)}</span>
                                            <span className="text-xs text-secondary truncate hidden sm:inline">— {log.entity_name}</span>
                                        </div>
                                    </div>
                                    <span className={clsx("text-xs px-2.5 py-1 rounded-lg font-medium", sourceStyle.color, "bg-secondary/30")}>{sourceStyle.label}</span>
                                    <span className="text-xs text-secondary hidden md:flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(log.created_at)}</span>
                                    <span className={clsx("px-2.5 py-1 rounded-lg text-xs font-semibold", levelStyle.bg, levelStyle.color)}>{log.level}</span>
                                    <button onClick={(e) => handleDeleteLog(log.id, e)} className="p-2 rounded-lg text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            );
                        })
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t border-theme">
                            <p className="text-xs text-secondary">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} of {filteredLogs.length}</p>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-lg bg-secondary/30 text-secondary hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let page = i + 1;
                                    if (totalPages > 5) {
                                        if (currentPage > 3) page = currentPage - 2 + i;
                                        if (currentPage > totalPages - 2) page = totalPages - 4 + i;
                                    }
                                    return (
                                        <button key={page} onClick={() => setCurrentPage(page)} className={clsx("w-9 h-9 rounded-lg text-sm font-medium transition-all", currentPage === page ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg" : "bg-secondary/30 text-secondary hover:bg-secondary/50")}>{page}</button>
                                    );
                                })}
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-secondary/30 text-secondary hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="glass rounded-2xl p-5 border border-theme">
                    <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><FileText className="w-4 h-4 text-purple-500" /> Application Log (Last 500 lines)</h3>
                    <pre className="bg-secondary/20 p-4 rounded-xl overflow-auto max-h-[500px] text-xs font-mono text-secondary whitespace-pre-wrap border border-theme">{loading ? 'Loading...' : appLogContent}</pre>
                </div>
            )}

            {/* Detail Modal */}
            <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
            
            {/* Clear All Confirmation - Using Portal */}
            {showClearConfirm && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-200 dark:bg-slate-900">
                    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-2xl shadow-xl p-5 max-w-sm w-full">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-red-500/20 rounded-lg"><Trash2 className="w-5 h-5 text-red-500" /></div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Clear All Logs?</h2>
                        </div>
                        <p className="text-gray-600 dark:text-slate-400 text-sm mb-4">This will permanently delete all {stats?.total || 0} logs.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowClearConfirm(false)} className="px-3 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-800 dark:text-white rounded-lg text-sm">Cancel</button>
                            <button onClick={handleClearAllLogs} className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm">Clear All</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Logs;
