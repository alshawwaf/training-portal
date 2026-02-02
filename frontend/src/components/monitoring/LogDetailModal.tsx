import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { 
    X, Activity, Server, User, FileText, AlertCircle, CheckCircle, XCircle, Info, 
    Hash, Calendar, Clock, Copy, Check, ChevronRight, Layers, Zap, ExternalLink
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

interface LogDetailModalProps {
    log: ActionLog | null;
    onClose: () => void;
}

const levelConfig: Record<string, { icon: React.ElementType; color: string; bg: string; gradient: string; label: string; glow: string }> = {
    SUCCESS: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15', gradient: 'from-emerald-600 to-teal-600', label: 'Success', glow: 'shadow-emerald-500/30' },
    ERROR: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/15', gradient: 'from-red-600 to-rose-600', label: 'Error', glow: 'shadow-red-500/30' },
    WARNING: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/15', gradient: 'from-amber-500 to-orange-600', label: 'Warning', glow: 'shadow-amber-500/30' },
    INFO: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/15', gradient: 'from-blue-600 to-indigo-600', label: 'Info', glow: 'shadow-blue-500/30' },
    STARTED: { icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-500/15', gradient: 'from-cyan-500 to-blue-600', label: 'Started', glow: 'shadow-cyan-500/30' },
};

const sourceConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
    APP: { icon: Layers, color: 'text-indigo-400', bg: 'bg-indigo-500/15', label: 'Application' },
    VSPHERE: { icon: Server, color: 'text-cyan-400', bg: 'bg-cyan-500/15', label: 'VMware vSphere' },
    PROXMOX: { icon: Server, color: 'text-orange-400', bg: 'bg-orange-500/15', label: 'Proxmox VE' },
    SYSTEM: { icon: Zap, color: 'text-purple-400', bg: 'bg-purple-500/15', label: 'System' },
    NETWORK: { icon: Activity, color: 'text-teal-400', bg: 'bg-teal-500/15', label: 'Network' },
    EMAIL: { icon: FileText, color: 'text-pink-400', bg: 'bg-pink-500/15', label: 'Email Service' },
    TEMPLATES: { icon: Layers, color: 'text-violet-400', bg: 'bg-violet-500/15', label: 'Templates' },
    INFRA: { icon: Server, color: 'text-sky-400', bg: 'bg-sky-500/15', label: 'Infrastructure' },
};

const LogDetailModal: React.FC<LogDetailModalProps> = ({ log, onClose }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);
    const [showRawJson, setShowRawJson] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (log) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [log, onClose]);

    if (!log) return null;

    const levelStyle = levelConfig[log.level] || levelConfig.INFO;
    const sourceStyle = sourceConfig[log.source] || sourceConfig.APP;
    const LevelIcon = levelStyle.icon;
    const SourceIcon = sourceStyle.icon;

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getRelativeTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatAction = (action: string) => {
        return action
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    let parsedDetails: Record<string, unknown> | null = null;
    if (log.details) {
        try {
            parsedDetails = JSON.parse(log.details);
        } catch {
            // Not JSON
        }
    }

    const copyToClipboard = () => {
        navigator.clipboard.writeText(JSON.stringify(log, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div 
                ref={modalRef}
                className={clsx(
                    "relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl",
                    "bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950",
                    "border border-white/10 shadow-2xl",
                    levelStyle.glow,
                    "animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                )}
            >
                {/* Gradient Accent Bar */}
                <div className={clsx("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r", levelStyle.gradient)} />

                {/* Hero Header */}
                <div className="relative p-6 pb-4">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-5">
                        <div className="absolute inset-0" style={{
                            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                            backgroundSize: '24px 24px'
                        }} />
                    </div>

                    <div className="relative flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                            {/* Large Icon */}
                            <div className={clsx(
                                "flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center",
                                "bg-gradient-to-br", levelStyle.gradient,
                                "shadow-lg", levelStyle.glow
                            )}>
                                <LevelIcon className="w-7 h-7 text-white" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={clsx(
                                        "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                                        levelStyle.bg, levelStyle.color
                                    )}>
                                        {levelStyle.label}
                                    </span>
                                    <span className="text-xs text-slate-500">#{log.id}</span>
                                </div>
                                <h2 className="text-xl font-bold text-white mb-1 truncate">
                                    {formatAction(log.action)}
                                </h2>
                                <p className="text-sm text-slate-400 truncate">{log.entity_name}</p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="flex-shrink-0 p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Quick Info Pills */}
                <div className="px-6 pb-4 flex flex-wrap items-center gap-2">
                    <div className={clsx(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
                        sourceStyle.bg, sourceStyle.color
                    )}>
                        <SourceIcon className="w-3.5 h-3.5" />
                        {sourceStyle.label}
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {getRelativeTime(log.created_at)}
                    </div>
                    {log.user_id && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400">
                            <User className="w-3.5 h-3.5" />
                            {log.user_name || `User #${log.user_id}`}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="px-6 pb-6 space-y-4 max-h-[calc(90vh-240px)] overflow-y-auto">
                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-colors group">
                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                                <Calendar className="w-3.5 h-3.5" />
                                <span className="uppercase tracking-wider font-medium">Timestamp</span>
                            </div>
                            <p className="text-sm font-semibold text-white">{formatDate(log.created_at)}</p>
                        </div>
                        
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600/50 transition-colors group">
                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                                <User className="w-3.5 h-3.5" />
                                <span className="uppercase tracking-wider font-medium">Triggered By</span>
                            </div>
                            <p className="text-sm font-semibold text-white">
                                {log.user_id ? (log.user_name || `User #${log.user_id}`) : 'System Process'}
                            </p>
                        </div>
                    </div>

                    {/* Details Section */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/30">
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-semibold text-white">Details</span>
                            </div>
                            <button
                                onClick={copyToClipboard}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        
                        <div className="p-4">
                            {parsedDetails ? (
                                <div className="space-y-3">
                                    {Object.entries(parsedDetails).map(([key, value]) => (
                                        <div key={key} className="flex items-start gap-3 group">
                                            <ChevronRight className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0 group-hover:text-blue-400 transition-colors" />
                                            <div className="flex-1 min-w-0">
                                                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-0.5">
                                                    {key.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-sm text-slate-300 break-all">
                                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : log.details ? (
                                <pre className="text-sm text-slate-400 font-mono whitespace-pre-wrap break-words leading-relaxed">
                                    {log.details}
                                </pre>
                            ) : (
                                <div className="flex items-center justify-center py-6 text-slate-500">
                                    <Info className="w-4 h-4 mr-2" />
                                    <span className="text-sm">No additional details recorded</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Raw JSON Collapsible */}
                    <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
                        <button
                            onClick={() => setShowRawJson(!showRawJson)}
                            className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
                        >
                            <div className="flex items-center gap-2">
                                <Hash className="w-4 h-4" />
                                <span className="font-medium">Raw JSON Data</span>
                            </div>
                            <ChevronRight className={clsx(
                                "w-4 h-4 transition-transform duration-200",
                                showRawJson && "rotate-90"
                            )} />
                        </button>
                        
                        {showRawJson && (
                            <div className="border-t border-slate-700/50 bg-slate-900/50">
                                <pre className="p-4 text-xs font-mono text-slate-500 overflow-x-auto max-h-48">
                                    {JSON.stringify(log, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                        Log ID: <span className="font-mono text-slate-400">{log.id}</span>
                    </span>
                    <button
                        onClick={onClose}
                        className={clsx(
                            "px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all",
                            "bg-gradient-to-r", levelStyle.gradient,
                            "hover:scale-[1.02] active:scale-[0.98]",
                            "shadow-lg", levelStyle.glow
                        )}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default LogDetailModal;
