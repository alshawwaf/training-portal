import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import LogDetailModal from '../../components/monitoring/LogDetailModal';
import { 
    Activity, CheckCircle, XCircle, Info,
    Clock, RefreshCw, Download, Server, FileText, 
    ChevronDown, Search, AlertTriangle, Trash2, X, 
    ChevronLeft, ChevronRight, Mail, Filter
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
    user_name: string | null;
}

interface LogStats {
    total: number;
    errors: number;
    warnings: number;
    by_source: Record<string, number>;
}

const levelConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    SUCCESS: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    ERROR: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/15' },
    WARNING: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/15' },
    INFO: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/15' },
    STARTED: { icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
};

const sourceConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    APP: { icon: Activity, color: 'text-indigo-400', label: 'App' },
    VSPHERE: { icon: Server, color: 'text-cyan-400', label: 'vSphere' },
    PROXMOX: { icon: Server, color: 'text-orange-400', label: 'Proxmox' },
    SYSTEM: { icon: FileText, color: 'text-purple-400', label: 'System' },
    EMAIL: { icon: Mail, color: 'text-pink-400', label: 'Email' },
};

const ITEMS_PER_PAGE = 20;

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
    const [showFilters, setShowFilters] = useState(false);

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
        return action.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatFullDate = (dateStr: string) => new Date(dateStr).toLocaleString();

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
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Compact Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-primary">System Logs</h1>
                        <p className="text-xs text-secondary">{stats?.total || 0} total events</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Compact Tabs */}
                    <div className="flex gap-0.5 p-0.5 bg-secondary/20 rounded-lg border border-theme">
                        <button 
                            onClick={() => setActiveTab('operational')} 
                            className={clsx("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", 
                                activeTab === 'operational' ? "bg-blue-600 text-white" : "text-secondary hover:text-primary"
                            )}
                        >
                            Activity
                        </button>
                        <button 
                            onClick={() => setActiveTab('application')} 
                            className={clsx("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", 
                                activeTab === 'application' ? "bg-purple-600 text-white" : "text-secondary hover:text-primary"
                            )}
                        >
                            App Log
                        </button>
                    </div>
                    
                    {/* Actions */}
                    <button 
                        onClick={() => activeTab === 'operational' ? fetchLogs() : fetchAppLog()} 
                        className="p-2 bg-secondary/30 hover:bg-secondary/50 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={clsx("w-4 h-4 text-secondary", loading && "animate-spin")} />
                    </button>
                    
                    <div className="relative group">
                        <button className="p-2 bg-secondary/30 hover:bg-secondary/50 rounded-lg transition-colors" title="Export">
                            <Download className="w-4 h-4 text-secondary" />
                        </button>
                        <div className="absolute right-0 mt-1 w-28 bg-primary border border-theme rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 overflow-hidden">
                            <button onClick={() => handleExport('csv')} className="w-full px-3 py-2 text-left text-xs text-primary hover:bg-secondary/40 transition-colors">CSV</button>
                            <button onClick={() => handleExport('json')} className="w-full px-3 py-2 text-left text-xs text-primary hover:bg-secondary/40 transition-colors">JSON</button>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => setShowClearConfirm(true)} 
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                        title="Clear All"
                    >
                        <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                </div>
            </div>

            {/* Inline Stats (Compact) */}
            {stats && activeTab === 'operational' && (
                <div className="flex flex-wrap items-center gap-4 text-sm pb-2">
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        <span className="text-red-400 font-semibold">{stats.errors}</span>
                        <span className="text-secondary text-xs">errors</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className="text-amber-400 font-semibold">{stats.warnings}</span>
                        <span className="text-secondary text-xs">warnings</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-emerald-400 font-semibold">{stats.total - stats.errors - stats.warnings}</span>
                        <span className="text-secondary text-xs">success</span>
                    </div>
                    <div className="hidden md:block flex-1"></div>
                    {Object.entries(stats.by_source || {}).filter(([_, count]) => count > 0).map(([source, count]) => (
                        <div key={source} className="flex items-center gap-1 px-2 py-0.5 bg-secondary/20 rounded text-xs max-w-[200px]" title={source}>
                            <span className={clsx(sourceConfig[source]?.color || 'text-secondary', "truncate")}>{sourceConfig[source]?.label || source}</span>
                            <span className="text-secondary flex-shrink-0">({count})</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Search & Filter Bar */}
            {activeTab === 'operational' && (
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                        <input 
                            type="text" 
                            value={searchQuery} 
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} 
                            placeholder="Search logs..." 
                            className="w-full pl-9 pr-4 py-2 bg-primary border border-theme rounded-lg text-sm text-primary placeholder:text-secondary/60 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all" 
                        />
                    </div>
                    
                    <button 
                        onClick={() => setShowFilters(!showFilters)}
                        className={clsx("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all", 
                            hasActiveFilters ? "bg-blue-500/10 border-blue-500/40 text-blue-400" : "bg-secondary/20 border-theme text-secondary hover:text-primary"
                        )}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Filters
                        {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>}
                    </button>
                    
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}

            {/* Filter Dropdowns */}
            {showFilters && activeTab === 'operational' && (
                <div className="flex items-center gap-3 p-3 bg-secondary/10 rounded-lg border border-theme">
                    <select 
                        value={filterLevel} 
                        onChange={(e) => setFilterLevel(e.target.value)} 
                        className="px-3 py-1.5 bg-primary border border-theme rounded-lg text-xs text-primary focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    >
                        <option value="">All Levels</option>
                        <option value="SUCCESS">✓ Success</option>
                        <option value="INFO">ℹ Info</option>
                        <option value="WARNING">⚠ Warning</option>
                        <option value="ERROR">✕ Error</option>
                        <option value="STARTED">▶ Started</option>
                    </select>
                    <select 
                        value={filterSource} 
                        onChange={(e) => setFilterSource(e.target.value)} 
                        className="px-3 py-1.5 bg-primary border border-theme rounded-lg text-xs text-primary focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    >
                        <option value="">All Sources</option>
                        <option value="APP">App</option>
                        <option value="VSPHERE">vSphere</option>
                        <option value="PROXMOX">Proxmox</option>
                        <option value="EMAIL">Email</option>
                        <option value="SYSTEM">System</option>
                    </select>
                </div>
            )}

            {/* Content */}
            {activeTab === 'operational' ? (
                <div className="space-y-1">
                    {loading && logs.length === 0 ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                    ) : paginatedLogs.length === 0 ? (
                        <div className="text-center py-12 bg-secondary/10 rounded-xl border border-theme">
                            <Activity className="w-10 h-10 text-secondary/40 mx-auto mb-2" />
                            <p className="text-secondary text-sm">No logs found</p>
                        </div>
                    ) : (
                        <div className="bg-primary rounded-xl border border-theme overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-[auto_1fr_100px_100px_80px_40px] gap-3 px-4 py-2 bg-secondary/10 border-b border-theme text-xs font-semibold text-secondary uppercase tracking-wider">
                                <div className="w-8"></div>
                                <div>Event</div>
                                <div>Source</div>
                                <div>Time</div>
                                <div>Status</div>
                                <div></div>
                            </div>
                            
                            {/* Table Rows */}
                            {paginatedLogs.map(log => {
                                const levelStyle = levelConfig[log.level] || levelConfig.INFO;
                                const sourceStyle = sourceConfig[log.source] || sourceConfig.APP;
                                const LevelIcon = levelStyle.icon;

                                return (
                                    <div 
                                        key={log.id} 
                                        onClick={() => setSelectedLog(log)} 
                                        className="grid grid-cols-[auto_1fr_100px_100px_80px_40px] gap-3 px-4 py-2.5 hover:bg-secondary/10 border-b border-theme/50 last:border-0 cursor-pointer group transition-colors"
                                    >
                                        <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", levelStyle.bg)}>
                                            <LevelIcon className={clsx("w-4 h-4", levelStyle.color)} />
                                        </div>
                                        <div className="min-w-0 flex flex-col justify-center">
                                            <span className="text-sm font-medium text-primary truncate">{formatAction(log.action)}</span>
                                            <span className="text-xs text-secondary truncate">{log.entity_name}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <span className={clsx("text-xs font-medium", sourceStyle.color)}>{sourceStyle.label}</span>
                                        </div>
                                        <div className="flex items-center" title={formatFullDate(log.created_at)}>
                                            <span className="text-xs text-secondary">{formatDate(log.created_at)}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <span className={clsx("px-2 py-0.5 rounded text-[10px] font-bold uppercase", levelStyle.bg, levelStyle.color)}>
                                                {log.level}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-center">
                                            <button 
                                                onClick={(e) => handleDeleteLog(log.id, e)} 
                                                className="p-1.5 rounded-md text-secondary/40 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-3">
                            <p className="text-xs text-secondary">
                                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} of {filteredLogs.length}
                            </p>
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                    disabled={currentPage === 1} 
                                    className="p-1.5 rounded-md bg-secondary/20 text-secondary hover:bg-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="px-3 py-1 text-xs font-medium text-primary">
                                    {currentPage} / {totalPages}
                                </span>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                    disabled={currentPage === totalPages} 
                                    className="p-1.5 rounded-md bg-secondary/20 text-secondary hover:bg-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-primary rounded-xl border border-theme overflow-hidden">
                    <div className="px-4 py-2 bg-secondary/10 border-b border-theme flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-semibold text-primary">Application Log</span>
                        <span className="text-xs text-secondary">(Last 500 lines)</span>
                    </div>
                    <pre className="p-4 overflow-auto max-h-[600px] text-xs font-mono text-secondary whitespace-pre-wrap">
                        {loading ? 'Loading...' : appLogContent}
                    </pre>
                </div>
            )}

            {/* Detail Modal */}
            <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
            
            {/* Clear All Confirmation */}
            {showClearConfirm && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-primary border border-theme rounded-xl shadow-2xl p-5 max-w-sm w-full animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-red-500/20 rounded-lg"><Trash2 className="w-5 h-5 text-red-400" /></div>
                            <h2 className="text-lg font-bold text-primary">Clear All Logs?</h2>
                        </div>
                        <p className="text-secondary text-sm mb-4">This will permanently delete all {stats?.total || 0} logs. This cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 bg-secondary/30 hover:bg-secondary/50 text-primary rounded-lg text-sm font-medium transition-colors">Cancel</button>
                            <button onClick={handleClearAllLogs} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors">Clear All</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Logs;
