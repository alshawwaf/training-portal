import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { 
    Activity, CheckCircle, XCircle, AlertTriangle, 
    Clock, RefreshCw, Filter, PlayCircle 
} from 'lucide-react';
import clsx from 'clsx';

interface ActionLog {
    id: number;
    action: string;
    entity_name: string;
    status: string;
    details: string | null;
    created_at: string;
    user_id: number | null;
}

const statusConfig: Record<string, { icon: React.ElementType, color: string, bg: string, border: string }> = {
    SUCCESS: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    ERROR: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    WARNING: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    STARTED: { icon: PlayCircle, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    INFO: { icon: Activity, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
};

const Logs: React.FC = () => {
    const { showToast } = useToast();
    const [logs, setLogs] = useState<ActionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterAction, setFilterAction] = useState<string>('');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = filterAction ? { action: filterAction } : {};
            const res = await api.get('/logs/', { params });
            setLogs(res.data);
        } catch (err) {
            showToast('Failed to fetch logs', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchLogs, 30000);
        return () => clearInterval(interval);
    }, [filterAction]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    // Calculate duration or relative time if needed
    // For now simple date string

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-indigo-600 to-cyan-600 rounded-xl">
                            <Activity className="w-6 h-6 text-white" />
                        </div>
                        System Logs
                    </h1>
                    <p className="text-secondary mt-1">Audit trail of system actions and provisioning events</p>
                </div>
                <div className="flex items-center gap-3">
                     <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                        <select 
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                            className="pl-9 pr-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none min-w-[150px]"
                        >
                            <option value="">All Actions</option>
                            <option value="PROVISION_CLASS">Provision Class</option>
                            <option value="DELETE_CLASS">Delete Class</option>
                            <option value="CREATE_CLASS">Create Class</option>
                            <option value="LOGIN">Login</option>
                        </select>
                    </div>
                    
                    <button
                        onClick={() => fetchLogs()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
                    >
                        <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {loading && logs.length === 0 ? (
                    <div className="flex items-center justify-center py-16">
                         <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-16 card">
                        <Activity className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary">No logs found</p>
                    </div>
                ) : (
                    logs.map(log => {
                        const statusStyle = statusConfig[log.status] || statusConfig.INFO;
                        const StatusIcon = statusStyle.icon;

                        return (
                            <div key={log.id} className="card p-4 hover:border-indigo-500/30 transition-all duration-200 group">
                                <div className="flex items-start gap-4">
                                    <div className={clsx("p-3 rounded-xl shrink-0", statusStyle.bg)}>
                                        <StatusIcon className={clsx("w-5 h-5", statusStyle.color)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <h3 className="text-lg font-semibold text-primary">{log.action}</h3>
                                            <div className="flex items-center gap-2 text-xs text-secondary">
                                                <Clock className="w-3.5 h-3.5" />
                                                {formatDate(log.created_at)}
                                            </div>
                                        </div>
                                        <p className="text-sm font-medium text-primary mb-1">{log.entity_name}</p>
                                        {log.details && (
                                            <p className="text-sm text-secondary break-words bg-secondary/30 p-2 rounded-lg mt-2 font-mono text-xs">
                                                {log.details}
                                            </p>
                                        )}
                                    </div>
                                    <div className="shrink-0">
                                         <span className={clsx(
                                            "inline-flex px-2.5 py-1 rounded-lg text-xs font-medium border",
                                            statusStyle.bg, statusStyle.color, statusStyle.border
                                        )}>
                                            {log.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Logs;
