import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Activity, Server, User, FileText, AlertCircle, CheckCircle, XCircle, Info, Hash, Tag, Calendar } from 'lucide-react';
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

    // Convert SNAKE_CASE to Title Case
    const formatAction = (action: string) => {
        return action
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    // Try to parse details as JSON for pretty display
    let parsedDetails: Record<string, unknown> | null = null;

    if (log.details) {
        try {
            parsedDetails = JSON.parse(log.details);
        } catch {
            // Not JSON, treat as plain text
        }
    }

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-200 dark:bg-slate-900">
            <div 
                ref={modalRef}
                className="glass border border-theme rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-theme bg-gradient-to-r from-cyan-600/20 to-blue-600/20">
                    <div className="flex items-center gap-4">
                        <div className={clsx("p-3 rounded-xl", levelStyle.bg)}>
                            <LevelIcon className={clsx("w-6 h-6", levelStyle.color)} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-primary">{formatAction(log.action)}</h2>
                            <p className="text-sm text-secondary">{log.entity_name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-secondary/50 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Quick Info Bar */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold", levelStyle.bg, levelStyle.color)}>
                            <LevelIcon className="w-4 h-4" />
                            {levelStyle.label}
                        </span>
                        <span className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-secondary/30", sourceStyle.color)}>
                            <SourceIcon className="w-4 h-4" />
                            {sourceStyle.label}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-secondary/30 text-secondary">
                            <Hash className="w-4 h-4" />
                            ID: {log.id}
                        </span>
                    </div>

                    {/* Metadata Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="glass border border-theme rounded-xl p-4">
                            <div className="flex items-center gap-2 text-xs text-secondary mb-2">
                                <Calendar className="w-3.5 h-3.5" />
                                Timestamp
                            </div>
                            <p className="text-sm font-semibold text-primary">{formatDate(log.created_at)}</p>
                            <p className="text-xs text-secondary mt-1">{getRelativeTime(log.created_at)}</p>
                        </div>
                        <div className="glass border border-theme rounded-xl p-4">
                            <div className="flex items-center gap-2 text-xs text-secondary mb-2">
                                <User className="w-3.5 h-3.5" />
                                User
                            </div>
                            <p className="text-sm font-semibold text-primary">{log.user_id ? `User #${log.user_id}` : 'System Action'}</p>
                            <p className="text-xs text-secondary mt-1">{log.user_id ? 'Triggered by user' : 'Automated process'}</p>
                        </div>
                        <div className="glass border border-theme rounded-xl p-4">
                            <div className="flex items-center gap-2 text-xs text-secondary mb-2">
                                <Tag className="w-3.5 h-3.5" />
                                Action Type
                            </div>
                            <p className="text-sm font-semibold text-primary">{formatAction(log.action)}</p>
                            <p className="text-xs text-secondary mt-1">{log.action}</p>
                        </div>
                        <div className="glass border border-theme rounded-xl p-4">
                            <div className="flex items-center gap-2 text-xs text-secondary mb-2">
                                <FileText className="w-3.5 h-3.5" />
                                Entity
                            </div>
                            <p className="text-sm font-semibold text-primary truncate">{log.entity_name}</p>
                            <p className="text-xs text-secondary mt-1">Target resource</p>
                        </div>
                    </div>

                    {/* Details Section */}
                    <div className="glass border border-theme rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-theme flex items-center gap-2 bg-secondary/10">
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-semibold text-primary">Details</span>
                        </div>
                        <div className="p-4">
                            {parsedDetails ? (
                                <div className="space-y-3">
                                    {Object.entries(parsedDetails).map(([key, value]) => (
                                        <div key={key} className="flex items-start gap-3">
                                            <span className="text-xs font-medium text-secondary min-w-[100px] uppercase">{key.replace(/_/g, ' ')}</span>
                                            <span className="text-sm text-primary break-all">
                                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : log.details ? (
                                <pre className="text-sm text-secondary font-mono whitespace-pre-wrap break-words">
                                    {log.details}
                                </pre>
                            ) : (
                                <p className="text-sm text-secondary italic">No additional details recorded for this log entry.</p>
                            )}
                        </div>
                    </div>

                    {/* Raw Data (collapsible) */}
                    <details className="glass border border-theme rounded-xl group">
                        <summary className="px-4 py-3 text-sm text-secondary cursor-pointer hover:text-primary transition-colors flex items-center gap-2">
                            <span className="text-xs">▶</span> View Raw JSON
                        </summary>
                        <pre className="p-4 text-xs font-mono text-secondary overflow-auto max-h-48 border-t border-theme bg-secondary/10">
                            {JSON.stringify(log, null, 2)}
                        </pre>
                    </details>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-theme flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
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
