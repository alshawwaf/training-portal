import React, { useEffect, useState, useRef } from 'react';
import { Terminal, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '../Modal';

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
    isOpen, onClose, classId, className, onComplete 
}) => {
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [progress, setProgress] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [hasErrors, setHasErrors] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const streamRef = useRef<AbortController | null>(null);

    // Auto-scroll to bottom of logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    useEffect(() => {
        if (isOpen && classId) {
            startProvisioning(classId);
        } else {
            // Reset state on close/unmount
            setLogs([]);
            setProgress(0);
            setIsComplete(false);
            setHasErrors(false);
            if (streamRef.current) {
                streamRef.current.abort();
            }
        }
    }, [isOpen, classId]);

    const startProvisioning = async (id: number) => {
        setLogs([{ status: 'info', message: `Initializing provisioning for ${className}...`, timestamp: new Date() }]);
        setProgress(0);
        setIsComplete(false);
        setHasErrors(false);

        const controller = new AbortController();
        streamRef.current = controller;

        try {
            // Note: We use fetch here instead of axios to handle streaming response manually
            // We need the full URL from environment or relative path if proxy is set up
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
                try {
                     errorMsg = JSON.parse(errorText).detail || errorText;
                } catch (e) { errorMsg = errorText; }
                
                addLog('error', `Failed to start: ${errorMsg}`);
                setHasErrors(true);
                setIsComplete(true);
                return;
            }

            if (!response.body) {
                addLog('error', 'No response body received');
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
                // Chunk might contain multiple JSON lines
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.status) {
                            addLog(data.status, data.message, data.percent);
                            
                            if (data.percent !== undefined) {
                                setProgress(data.percent);
                            }

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
                    } catch (e) {
                        console.warn("Failed to parse log line:", line);
                    }
                }
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                addLog('info', 'Provisioning aborted by user.');
            } else {
                addLog('error', `Network error: ${error.message}`);
                setHasErrors(true);
                setIsComplete(true);
            }
        }
    };

    const addLog = (status: LogMessage['status'], message: string, percent?: number) => {
        setLogs(prev => [...prev, { status, message, timestamp: new Date(), percent }]);
    };

    const getStatusIcon = () => {
        if (hasErrors) return <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />;
        if (isComplete) return <CheckCircle className="w-8 h-8 text-green-500 animate-bounce" />;
        return <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />;
    };

    const getStatusText = () => {
        if (hasErrors) return 'Completed with warnings';
        if (isComplete) return 'Provisioning Complete';
        return `Provisioning ${className}...`;
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                if (isComplete) {
                    onClose();
                } else {
                    if (confirm("Provisioning is running in the background. Are you sure you want to close this window? Logs will be lost.")) {
                        onClose();
                    }
                }
            }}
            title="Provisioning Environments"
            icon={getStatusIcon()}
            maxWidth="3xl"
        >
            <div className="space-y-6">
                {/* Header Status */}
                <div className="flex flex-col items-center justify-center p-6 bg-secondary/5 rounded-2xl border border-theme">
                     <h2 className="text-xl font-bold text-primary mb-2 flex items-center gap-3">
                        {getStatusIcon()}
                        {getStatusText()}
                     </h2>
                     <div className="w-full max-w-md h-2 bg-secondary/20 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-300 ${hasErrors ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{ width: `${progress}%` }}
                        ></div>
                     </div>
                     <p className="text-sm text-secondary mt-2 font-mono">{progress}% Completed</p>
                </div>

                {/* Terminal Logs */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-inner font-mono text-sm h-96 flex flex-col">
                    <div className="bg-gray-800 px-4 py-2 flex items-center gap-2 border-b border-gray-700">
                        <Terminal className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-400">console output</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-1 custom-scrollbar">
                        {logs.map((log, idx) => (
                            <div key={idx} className={`flex items-start gap-3 animate-in fade-in slide-in-from-left-1 duration-150`}>
                                <span className="text-gray-500 text-[10px] min-w-[60px] pt-0.5">
                                    {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                                </span>
                                <span className={`flex-1 break-words ${
                                    log.status === 'error' ? 'text-red-400 font-bold' :
                                    log.status === 'success' ? 'text-green-400' :
                                    log.status === 'detail' ? 'text-gray-400 pl-4' :
                                    log.status === 'info' ? 'text-blue-300' :
                                    'text-gray-300'
                                }`}>
                                    {log.message}
                                </span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end pt-2">
                    <button
                        onClick={onClose}
                        disabled={!isComplete}
                        className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
                            isComplete 
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20' 
                            : 'bg-secondary/10 text-secondary cursor-not-allowed opacity-50'
                        }`}
                    >
                        {isComplete ? (hasErrors ? 'Close (Check Errors)' : 'Close & Finish') : 'Please Wait...'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ProvisioningStatusModal;
