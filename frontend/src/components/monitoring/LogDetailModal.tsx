import React, { useEffect, useRef } from 'react';
import { X, Clock, Activity, Server, User, FileText, AlertCircle, CheckCircle, XCircle, Info, Hash, Tag, Calendar } from 'lucide-react';
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

interface LogDetailModalProps {
    log: ActionLog | null;
    onClose: () => void;
}

const levelConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
    SUCCESS: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20', label: 'Success' },
    ERROR: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Error' },
    WARNING: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Warning' },
    INFO: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Info' },
};

const sourceConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    APP: { icon: Activity, color: 'text-indigo-400', label: 'Application' },
    VSPHERE: { icon: Server, color: 'text-cyan-400', label: 'VMware vSphere' },
    PROXMOX: { icon: Server, color: 'text-orange-400', label: 'Proxmox VE' },
    SYSTEM: { icon: FileText, color: 'text-purple-400', label: 'System' },
};

const LogDetailModal: React.FC<LogDetailModalProps> = ({ log, onClose }) => {
    const modalRef = useRef<HTMLDivElement>(null);

    // Close on click outside
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
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
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
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        });
    };

    const getRelativeTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    };

    // Try to parse details as JSON for pretty display
    let detailsContent: React.ReactNode = null;
    let parsedDetails: Record<string, unknown> | null = null;

    if (log.details) {
        try {
            parsedDetails = JSON.parse(log.details);
        } catch {
            // Not JSON, treat as plain text
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div 
                ref={modalRef}
                className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-700">
                    <div className="flex items-center gap-4">
                        <div className={clsx("p-3 rounded-xl", levelStyle.bg)}>
                            <LevelIcon className={clsx("w-6 h-6", levelStyle.color)} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">{log.action}</h2>
                            <p className="text-sm text-slate-400">{log.entity_name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-600 transition-colors text-slate-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Quick Info Bar */}
                    <div className="flex items-center gap-4 flex-wrap">
                        <span className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium", levelStyle.bg, levelStyle.color)}>
                            <LevelIcon className="w-4 h-4" />
                            {levelStyle.label}
                        </span>
                        <span className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700", sourceStyle.color)}>
                            <SourceIcon className="w-4 h-4" />
                            {sourceStyle.label}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-slate-300">
                            <Hash className="w-4 h-4" />
                            ID: {log.id}
                        </span>
                    </div>

                    {/* Metadata Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                                <Calendar className="w-3.5 h-3.5" />
                                Timestamp
                            </div>
                            <p className="text-sm font-medium text-white">{formatDate(log.created_at)}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{getRelativeTime(log.created_at)}</p>
                        </div>
                        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                                <User className="w-3.5 h-3.5" />
                                User
                            </div>
                            <p className="text-sm font-medium text-white">{log.user_id ? `User #${log.user_id}` : 'System Action'}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{log.user_id ? 'Triggered by user' : 'Automated process'}</p>
                        </div>
                        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                                <Tag className="w-3.5 h-3.5" />
                                Action Type
                            </div>
                            <p className="text-sm font-medium text-white">{log.action}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{log.action.replace(/_/g, ' ').toLowerCase()}</p>
                        </div>
                        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                                <FileText className="w-3.5 h-3.5" />
                                Entity
                            </div>
                            <p className="text-sm font-medium text-white truncate">{log.entity_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">Target resource</p>
                        </div>
                    </div>

                    {/* Details Section */}
                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-400" />
                            <span className="text-sm font-semibold text-white">Details</span>
                        </div>
                        <div className="p-4">
                            {parsedDetails ? (
                                <div className="space-y-2">
                                    {Object.entries(parsedDetails).map(([key, value]) => (
                                        <div key={key} className="flex items-start gap-3">
                                            <span className="text-xs font-medium text-slate-400 min-w-[100px] uppercase">{key.replace(/_/g, ' ')}</span>
                                            <span className="text-sm text-white break-all">
                                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : log.details ? (
                                <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap break-words">
                                    {log.details}
                                </pre>
                            ) : (
                                <p className="text-sm text-slate-500 italic">No additional details recorded for this log entry.</p>
                            )}
                        </div>
                    </div>

                    {/* Raw Data (collapsible) */}
                    <details className="bg-slate-900/30 border border-slate-700 rounded-lg">
                        <summary className="px-4 py-2 text-sm text-slate-400 cursor-pointer hover:text-white transition-colors">
                            View Raw JSON
                        </summary>
                        <pre className="p-4 text-xs font-mono text-slate-400 overflow-auto max-h-48 border-t border-slate-700">
                            {JSON.stringify(log, null, 2)}
                        </pre>
                    </details>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LogDetailModal;
