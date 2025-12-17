import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import LogDetailModal from '../../components/monitoring/LogDetailModal';
import { 
    Activity, CheckCircle, XCircle, AlertCircle, Info,
    Clock, RefreshCw, Filter, Download, Server, FileText, 
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
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-primary flex items-center gap-2">
                        <div className="p-1.5 bg-gradient-to-br from-indigo-600 to-cyan-600 rounded-lg">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        System Logs
                    </h1>
                    <p className="text-secondary text-sm">Audit trail and event monitoring</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowClearConfirm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 hover:bg-red-500/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> Clear All
                    </button>
                    <div className="relative group">
                        <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-xs text-white hover:bg-slate-600 transition-colors">
                            <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" />
                        </button>
                        <div className="absolute right-0 mt-1 w-32 bg-slate-800 border border-slate-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                            <button onClick={() => handleExport('csv')} className="w-full px-3 py-2 text-left text-xs text-white hover:bg-slate-700 rounded-t-lg">CSV</button>
                            <button onClick={() => handleExport('json')} className="w-full px-3 py-2 text-left text-xs text-white hover:bg-slate-700 rounded-b-lg">JSON</button>
                        </div>
                    </div>
                    <button onClick={() => activeTab === 'operational' ? fetchLogs() : fetchAppLog()} className="flex items-center gap-1.5 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-xs text-white hover:bg-slate-600 transition-colors">
                        <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards - Compact */}
            {stats && activeTab === 'operational' && (
                <div className="grid grid-cols-4 gap-3">
                    {[
                        { label: 'Total', value: stats.total, icon: Activity, color: 'indigo' },
                        { label: 'Errors', value: stats.errors, icon: XCircle, color: 'red' },
                        { label: 'Warnings', value: stats.warnings, icon: AlertTriangle, color: 'amber' },
                        { label: 'Healthy', value: stats.total - stats.errors - stats.warnings, icon: CheckCircle, color: 'green' },
                    ].map(item => (
                        <div key={item.label} className="bg-slate-800/80 border border-slate-600 rounded-lg p-3 flex items-center gap-3">
                            <div className={`p-2 bg-${item.color}-500/20 rounded-lg`}>
                                <item.icon className={`w-5 h-5 text-${item.color}-400`} />
                            </div>
                            <div>
                                <p className={`text-2xl font-bold text-${item.color === 'indigo' ? 'white' : item.color + '-400'}`}>{item.value}</p>
                                <p className="text-xs text-slate-400">{item.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-3 border-b border-slate-700">
                <button onClick={() => setActiveTab('operational')} className={clsx("px-3 py-2 text-xs font-medium border-b-2 transition-colors", activeTab === 'operational' ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white")}>
                    <div className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> Operational</div>
                </button>
                <button onClick={() => setActiveTab('application')} className={clsx("px-3 py-2 text-xs font-medium border-b-2 transition-colors", activeTab === 'application' ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white")}>
                    <div className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Application</div>
                </button>
            </div>

            {/* Search & Filter Bar */}
            {activeTab === 'operational' && (
                <div className="flex items-center gap-3 p-3 bg-slate-800/60 border border-slate-700 rounded-lg">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} placeholder="Search logs..." className="w-full pl-8 pr-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-xs text-white focus:outline-none">
                        <option value="">All Levels</option>
                        <option value="SUCCESS">Success</option>
                        <option value="INFO">Info</option>
                        <option value="WARNING">Warning</option>
                        <option value="ERROR">Error</option>
                    </select>
                    <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-xs text-white focus:outline-none">
                        <option value="">All Sources</option>
                        <option value="APP">App</option>
                        <option value="VSPHERE">vSphere</option>
                        <option value="PROXMOX">Proxmox</option>
                        <option value="SYSTEM">System</option>
                    </select>
                    {hasActiveFilters && <button onClick={clearFilters} className="flex items-center gap-1 px-2 py-2 text-xs text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>}
                </div>
            )}

            {/* Content */}
            {activeTab === 'operational' ? (
                <div className="space-y-2">
                    {loading && logs.length === 0 ? (
                        <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /></div>
                    ) : paginatedLogs.length === 0 ? (
                        <div className="text-center py-12 bg-slate-800/60 border border-slate-700 rounded-lg">
                            <Activity className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                            <p className="text-slate-400 text-sm">No logs found</p>
                        </div>
                    ) : (
                        paginatedLogs.map(log => {
                            const levelStyle = levelConfig[log.level] || levelConfig.INFO;
                            const sourceStyle = sourceConfig[log.source] || sourceConfig.APP;
                            const LevelIcon = levelStyle.icon;

                            return (
                                <div key={log.id} onClick={() => setSelectedLog(log)} className="bg-slate-800/70 border border-slate-600 rounded-lg px-3 py-2 hover:border-indigo-500/50 hover:bg-slate-700/70 transition-all cursor-pointer group flex items-center gap-3">
                                    <div className={clsx("p-2 rounded-lg shrink-0", levelStyle.bg)}>
                                        <LevelIcon className={clsx("w-4 h-4", levelStyle.color)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-white truncate">{log.action}</span>
                                            <span className="text-xs text-slate-400 truncate hidden sm:inline">— {log.entity_name}</span>
                                        </div>
                                    </div>
                                    <span className={clsx("text-xs px-2 py-0.5 rounded", sourceStyle.color, "bg-slate-700/50")}>{sourceStyle.label}</span>
                                    <span className="text-xs text-slate-500 hidden md:flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(log.created_at)}</span>
                                    <span className={clsx("px-2 py-0.5 rounded text-xs font-medium", levelStyle.bg, levelStyle.color)}>{log.level}</span>
                                    <button onClick={(e) => handleDeleteLog(log.id, e)} className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            );
                        })
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                            <p className="text-xs text-slate-400">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} of {filteredLogs.length}</p>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let page = i + 1;
                                    if (totalPages > 5) {
                                        if (currentPage > 3) page = currentPage - 2 + i;
                                        if (currentPage > totalPages - 2) page = totalPages - 4 + i;
                                    }
                                    return (
                                        <button key={page} onClick={() => setCurrentPage(page)} className={clsx("w-8 h-8 rounded-lg text-xs font-medium transition-colors", currentPage === page ? "bg-indigo-600 text-white" : "bg-slate-700/50 text-slate-400 hover:bg-slate-600")}>{page}</button>
                                    );
                                })}
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-slate-800/80 border border-slate-600 rounded-lg p-4">
                    <h3 className="text-xs font-semibold text-white flex items-center gap-2 mb-3"><FileText className="w-3.5 h-3.5 text-indigo-400" /> Application Log (Last 500 lines)</h3>
                    <pre className="bg-slate-900/80 p-3 rounded-lg overflow-auto max-h-[500px] text-xs font-mono text-slate-300 whitespace-pre-wrap border border-slate-700">{loading ? 'Loading...' : appLogContent}</pre>
                </div>
            )}

            {/* Detail Modal */}
            <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
            
            {/* Clear All Confirmation */}
            {showClearConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 max-w-sm w-full">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-red-500/20 rounded-lg"><Trash2 className="w-5 h-5 text-red-400" /></div>
                            <h2 className="text-lg font-bold text-white">Clear All Logs?</h2>
                        </div>
                        <p className="text-slate-400 text-sm mb-4">This will permanently delete all {stats?.total || 0} logs.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowClearConfirm(false)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">Cancel</button>
                            <button onClick={handleClearAllLogs} className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm">Clear All</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Logs;
