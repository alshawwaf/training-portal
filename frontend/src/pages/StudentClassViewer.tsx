import React, { useState, useEffect, useRef } from 'react';
import { 
    Monitor, Clock, Power, ChevronRight, 
    LayoutGrid, LogOut, Play, Square,
    RotateCcw, Pause, ExternalLink, Maximize2,
    Server, Cpu, Wifi, WifiOff, Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import clsx from 'clsx';

interface VM {
    id: number;
    name: string;
    status: string;
    ip_address: string | null;
    role: string | null;
    os_type: string | null;
    cpu_cores: number | null;
    ram_mb: number | null;
    disk_gb: number | null;
}

interface Environment {
    id: number;
    student_number: number;
    status: string;
    class_name: string;
    class_description: string | null;
    time_remaining: string | null;
    vms: VM[];
}

const StudentClassViewer: React.FC = () => {
    const navigate = useNavigate();
    const [environment, setEnvironment] = useState<Environment | null>(null);
    const [selectedVm, setSelectedVm] = useState<VM | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [consoleUrl, setConsoleUrl] = useState<string | null>(null);
    const refreshInterval = useRef<any>(null);

    const selectedVmIdRef = useRef<number | null>(null);

    // Clean up VM names for display
    const formatDisplayName = (name: string) => {
        return name
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    const fetchEnvironment = async () => {
        try {
            const token = localStorage.getItem('student_session');
            if (!token) {
                navigate('/');
                return;
            }

            const res = await api.get(`/student/environment?session_token=${token}`);
            setEnvironment(res.data);
            
            if (res.data.vms.length > 0) {
                // Use ref to check if we already have a selection
                if (selectedVmIdRef.current === null) {
                    // First load - select first VM
                    setSelectedVm(res.data.vms[0]);
                    selectedVmIdRef.current = res.data.vms[0].id;
                } else {
                    // Update the selected VM data without changing selection
                    const updated = res.data.vms.find((v: VM) => v.id === selectedVmIdRef.current);
                    if (updated) {
                        setSelectedVm(updated);
                    }
                }
            }
        } catch (err: any) {
            console.error("Failed to fetch environment", err);
            if (err.response?.status === 401) {
                localStorage.removeItem('student_session');
                navigate('/');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const fetchConsoleUrl = async (vmId: number) => {
        try {
            const token = localStorage.getItem('student_session');
            const res = await api.get(`/student/vm/${vmId}/console?session_token=${token}`);
            if (res.data.success) {
                setConsoleUrl(res.data.console_url);
            }
        } catch (err) {
            console.error("Failed to get console URL", err);
            setConsoleUrl(null);
        }
    };

    useEffect(() => {
        fetchEnvironment();
        refreshInterval.current = setInterval(fetchEnvironment, 5000);
        return () => {
            if (refreshInterval.current) clearInterval(refreshInterval.current);
        };
    }, []);

    useEffect(() => {
        if (selectedVm && selectedVm.status === 'poweredOn') {
            fetchConsoleUrl(selectedVm.id);
        } else {
            setConsoleUrl(null);
        }
    }, [selectedVm?.id, selectedVm?.status]);

    const handleVmAction = async (action: string) => {
        if (!selectedVm || actionLoading) return;
        
        setActionLoading(action);
        try {
            const token = localStorage.getItem('student_session');
            await api.post(`/student/vm/${selectedVm.id}/power?session_token=${token}&action=${action}`);
            fetchEnvironment();
        } catch (err) {
            console.error(`Action ${action} failed`, err);
        } finally {
            setActionLoading(null);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center">
                <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/30 blur-[100px] rounded-full animate-pulse" />
                    <div className="relative w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                </div>
                <p className="mt-8 text-blue-400 font-bold text-sm tracking-wider animate-pulse">Initializing Lab Environment...</p>
            </div>
        );
    }

    if (!environment) return null;

    const isProvisioning = environment.status === 'provisioning';

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-hidden">
            {/* Premium Header */}
            <header className="h-16 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 shrink-0 z-20">
                <div className="flex items-center gap-4">
                    {/* Logo/Brand */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl blur-lg opacity-50" />
                            <div className="relative w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                                <Monitor className="w-5 h-5 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-white">{environment.class_name}</h1>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-400 font-medium">Lab Environment</span>
                                <span className="w-1 h-1 bg-slate-600 rounded-full" />
                                <span className="text-xs text-slate-400">Station #{environment.student_number}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Time Remaining */}
                    {environment.time_remaining && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-700/50">
                            <Clock className="w-4 h-4 text-amber-400" />
                            <span className="text-sm font-mono font-bold text-white">{environment.time_remaining}</span>
                            <span className="text-xs text-slate-400">remaining</span>
                        </div>
                    )}
                    
                    {/* End Session */}
                    <button 
                        onClick={() => { localStorage.removeItem('student_session'); navigate('/'); }}
                        className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/30 transition-all"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm font-medium">End Session</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* VM Sidebar */}
                <aside className="w-80 bg-slate-900/50 backdrop-blur-sm border-r border-white/5 flex flex-col shrink-0">
                    {/* VM List */}
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Server className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lab Machines</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-xs text-emerald-400">{environment.vms.filter(v => v.status === 'poweredOn').length} Online</span>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            {environment.vms.map(vm => (
                                <button
                                    key={vm.id}
                                    onClick={() => { setSelectedVm(vm); selectedVmIdRef.current = vm.id; }}
                                    className={clsx(
                                        "w-full text-left group relative p-3 rounded-xl transition-all duration-200 border",
                                        selectedVm?.id === vm.id 
                                            ? "bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/10" 
                                            : "bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50 hover:bg-slate-800/50"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Status Indicator */}
                                        <div className={clsx(
                                            "relative flex items-center justify-center w-8 h-8 rounded-lg",
                                            vm.status === 'poweredOn' 
                                                ? "bg-emerald-500/20" 
                                                : "bg-slate-700/50"
                                        )}>
                                            {vm.status === 'poweredOn' ? (
                                                <Wifi className="w-4 h-4 text-emerald-400" />
                                            ) : (
                                                <WifiOff className="w-4 h-4 text-slate-500" />
                                            )}
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <p className={clsx(
                                                "text-sm font-semibold truncate",
                                                selectedVm?.id === vm.id ? "text-white" : "text-slate-300 group-hover:text-white"
                                            )}>
                                                {formatDisplayName(vm.name)}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {vm.ip_address || 'Connecting...'}
                                            </p>
                                        </div>
                                        
                                        <ChevronRight className={clsx(
                                            "w-4 h-4 transition-all duration-200",
                                            selectedVm?.id === vm.id ? "text-blue-400 translate-x-0" : "text-slate-600 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                                        )} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Selected VM Controls */}
                    {selectedVm && (
                        <div className="flex-1 p-4 border-t border-slate-700/30 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="space-y-4">
                                {/* VM Info Card */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className={clsx(
                                            "w-10 h-10 rounded-lg flex items-center justify-center",
                                            selectedVm.status === 'poweredOn' ? "bg-emerald-500/20" : "bg-slate-700"
                                        )}>
                                            <Cpu className={clsx(
                                                "w-5 h-5",
                                                selectedVm.status === 'poweredOn' ? "text-emerald-400" : "text-slate-400"
                                            )} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white">{formatDisplayName(selectedVm.name)}</p>
                                            <p className={clsx(
                                                "text-xs font-medium",
                                                selectedVm.status === 'poweredOn' ? "text-emerald-400" : "text-slate-500"
                                            )}>
                                                {selectedVm.status === 'poweredOn' ? '● Online' : '○ Offline'}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                                            <span className="text-slate-500 block">CPU</span>
                                            <p className="text-white font-bold">{selectedVm.cpu_cores || '—'} <span className="text-slate-500 font-normal">vCPU</span></p>
                                        </div>
                                        <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                                            <span className="text-slate-500 block">RAM</span>
                                            <p className="text-white font-bold">{selectedVm.ram_mb ? `${Math.round(selectedVm.ram_mb / 1024)}` : '—'} <span className="text-slate-500 font-normal">GB</span></p>
                                        </div>
                                        <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                                            <span className="text-slate-500 block">Disk</span>
                                            <p className="text-white font-bold">{selectedVm.disk_gb || '—'} <span className="text-slate-500 font-normal">GB</span></p>
                                        </div>
                                    </div>
                                </div>


                                {/* Power Controls */}
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Power Controls</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => handleVmAction('start')}
                                            disabled={!!actionLoading || selectedVm.status === 'poweredOn'}
                                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Play className="w-3.5 h-3.5" />
                                            Start
                                        </button>
                                        <button 
                                            onClick={() => handleVmAction('stop')}
                                            disabled={!!actionLoading || selectedVm.status !== 'poweredOn'}
                                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Square className="w-3.5 h-3.5" />
                                            Stop
                                        </button>
                                        <button 
                                            onClick={() => handleVmAction('suspend')}
                                            disabled={!!actionLoading || selectedVm.status !== 'poweredOn'}
                                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Pause className="w-3.5 h-3.5" />
                                            Suspend
                                        </button>
                                        <button 
                                            onClick={() => handleVmAction('revert')}
                                            disabled={!!actionLoading}
                                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            Reset
                                        </button>
                                    </div>
                                    {actionLoading && (
                                        <p className="text-xs text-blue-400 mt-2 animate-pulse text-center">Processing {actionLoading}...</p>
                                    )}
                                </div>

                                {/* Console Actions */}
                                {consoleUrl && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Console</p>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => window.open(consoleUrl, '_blank')}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                Pop Out
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    const iframe = document.querySelector('iframe');
                                                    if (iframe) iframe.requestFullscreen?.();
                                                }}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                <Maximize2 className="w-3.5 h-3.5" />
                                                Fullscreen
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </aside>

                {/* Main Console Area */}
                <main className="flex-1 bg-black flex flex-col overflow-hidden relative">
                    <div className="flex-1 relative overflow-hidden">
                        {isProvisioning ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                                <div className="mb-8 relative">
                                    <div className="absolute inset-0 bg-blue-500/30 blur-[100px] rounded-full animate-pulse" />
                                    <div className="relative w-24 h-24 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                                    <Zap className="absolute inset-0 m-auto w-8 h-8 text-blue-400" />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-3">Provisioning Your Lab</h3>
                                <p className="text-slate-400 max-w-md">We're setting up your dedicated environment. This typically takes 1-2 minutes.</p>
                            </div>
                        ) : selectedVm ? (
                            selectedVm.status === 'poweredOn' ? (
                                consoleUrl ? (
                                    <iframe 
                                        src={consoleUrl}
                                        className="w-full h-full border-0 bg-black"
                                        title="VM Console"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                                        <div className="w-12 h-12 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                                        <p className="text-sm text-blue-400 font-medium">Connecting to console...</p>
                                    </div>
                                )
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                                    <div className="relative group mb-8">
                                        <div className="absolute inset-0 bg-emerald-500/20 blur-[80px] rounded-full group-hover:bg-emerald-500/30 transition-colors" />
                                        <div className="relative p-8 bg-slate-800/50 rounded-3xl border border-slate-700/50 shadow-2xl group-hover:scale-105 transition-transform duration-300">
                                            <Power className="w-16 h-16 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                                        </div>
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-3">Machine Offline</h3>
                                    <p className="text-slate-400 max-w-md mb-8">This virtual machine is powered off. Click below to start your session.</p>
                                    <button 
                                        onClick={() => handleVmAction('start')}
                                        disabled={!!actionLoading}
                                        className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-2xl shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        <Power className="w-5 h-5" />
                                        Start Machine
                                    </button>
                                </div>
                            )
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-8 text-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                                <div className="p-8 bg-slate-800/30 rounded-3xl border border-slate-700/30 border-dashed mb-6">
                                    <LayoutGrid className="w-16 h-16 text-slate-700" />
                                </div>
                                <p className="text-lg font-semibold text-slate-400">Select a Machine</p>
                                <p className="text-sm text-slate-500 mt-2">Choose a virtual machine from the sidebar to get started</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default StudentClassViewer;
