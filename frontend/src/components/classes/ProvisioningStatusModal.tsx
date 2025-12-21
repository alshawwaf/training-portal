import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import clsx from 'clsx';

interface ProvisioningStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    classId: number | null;
    className: string;
    onComplete?: () => void;
}

interface LogMessage {
    status: 'info' | 'progress' | 'detail' | 'success' | 'error' | 'completed' | 'completed_with_errors';
    message: string;
    timestamp: Date;
    percent?: number;
}

const ProvisioningStatusModal: React.FC<ProvisioningStatusModalProps> = ({ 
    isOpen, onClose, classId, className: provClassName, onComplete 
}) => {
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [progress, setProgress] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [hasErrors, setHasErrors] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const streamRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (logsEndRef.current && showLogs) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, showLogs]);

    useEffect(() => {
        if (isOpen && classId) {
            startProvisioning(classId);
        } else {
            setLogs([]);
            setProgress(0);
            setIsComplete(false);
            setHasErrors(false);
            setShowLogs(false);
            if (streamRef.current) {
                streamRef.current.abort();
            }
        }
    }, [isOpen, classId]);

    const startProvisioning = async (id: number) => {
        setLogs([{ status: 'info', message: `Starting provisioning...`, timestamp: new Date() }]);
        setProgress(0);
        setIsComplete(false);
        setHasErrors(false);

        const controller = new AbortController();
        streamRef.current = controller;

        try {
            const baseUrl = '/api';
            const token = localStorage.getItem('token');
            
            const response = await fetch(`${baseUrl}/classes/${id}/provision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                },
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMsg = 'Unknown error';
                try { errorMsg = JSON.parse(errorText).detail || errorText; } catch { errorMsg = errorText; }
                addLog('error', errorMsg);
                setHasErrors(true);
                setIsComplete(true);
                return;
            }

            if (!response.body) {
                addLog('error', 'No response body');
                setHasErrors(true);
                setIsComplete(true);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.status) {
                            addLog(data.status, data.message, data.percent);
                            if (data.percent !== undefined) setProgress(data.percent);
                            if (data.status === 'completed') {
                                setIsComplete(true);
                                if (onComplete) onComplete();
                            } else if (data.status === 'completed_with_errors') {
                                setIsComplete(true);
                                setHasErrors(true);
                                if (onComplete) onComplete();
                            } else if (data.status === 'error') {
                                setHasErrors(true);
                            }
                        }
                    } catch { /* skip invalid JSON */ }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                addLog('info', 'Aborted');
            } else {
                addLog('error', error.message);
                setHasErrors(true);
                setIsComplete(true);
            }
        }
    };

    const addLog = (status: LogMessage['status'], message: string, percent?: number) => {
        setLogs(prev => [...prev, { status, message, timestamp: new Date(), percent }]);
    };

    const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                if (isComplete) onClose();
                else if (confirm("Provisioning in progress. Close anyway?")) onClose();
            }}
            title={isComplete ? (hasErrors ? "Completed with Warnings" : "Complete") : `Provisioning ${provClassName}`}
            icon={
                hasErrors ? <AlertTriangle className="w-4 h-4 text-amber-400" /> :
                isComplete ? <CheckCircle className="w-4 h-4 text-emerald-400" /> :
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            }
            maxWidth="sm"
        >
            <div className="space-y-4">
                {/* Compact Progress Section */}
                <div className="space-y-2">
                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className={clsx(
                                    "h-full transition-all duration-300",
                                    hasErrors ? "bg-amber-500" : isComplete ? "bg-emerald-500" : "bg-blue-500"
                                )}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 w-10 text-right">
                            {progress}%
                        </span>
                    </div>

                    {/* Latest status message */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-900 rounded-lg">
                        {!isComplete && (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        )}
                        <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">
                            {latestLog?.message || 'Initializing...'}
                        </span>
                    </div>
                </div>

                {/* Collapsible Logs */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowLogs(!showLogs)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                            Console Output ({logs.length})
                        </span>
                        <span className="text-xs text-slate-500">{showLogs ? '−' : '+'}</span>
                    </button>
                    
                    {showLogs && (
                        <div className="max-h-40 overflow-y-auto p-2 bg-slate-800 dark:bg-slate-900 font-mono text-[11px] space-y-0.5">
                            {logs.map((log, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <span className="text-slate-500 shrink-0">
                                        {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                                    </span>
                                    <span className={clsx(
                                        log.status === 'error' ? 'text-red-400' :
                                        log.status === 'success' ? 'text-emerald-400' :
                                        log.status === 'info' ? 'text-blue-300' :
                                        'text-slate-300'
                                    )}>
                                        {log.message}
                                    </span>
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </div>

                {/* Action Button */}
                <div className="flex justify-end">
                    <button
                        onClick={onClose}
                        disabled={!isComplete}
                        className={clsx(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            isComplete 
                                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md" 
                                : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                        )}
                    >
                        {isComplete ? 'Done' : 'Working...'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ProvisioningStatusModal;
