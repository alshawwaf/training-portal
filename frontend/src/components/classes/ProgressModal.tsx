import React, { useEffect, useState, useRef } from 'react';
import { X, Terminal, CheckCircle2, AlertCircle, Loader2, Minimize2, Maximize2, Trash2, Sparkles, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import api from '../../api';

interface ProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  apiUrl: string;
  method: 'POST' | 'DELETE' | 'PUT';
  payload?: any;
  actionParams?: {
    successMessage?: string;
    closeOnSuccess?: boolean; // If true, auto-close or enable close button immediately
  };
}

interface LogEntry {
  status: 'info' | 'progress' | 'success' | 'error' | 'warning' | 'completed' | 'detail';
  message: string;
  percent?: number;
  timestamp: string;
}

const ProgressModal: React.FC<ProgressModalProps> = ({ 
    isOpen, 
    onClose, 
    title, 
    subtitle, 
    apiUrl, 
    method, 
    payload,
    actionParams 
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [isMinimized, setIsMinimized] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (logEndRef.current && !isMinimized) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isMinimized]);

  useEffect(() => {
    if (isOpen && status === 'idle') {
      startOperation();
    }
    
    // Cleanup on unmount or close
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const startOperation = async () => {
    setStatus('running');
    setLogs([]);
    setProgress(0);
    
    abortControllerRef.current = new AbortController();

    try {
      // Use fetch directly for streaming support since axios streaming is tricky in browser
      const token = localStorage.getItem('token'); // Assuming standard JWT auth
      
      const headers: HeadersInit = {
            'Authorization': `Bearer ${token}`
      };
      
      if (payload || method === 'POST') {
          headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(`${api.defaults.baseURL}${apiUrl}`, {
        method: method,
        headers: headers,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        // If 404/500 returns json, try to parse it
        try {
            const errJson = JSON.parse(errorText);
            throw new Error(errJson.detail || errJson.message || response.statusText);
        } catch {
            throw new Error(errorText || response.statusText);
        }
      }

      const contentType = response.headers.get('content-type');
      
      // Handle Streaming Responses (NDJSON)
      if (contentType && contentType.includes('x-ndjson')) {
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            
            // Process all complete lines
            buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    const entry: LogEntry = {
                        status: data.status,
                        message: data.message,
                        percent: data.percent,
                        timestamp: new Date().toLocaleTimeString()
                    };

                    setLogs(prev => [...prev, entry]);

                    if (data.percent !== undefined) {
                        setProgress(data.percent);
                    }

                    if (data.status === 'completed') {
                        setStatus('completed');
                    } else if (data.status === 'error' || data.status === 'completed_with_errors') {
                        setStatus('error');
                    }
                } catch (e) {
                    console.warn("Failed to parse NDJSON line:", line);
                }
            }
        }
      } else {
          // Handle Synchronous Responses (Standard JSON)
          const data = await response.json();
          setProgress(100);
          setStatus(data.success === false ? 'error' : 'completed');
          setLogs(prev => [
            ...prev, 
            { 
                status: data.success === false ? 'error' : 'success', 
                message: data.message || (data.success === false ? 'Operation failed' : 'Operation completed successfully'), 
                timestamp: new Date().toLocaleTimeString() 
            },
            {
                 status: 'completed',
                 message: 'Done.',
                 timestamp: new Date().toLocaleTimeString()
            }
          ]);
      }

    } catch (err: any) {
        if (err.name === 'AbortError') {
            setLogs(prev => [...prev, { status: 'warning', message: 'Operation aborted by user.', timestamp: new Date().toLocaleTimeString() }]);
        } else {
            setLogs(prev => [...prev, { status: 'error', message: `Request failed: ${err.message}`, timestamp: new Date().toLocaleTimeString() }]);
            setStatus('error');
        }
    }
  };

  if (!isOpen) return null;

  // Determine icon based on operation/title
  const getIcon = () => {
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('delete') || lowerTitle.includes('remove')) return <Trash2 className="w-5 h-5" />;
      if (lowerTitle.includes('provision')) return <Sparkles className="w-5 h-5" />;
      if (lowerTitle.includes('revert')) return <RefreshCw className="w-5 h-5" />;
      return <Terminal className="w-5 h-5" />;
  };

  const getHeaderColor = () => {
      if (status === 'error') return "text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10";
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('delete') || lowerTitle.includes('remove')) return "text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10";
      return "text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/10";
  };
  
  const headerColorClass = getHeaderColor();

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 w-80 flex items-center justify-between animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="flex items-center gap-3">
          {status === 'running' ? (
             <div className="relative">
                <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">{Math.round(progress)}</span>
             </div>
          ) : status === 'completed' ? (
             <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
             <AlertCircle className="w-5 h-5 text-rose-500" />
          )}
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{title}</div>
            <div className="text-[10px] text-slate-400 truncate">{status === 'running' ? logs[logs.length-1]?.message || 'Working...' : status}</div>
          </div>
        </div>
        <button 
           onClick={() => setIsMinimized(false)}
           className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
           <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
             <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", headerColorClass)}>
                {getIcon()}
             </div>
             <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
                {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{subtitle}</p>}
             </div>
          </div>
          <div className="flex items-center gap-1">
             <button 
                onClick={() => setIsMinimized(true)} 
                className="p-2 text-slate-400 hover:text-violet-500 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                title="Minimize"
             >
                <Minimize2 className="w-4 h-4" />
             </button>
             {status !== 'running' && (
                <button 
                    onClick={onClose}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
             )}
          </div>
        </div>

        {/* content */}
        <div className="flex-1 overflow-hidden flex flex-col p-5 gap-5">
            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                    <span>Progress</span>
                    <span className={clsx(
                        status === 'completed' && "text-emerald-500",
                        status === 'error' && "text-rose-500"
                    )}>{Math.round(progress)}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className={clsx(
                            "h-full transition-all duration-300 ease-out",
                            status === 'completed' ? "bg-emerald-500" :
                            status === 'error' ? "bg-rose-500" :
                            "bg-gradient-to-r from-violet-500 to-fuchsia-500 relative"
                        )}
                        style={{ width: `${progress}%` }}
                    >
                        {status === 'running' && (
                             <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                        )}
                    </div>
                </div>
            </div>

            {/* Logs Window */}
            <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs overflow-y-auto min-h-[300px] shadow-inner">
                <div className="space-y-1.5">
                    {logs.map((log, idx) => (
                        <div key={idx} className="flex gap-3 leading-relaxed animate-in fade-in slide-in-from-left-2 duration-300">
                            <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                            <span className={clsx(
                                "break-all",
                                log.status === 'info' && "text-blue-400",
                                log.status === 'success' && "text-emerald-400 font-bold",
                                log.status === 'warning' && "text-amber-400",
                                log.status === 'error' && "text-rose-400 font-bold",
                                log.status === 'detail' && "text-slate-500 pl-4",
                                log.status === 'completed' && "text-emerald-300 font-bold underline decoration-wavy",
                                (log.status === 'progress' || !log.status) && "text-slate-300"
                            )}>
                                {log.status === 'success' && '✓ '} 
                                {log.status === 'error' && '✗ '}
                                {log.message}
                            </span>
                        </div>
                    ))}
                    {status === 'running' && (
                        <div className="flex gap-3 pt-2 opacity-50">
                             <span className="text-slate-600">...</span>
                             <span className="text-violet-400 animate-pulse">_</span>
                        </div>
                    )}
                    <div ref={logEndRef} />
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button 
                onClick={onClose}
                disabled={status === 'running'}
                className="px-6 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600"
            >
                {status === 'running' ? 'Please Wait...' : 'Close'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ProgressModal;
