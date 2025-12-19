import React, { useState, useEffect, useRef } from 'react';
import { 
    Monitor, Clock, Power, ChevronRight, 
    LayoutGrid, Terminal, Shield, 
    Activity, RefreshCw, Maximize2, Cpu, HardDrive,
    LogOut
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

    const fetchEnvironment = async () => {
        try {
            const token = localStorage.getItem('student_session');
            if (!token) {
                navigate('/');
                return;
            }

            const res = await api.get(`/student/environment?session_token=${token}`);
            setEnvironment(res.data);
            
            // Auto-select first VM or keep selection
            if (res.data.vms.length > 0) {
                if (!selectedVm) {
                    setSelectedVm(res.data.vms[0]);
                } else {
                    const updated = res.data.vms.find((v: VM) => v.id === selectedVm.id);
                    if (updated) {
                        // Only update if status or IP actually changed to avoid iframe reload jitters
                        if (updated.status !== selectedVm.status || updated.ip_address !== selectedVm.ip_address) {
                            setSelectedVm(updated);
                        }
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
            // Force refresh
            fetchEnvironment();
        } catch (err) {
            console.error(`Action ${action} failed`, err);
        } finally {
            setActionLoading(null);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
                <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 blur-3xl animate-pulse rounded-full" />
                    <div className="relative w-16 h-16 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin shadow-2xl" />
                </div>
                <p className="mt-8 text-blue-500 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Initializing Secure Lab</p>
            </div>
        );
    }

    if (!environment) return null;

    const isProvisioning = environment.status === 'provisioning';

    return (
        <div className="fixed inset-0 bg-[#050505] flex flex-col overflow-hidden text-[#e2e8f0]">
            {/* Header - Premium Minimalist */}
            <header className="h-16 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-20">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 group">
                            <Monitor className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                        </div>
                        <div>
                            <h1 className="text-sm font-black tracking-tight text-white uppercase">{environment.class_name}</h1>
                            <div className="flex items-center gap-4 mt-0.5">
                                <span className="text-[9px] text-blue-500 font-black uppercase tracking-widest">Workspace</span>
                                <div className="h-1 w-1 bg-white/20 rounded-full" />
                                <span className="text-[9px] text-[#94a3b8] font-bold uppercase tracking-wider">Env #{environment.student_number}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {environment.time_remaining && (
                        <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-black font-mono text-white tracking-widest">{environment.time_remaining}</span>
                        </div>
                    )}
                    <button 
                         onClick={() => { localStorage.removeItem('student_session'); navigate('/'); }}
                         className="flex items-center gap-2 group px-4 py-2 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20"
                    >
                        <LogOut className="w-4 h-4 text-[#94a3b8] group-hover:text-red-500 transition-colors" />
                        <span className="text-[10px] font-black text-[#94a3b8] group-hover:text-white uppercase tracking-widest">End Session</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* VM Sidebar - High Information Density */}
                <aside className="w-80 bg-[#0a0a0a] border-r border-white/5 flex flex-col shrink-0">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[10px] text-[#475569] font-black uppercase tracking-[0.2em]">Lab Infrastructure</p>
                            <Activity className="w-3 h-3 text-blue-500 animate-pulse" />
                        </div>
                        
                        <div className="space-y-3">
                            {environment.vms.map(vm => (
                                <button
                                    key={vm.id}
                                    onClick={() => setSelectedVm(vm)}
                                    className={clsx(
                                        "w-full text-left group relative p-4 rounded-2xl transition-all duration-300 border",
                                        selectedVm?.id === vm.id 
                                            ? "bg-blue-600/10 border-blue-500/30 text-white shadow-[0_0_20px_rgba(37,99,235,0.1)] ring-1 ring-blue-500/20" 
                                            : "bg-[#0f0f0f] border-white/5 text-[#94a3b8] hover:border-white/10 hover:bg-[#141414]"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={clsx(
                                            "relative w-3 h-3 rounded-full shadow-lg",
                                            vm.status === 'poweredOn' 
                                                ? "bg-emerald-500 shadow-emerald-500/20" 
                                                : "bg-[#1e293b] shadow-inner"
                                        )}>
                                            {vm.status === 'poweredOn' && (
                                                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50"></span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={clsx(
                                                "text-xs font-black truncate uppercase tracking-tight",
                                                selectedVm?.id === vm.id ? "text-white" : "group-hover:text-[#e2e8f0]"
                                            )}>
                                                {vm.name}
                                            </p>
                                            <p className="text-[9px] text-[#475569] font-mono mt-1 font-bold">
                                                {vm.ip_address || 'SYNCING...'}
                                            </p>
                                        </div>
                                        <ChevronRight className={clsx(
                                            "w-4 h-4 transition-all duration-300 transform",
                                            selectedVm?.id === vm.id ? "translate-x-0 opacity-100 text-blue-500" : "-translate-x-2 opacity-0"
                                        )} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                        {selectedVm && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-500">
                                {/* Advanced Controls */}
                                <div className="space-y-3">
                                    <p className="text-[10px] text-[#475569] font-black uppercase tracking-[0.2em]">Management</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button 
                                            onClick={() => handleVmAction('revert')}
                                            disabled={!!actionLoading}
                                            className="group flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#0f0f0f] border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <RefreshCw className="w-5 h-5 text-blue-500" />
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] group-hover:text-blue-500 transition-colors">Revert</span>
                                        </button>
                                        
                                        <button 
                                            onClick={() => handleVmAction(selectedVm.status === 'poweredOn' ? 'stop' : 'start')}
                                            disabled={!!actionLoading}
                                            className={clsx(
                                                "group flex flex-col items-center gap-2 p-4 rounded-2xl transition-all border",
                                                selectedVm.status === 'poweredOn'
                                                    ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40"
                                                    : "bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform",
                                                selectedVm.status === 'poweredOn' ? "bg-red-500/10" : "bg-emerald-500/10"
                                            )}>
                                                <Power className={clsx("w-5 h-5", selectedVm.status === 'poweredOn' ? "text-red-500" : "text-emerald-500")} />
                                            </div>
                                            <span className={clsx(
                                                "text-[9px] font-black uppercase tracking-widest",
                                                selectedVm.status === 'poweredOn' ? "text-red-500/70 group-hover:text-red-500" : "text-emerald-500/70 group-hover:text-emerald-500"
                                            )}>
                                                {actionLoading ? '...' : (selectedVm.status === 'poweredOn' ? 'Power Off' : 'Power On')}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* VM Specs */}
                                <div className="p-5 bg-gradient-to-br from-[#0f0f0f] to-[#070707] border border-white/5 rounded-2xl space-y-4">
                                    <div className="flex items-center gap-2 text-white">
                                        <Shield className="w-4 h-4 text-blue-500" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.15em]">System details</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Cpu className="w-3.5 h-3.5 text-[#475569]" />
                                                <span className="text-[10px] font-bold text-[#475569] uppercase">Role</span>
                                            </div>
                                            <span className="text-[11px] font-black text-white">{selectedVm.role || 'GUEST'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <HardDrive className="w-3.5 h-3.5 text-[#475569]" />
                                                <span className="text-[10px] font-bold text-[#475569] uppercase">Platform</span>
                                            </div>
                                            <span className="text-[11px] font-black text-white">{selectedVm.os_type || 'STANDARD'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Console Area */}
                <main className="flex-1 bg-black flex flex-col overflow-hidden relative">
                    {/* Console Header/Toolbar */}
                    <div className="h-10 bg-[#0a0a0a] border-b border-white/5 flex items-center px-4 justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <Terminal className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-[10px] font-black text-[#94a3b8] uppercase tracking-[0.2em]">
                                {selectedVm ? `${selectedVm.name} Connection` : 'Select terminal'}
                            </span>
                        </div>
                        {selectedVm && consoleUrl && (
                            <div className="flex items-center gap-2">
                                <button className="p-1 px-2 text-[9px] font-black text-blue-500 hover:text-white transition-colors uppercase tracking-widest border border-blue-500/20 rounded hover:bg-blue-600/10">
                                    Adaptive DPI
                                </button>
                                <div className="w-[1px] h-3 bg-white/10 mx-1" />
                                <button 
                                    onClick={() => window.open(consoleUrl, '_blank')}
                                    className="flex items-center gap-2 text-[9px] font-black p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-all shadow-lg shadow-blue-500/20"
                                >
                                    <Maximize2 className="w-3 h-3" />
                                    <span className="tracking-widest capitalize">POP-OUT</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Console Content Area */}
                    <div className="flex-1 bg-[#050505] relative overflow-hidden">
                        {isProvisioning ? (
                             <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                                <div className="mb-8 relative">
                                    <div className="absolute inset-0 bg-blue-500/20 blur-3xl animate-pulse rounded-full" />
                                    <div className="w-24 h-24 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin relative" />
                                    <Activity className="absolute inset-0 m-auto w-8 h-8 text-blue-500 animate-pulse" />
                                </div>
                                <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Provisioning Lab...</h3>
                                <p className="text-sm text-[#94a3b8] font-medium max-w-sm">We are preparing your dedicated environment on the cloud infrastructure. This usually takes 1-2 minutes.</p>
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
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                                        <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Negotiating Console...</p>
                                    </div>
                                )
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-8">
                                    <div className="relative group">
                                        <div className="absolute inset-0 bg-emerald-500/20 group-hover:bg-emerald-500/30 blur-3xl animate-pulse rounded-full transition-colors" />
                                        <div className="p-8 bg-[#0a0a0a] rounded-[2rem] border border-white/5 shadow-2xl relative transition-transform group-hover:scale-105 duration-500">
                                            <Power className="w-16 h-16 text-emerald-500 opacity-20 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <h3 className="text-2xl font-black text-white uppercase tracking-tight">System Offline</h3>
                                        <p className="text-sm text-[#94a3b8] font-medium max-w-sm">The selected machine is currently powered off. Start it to begin your training session.</p>
                                    </div>
                                    <button 
                                        onClick={() => handleVmAction('start')}
                                        disabled={!!actionLoading}
                                        className="px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 flex items-center gap-3"
                                    >
                                        <Power className="w-5 h-5" />
                                        Wake Environment
                                    </button>
                                </div>
                            )
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#475569] p-8 text-center">
                                <div className="p-8 bg-[#0a0a0a] rounded-[2rem] border border-white/5 border-dashed mb-6">
                                    <LayoutGrid className="w-16 h-16 opacity-10" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em]">Selection Required</p>
                                <p className="text-[11px] font-bold mt-2 opacity-50">Choose a terminal from the sidebar to establish a connection</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default StudentClassViewer;
