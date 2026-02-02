import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Monitor, Play, Square, RotateCcw, Power, AlertCircle,
    Copy, ExternalLink, Server, Clock, Wifi, WifiOff, 
    RefreshCw, LogOut, ChevronDown, ChevronRight, Pause, 
    HardDrive, Cpu, Globe, Download, Info
} from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import clsx from 'clsx';

interface VM {
    id: number;
    name: string;
    vm_name?: string;
    moid: string;
    vm_moid?: string;
    ip_address?: string;
    power_state: string;
    access_url?: string;
    guest_os?: string;
    cpu?: number;
    memory_mb?: number;
    disk_gb?: number;
}

interface Environment {
    id: number;
    name: string;
    user_id?: number;
    vms: VM[];
}

const ClassView: React.FC = () => {
    const { classId } = useParams<{ classId: string }>();
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const consoleRef = useRef<HTMLIFrameElement>(null);

    const [environment, setEnvironment] = useState<Environment | null>(null);
    const [selectedVm, setSelectedVm] = useState<VM | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [sessionTime, setSessionTime] = useState(0);
    const [isConnected, setIsConnected] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [expandedVms, setExpandedVms] = useState<Set<number>>(new Set());
    
    const selectedVmIdRef = useRef<number | null>(null);

    const selectVm = useCallback((vm: VM | null) => {
        selectedVmIdRef.current = vm?.id ?? null;
        setSelectedVm(vm);
    }, []);

    const fetchEnvironment = useCallback(async () => {
        try {
            const res = await api.get(`/classes/${classId}/environments`);
            const guestToken = sessionStorage.getItem(`guest_token_${classId}`);
            
            let matchedEnv = null;
            if (guestToken) {
                const decoded = atob(guestToken);
                const [, eid] = decoded.split(':');
                matchedEnv = res.data.find((e: Environment) => e.id === parseInt(eid));
            } else {
                matchedEnv = res.data.find((e: Environment) => e.user_id === user?.id) || res.data[0];
            }

            if (matchedEnv) {
                setEnvironment(matchedEnv);
                const currentSelectedId = selectedVmIdRef.current;
                
                if (currentSelectedId === null && matchedEnv.vms.length > 0) {
                    selectVm(matchedEnv.vms[0]);
                } else if (currentSelectedId !== null) {
                    const freshVm = matchedEnv.vms.find((vm: VM) => vm.id === currentSelectedId);
                    if (freshVm) setSelectedVm(freshVm);
                }
                setIsConnected(true);
            }
        } catch {
            showToast('Failed to load environment', 'error');
            setIsConnected(false);
        } finally {
            setIsLoading(false);
        }
    }, [classId, user?.id, selectVm, showToast]);

    useEffect(() => {
        fetchEnvironment();
        const interval = setInterval(fetchEnvironment, 30000);
        return () => clearInterval(interval);
    }, [fetchEnvironment]);

    useEffect(() => {
        const timer = setInterval(() => setSessionTime(t => t + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const handleVmAction = async (action: string, vmId?: number) => {
        const targetVmId = vmId || selectedVm?.id;
        if (!targetVmId) return;

        setActionLoading(`${action}-${targetVmId}`);
        try {
            await api.post(`/classes/environments/${classId}/vms/${targetVmId}/power`, { action });
            showToast(`${action} initiated`, 'success');
            setTimeout(fetchEnvironment, 2000);
        } catch (err: unknown) {
            const errorMessage = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Action failed';
            showToast(errorMessage, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRevert = async (vmId?: number) => {
        if (!environment) return;
        if (!window.confirm('Revert VM to initial snapshot? This cannot be undone.')) return;
        setActionLoading(vmId ? `revert-${vmId}` : 'bulk-revert');
        try {
            if (vmId) {
                await api.post(`/classes/environments/${classId}/vms/${vmId}/revert`);
            } else {
                await api.post(`/classes/environments/${environment.id}/revert`);
            }
            showToast('Revert initiated', 'success');
            setTimeout(fetchEnvironment, 2000);
        } catch {
            showToast('Revert failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const sendCtrlAltDel = () => {
        if (consoleRef.current?.contentWindow) {
            consoleRef.current.contentWindow.postMessage({ type: 'send-ctrl-alt-del' }, '*');
            showToast('Sent Ctrl+Alt+Del', 'info');
        }
    };

    const handleEndSession = () => {
        if (window.confirm('End your session?')) navigate('/');
    };

    const toggleVmExpanded = (vmId: number) => {
        setExpandedVms(prev => {
            const next = new Set(prev);
            if (next.has(vmId)) {
                next.delete(vmId);
            } else {
                next.add(vmId);
            }
            return next;
        });
    };

    const formatTime = (s: number) => {
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    // Format VM name for display (replace underscores with spaces)
    const formatVmName = (name: string) => name.replace(/_/g, ' ');

    const getAuthToken = () => {
        const t = localStorage.getItem('token');
        if (t) return t;
        const g = sessionStorage.getItem(`guest_token_${classId}`);
        return g ? `guest-${g}` : '';
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        showToast(`${label} copied`, 'success');
    };

    const downloadRdp = (vm: VM) => {
        if (!vm.ip_address) return;
        const content = `full address:s:${vm.ip_address}\nprompt for credentials:i:1`;
        const blob = new Blob([content], { type: 'application/x-rdp' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${vm.name || vm.vm_name}.rdp`;
        a.click();
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-fuchsia-500 animate-spin" />
                    <span className="text-slate-400 text-sm">Loading environment...</span>
                </div>
            </div>
        );
    }

    // No environment
    if (!environment) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="text-center space-y-4">
                    <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
                    <h2 className="text-lg font-semibold text-white">No Environment Found</h2>
                    <button onClick={() => navigate('/')} className="text-sm text-fuchsia-400 hover:text-white">Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col text-sm">
            {/* TOP BAR - Compact */}
            <header className="h-10 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 shrink-0">
                <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-fuchsia-400" />
                    <span className="font-semibold text-white text-xs uppercase tracking-wide">{environment.name}</span>
                    <span className="text-[10px] text-slate-500">#{environment.id}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span className="font-mono">{formatTime(sessionTime)}</span>
                </div>
                <button onClick={handleEndSession} className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10 rounded transition-colors">
                    <LogOut className="w-3 h-3" />
                    End
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* LEFT PANEL - Compact */}
                <aside className="w-56 bg-slate-900/50 border-r border-slate-800 flex flex-col shrink-0">
                    {/* VMs List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1 py-1">
                            Virtual Machines ({environment.vms.length})
                        </div>
                        
                        {environment.vms.map(vm => {
                            const isExpanded = expandedVms.has(vm.id);
                            const isSelected = selectedVm?.id === vm.id;
                            const vmName = formatVmName(vm.name || vm.vm_name || 'VM');
                            const isPoweredOn = vm.power_state === 'poweredOn';

                            return (
                                <div key={vm.id} className="rounded overflow-hidden">
                                    {/* VM Row */}
                                    <div className={clsx(
                                        "flex items-center gap-1.5 px-1.5 py-1.5 cursor-pointer transition-all rounded",
                                        isSelected ? "bg-fuchsia-500/15" : "hover:bg-slate-800/50"
                                    )}>
                                        <button onClick={() => toggleVmExpanded(vm.id)} className="p-0.5 text-slate-500 hover:text-white">
                                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                        </button>
                                        
                                        <div onClick={() => selectVm(vm)} className="flex-1 flex items-center gap-1.5 min-w-0">
                                            <div className={clsx("w-2 h-2 rounded-full shrink-0", isPoweredOn ? "bg-green-500" : "bg-slate-600")} />
                                            <span className={clsx("text-[11px] font-medium truncate", isSelected ? "text-fuchsia-300" : "text-slate-300")}>
                                                {vmName}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {isExpanded && (
                                        <div className="bg-slate-800/30 border-l-2 border-slate-700 ml-3 px-2 py-1.5 space-y-1.5">
                                            {/* Specs Row */}
                                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-slate-400">
                                                <span className="flex items-center gap-1"><Cpu className="w-2.5 h-2.5 text-blue-400" />{vm.cpu || 2} CPU</span>
                                                <span className="flex items-center gap-1"><Server className="w-2.5 h-2.5 text-purple-400" />{vm.memory_mb ? Math.round(vm.memory_mb/1024) : 4}GB</span>
                                                <span className="flex items-center gap-1"><HardDrive className="w-2.5 h-2.5 text-amber-400" />{vm.disk_gb || 40}GB</span>
                                            </div>
                                            
                                            {/* IP */}
                                            {vm.ip_address && (
                                                <div className="flex items-center gap-1 text-[9px]">
                                                    <Globe className="w-2.5 h-2.5 text-cyan-400" />
                                                    <span className="text-slate-400 font-mono">{vm.ip_address}</span>
                                                    <button onClick={() => copyToClipboard(vm.ip_address!, 'IP')} className="ml-1 text-slate-500 hover:text-white">
                                                        <Copy className="w-2.5 h-2.5" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Power Controls */}
                                            <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-700/50">
                                                {!isPoweredOn ? (
                                                    <ActionBtn icon={Play} label="Start" color="green" loading={actionLoading === `start-${vm.id}`} onClick={() => handleVmAction('start', vm.id)} />
                                                ) : (
                                                    <>
                                                        <ActionBtn icon={Square} label="Stop" color="red" loading={actionLoading === `stop-${vm.id}`} onClick={() => handleVmAction('stop', vm.id)} />
                                                        <ActionBtn icon={RotateCcw} label="Restart" color="amber" loading={actionLoading === `reset-${vm.id}`} onClick={() => handleVmAction('reset', vm.id)} />
                                                        <ActionBtn icon={Pause} label="Suspend" color="orange" loading={actionLoading === `suspend-${vm.id}`} onClick={() => handleVmAction('suspend', vm.id)} />
                                                    </>
                                                )}
                                                <ActionBtn icon={RotateCcw} label="Revert" color="purple" loading={actionLoading === `revert-${vm.id}`} onClick={() => handleRevert(vm.id)} />
                                            </div>

                                            {/* Quick Actions */}
                                            {vm.ip_address && (
                                                <div className="flex gap-1 pt-1 border-t border-slate-700/50">
                                                    <button onClick={() => downloadRdp(vm)} className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded">
                                                        <Download className="w-2.5 h-2.5" />RDP File
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Quick Info */}
                    <div className="p-2 border-t border-slate-800 text-[9px] text-slate-500 space-y-1">
                        <div className="flex justify-between">
                            <span>Status</span>
                            <span className={isConnected ? "text-green-400" : "text-red-400"}>{isConnected ? 'Connected' : 'Disconnected'}</span>
                        </div>
                    </div>
                </aside>

                {/* MAIN CONSOLE AREA */}
                <main className="flex-1 flex flex-col bg-black overflow-hidden">
                    {/* Toolbar */}
                    {selectedVm && (
                        <div className="h-8 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between px-2 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className={clsx("w-1.5 h-1.5 rounded-full", selectedVm.power_state === 'poweredOn' ? "bg-green-500" : "bg-red-500")} />
                                <span className="text-[10px] font-medium text-slate-300">{formatVmName(selectedVm.name || selectedVm.vm_name || 'VM')}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <ToolbarBtn onClick={() => window.open(`/api/classes/environments/${classId}/vms/${selectedVm.id}/console?token=${getAuthToken()}`, '_blank')}>
                                    <ExternalLink className="w-3 h-3" />
                                </ToolbarBtn>
                                <ToolbarBtn onClick={sendCtrlAltDel} title="Ctrl+Alt+Del">CAD</ToolbarBtn>
                                <ToolbarBtn onClick={toggleFullscreen}>{isFullscreen ? 'Exit' : 'Full'}</ToolbarBtn>
                                <div className="w-px h-4 bg-slate-700 mx-1" />
                                <span className={clsx("flex items-center gap-1 text-[9px]", isConnected ? "text-green-400" : "text-red-400")}>
                                    {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Console */}
                    <div className="flex-1 relative">
                        {selectedVm ? (
                            selectedVm.power_state === 'poweredOn' ? (
                                <iframe 
                                    key={`console-${selectedVm.id}`}
                                    ref={consoleRef}
                                    src={`/api/classes/environments/${classId}/vms/${selectedVm.id}/console?token=${getAuthToken()}`}
                                    className="w-full h-full border-0"
                                    title="VM Console"
                                />
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center gap-3">
                                    <Power className="w-8 h-8 text-slate-700" />
                                    <p className="text-slate-500 text-xs">VM is powered off</p>
                                    <button 
                                        onClick={() => handleVmAction('start')}
                                        disabled={actionLoading !== null}
                                        className="px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-medium rounded flex items-center gap-1.5"
                                    >
                                        {actionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                        Power On
                                    </button>
                                </div>
                            )
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600">
                                <Info className="w-6 h-6 mb-2" />
                                <p className="text-xs">Select a VM</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

// Compact action button component
const ActionBtn: React.FC<{
    icon: React.ElementType;
    label: string;
    color: 'green' | 'red' | 'amber' | 'orange' | 'purple';
    loading?: boolean;
    onClick: () => void;
}> = ({ icon: Icon, label, color, loading, onClick }) => {
    const colors = {
        green: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
        red: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
        amber: 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
        orange: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30',
        purple: 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30',
    };
    return (
        <button onClick={onClick} disabled={loading} className={clsx("flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-medium transition-all", colors[color])}>
            {loading ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Icon className="w-2.5 h-2.5" />}
            {label}
        </button>
    );
};

// Compact toolbar button
const ToolbarBtn: React.FC<{ onClick: () => void; children: React.ReactNode; title?: string }> = ({ onClick, children, title }) => (
    <button onClick={onClick} title={title} className="px-1.5 py-0.5 text-[9px] text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors">
        {children}
    </button>
);

export default ClassView;
