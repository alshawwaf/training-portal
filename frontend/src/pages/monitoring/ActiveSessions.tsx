import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { 
    Users, RefreshCw, Clock, Monitor, Server, 
    Mail, User, ChevronDown, ChevronRight, Wifi
} from 'lucide-react';
import clsx from 'clsx';

interface VMInfo {
    id: number;
    name: string;
    status: string | null;
    ip: string | null;
}

interface StudentSession {
    id: number;
    email: string;
    name: string | null;
    class_id: number;
    class_name: string;
    class_status: string;
    environment_id: number | null;
    environment_name: string | null;
    student_number: number | null;
    joined_at: string | null;
    last_active: string | null;
    vms: VMInfo[];
}

const ActiveSessions: React.FC = () => {
    const { showToast } = useToast();
    const [sessions, setSessions] = useState<StudentSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const res = await api.get('/student/admin/sessions');
            setSessions(res.data);
        } catch (err) {
            showToast('Failed to fetch active sessions', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchSessions, 30000);
        return () => clearInterval(interval);
    }, []);

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleString();
    };

    const getTimeAgo = (dateStr: string | null) => {
        if (!dateStr) return 'Unknown';
        const diff = Date.now() - new Date(dateStr).getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const activeCount = sessions.filter(s => {
        if (!s.last_active) return false;
        const diff = Date.now() - new Date(s.last_active).getTime();
        return diff < 10 * 60 * 1000; // Active in last 10 minutes
    }).length;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-teal-500 via-cyan-500 to-blue-500 shadow-lg shadow-teal-500/25">
                        <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-primary">Active Sessions</h1>
                        <p className="text-sm text-secondary">Monitor students currently in classes</p>
                    </div>
                </div>
                <button
                    onClick={fetchSessions}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium rounded-xl shadow-lg shadow-teal-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm disabled:opacity-50"
                >
                    <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
                    Refresh
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="glass rounded-2xl p-4 border border-theme group hover:border-teal-500/40 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 shadow-lg shadow-teal-500/20 group-hover:scale-110 transition-transform">
                            <Users className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-primary">{sessions.length}</p>
                            <p className="text-xs text-secondary">Total Sessions</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-2xl p-4 border border-theme group hover:border-green-500/40 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/20 group-hover:scale-110 transition-transform">
                            <Wifi className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-green-400">{activeCount}</p>
                            <p className="text-xs text-secondary">Active Now</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-2xl p-4 border border-theme group hover:border-blue-500/40 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
                            <Monitor className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-primary">
                                {sessions.reduce((acc, s) => acc + s.vms.length, 0)}
                            </p>
                            <p className="text-xs text-secondary">Total VMs</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-2xl p-4 border border-theme group hover:border-purple-500/40 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform">
                            <Server className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-primary">
                                {new Set(sessions.map(s => s.class_id)).size}
                            </p>
                            <p className="text-xs text-secondary">Classes</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sessions Table */}
            <div className="card-elevated rounded-2xl overflow-hidden border border-theme">
                <div className="px-5 py-4 border-b border-theme bg-secondary/20">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                        <Users className="w-4 h-4 text-teal-500" />
                        Student Sessions
                    </h3>
                </div>
                
                {loading && sessions.length === 0 ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="text-center py-16">
                        <Users className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary">No active student sessions</p>
                        <p className="text-xs text-secondary/60 mt-1">Students will appear here when they join a class</p>
                    </div>
                ) : (
                    <div className="divide-y divide-theme">
                        {sessions.map(session => {
                            const isExpanded = expandedId === session.id;
                            const isActive = session.last_active && (Date.now() - new Date(session.last_active).getTime()) < 10 * 60 * 1000;
                            
                            return (
                                <div key={session.id} className="bg-primary hover:bg-secondary/20 transition-colors">
                                    <div 
                                        className="px-5 py-4 flex items-center gap-4 cursor-pointer"
                                        onClick={() => setExpandedId(isExpanded ? null : session.id)}
                                    >
                                        <button className="p-1 text-secondary hover:text-primary transition-colors">
                                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </button>
                                        
                                        {/* Status indicator */}
                                        <div className={clsx(
                                            "w-2.5 h-2.5 rounded-full shrink-0",
                                            isActive ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-slate-500"
                                        )} />
                                        
                                        {/* Email & Name */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Mail className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                                <span className="text-sm font-semibold text-primary truncate">{session.email}</span>
                                            </div>
                                            {session.name && (
                                                <p className="text-xs text-secondary flex items-center gap-1 mt-0.5">
                                                    <User className="w-3 h-3" />
                                                    {session.name}
                                                </p>
                                            )}
                                        </div>
                                        
                                        {/* Class */}
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-medium text-primary">{session.class_name}</p>
                                            <p className={clsx(
                                                "text-xs px-2 py-0.5 rounded-full inline-block mt-0.5",
                                                session.class_status === 'active' ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"
                                            )}>
                                                {session.class_status}
                                            </p>
                                        </div>
                                        
                                        {/* Environment */}
                                        <div className="text-right shrink-0 w-24">
                                            <p className="text-xs text-secondary">Environment</p>
                                            <p className="text-sm font-mono text-primary">
                                                #{session.student_number ?? '—'}
                                            </p>
                                        </div>
                                        
                                        {/* Last Active */}
                                        <div className="text-right shrink-0 w-28">
                                            <p className="text-xs text-secondary flex items-center justify-end gap-1">
                                                <Clock className="w-3 h-3" />
                                                Last Active
                                            </p>
                                            <p className={clsx(
                                                "text-sm font-medium",
                                                isActive ? "text-green-400" : "text-secondary"
                                            )}>
                                                {getTimeAgo(session.last_active)}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {/* Expanded Details */}
                                    {isExpanded && (
                                        <div className="px-5 pb-4 bg-secondary/10 border-t border-theme/50">
                                            <div className="grid grid-cols-2 gap-4 pt-4">
                                                <div>
                                                    <p className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Session Info</p>
                                                    <div className="space-y-1 text-sm">
                                                        <p><span className="text-secondary">Joined:</span> <span className="text-primary">{formatDate(session.joined_at)}</span></p>
                                                        <p><span className="text-secondary">Last Active:</span> <span className="text-primary">{formatDate(session.last_active)}</span></p>
                                                        <p><span className="text-secondary">Environment ID:</span> <span className="text-primary font-mono">{session.environment_id ?? '—'}</span></p>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">VMs ({session.vms.length})</p>
                                                    {session.vms.length === 0 ? (
                                                        <p className="text-sm text-secondary">No VMs assigned</p>
                                                    ) : (
                                                        <div className="space-y-1.5">
                                                            {session.vms.map(vm => (
                                                                <div key={vm.id} className="flex items-center gap-2 text-sm bg-background/50 px-3 py-1.5 rounded-lg">
                                                                    <div className={clsx(
                                                                        "w-2 h-2 rounded-full",
                                                                        vm.status === 'poweredOn' ? "bg-green-500" : "bg-red-500"
                                                                    )} />
                                                                    <span className="text-primary font-medium truncate">{vm.name}</span>
                                                                    <span className="text-secondary text-xs font-mono ml-auto">{vm.ip || 'No IP'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActiveSessions;
