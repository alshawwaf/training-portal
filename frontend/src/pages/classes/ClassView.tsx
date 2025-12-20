import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Monitor, Play, Square, RotateCcw, Power, 
    Maximize2, Minimize2, Terminal, AlertCircle,
    Copy, ExternalLink, User, Server, Keyboard,
    Clock, Wifi, WifiOff, Zap, RefreshCw, LogOut,
    ChevronDown, ChevronRight, Settings, Pause, HardDrive,
    Cpu, MemoryStick, Globe, Activity, Download
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

    const fetchEnvironment = async () => {
        try {
            const res = await api.get(`/classes/${classId}/environments`);
            const guestToken = sessionStorage.getItem(`guest_token_${classId}`);
            
            let matchedEnv = null;
            if (guestToken) {
                const decoded = atob(guestToken);
                const [, eid] = decoded.split(':');
                matchedEnv = res.data.find((e: any) => e.id === parseInt(eid));
            } else {
                matchedEnv = res.data.find((e: any) => e.user_id === user?.id) || res.data[0];
            }

            if (matchedEnv) {
                setEnvironment(matchedEnv);
                // Only set selectedVm on initial load, not on refresh intervals
                // Use functional update to access current state and avoid stale closure
                setSelectedVm(current => {
                    if (current === null && matchedEnv.vms.length > 0) {
                        return matchedEnv.vms[0];
                    }
                    // If current VM still exists in the updated list, keep it selected
                    // Otherwise fall back to first VM
                    if (current) {
                        const stillExists = matchedEnv.vms.find((vm: VM) => vm.id === current.id);
                        if (stillExists) {
                            return stillExists; // Update with fresh data but keep selection
                        }
                    }
                    return matchedEnv.vms[0] || null;
                });
                setIsConnected(true);
            }
        } catch (err) {
            showToast('Failed to load environment', 'error');
            setIsConnected(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchEnvironment();
        const interval = setInterval(fetchEnvironment, 30000);
        return () => clearInterval(interval);
    }, [classId]);

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
            showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} initiated`, 'success');
            setTimeout(fetchEnvironment, 2000);
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Action failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleBulkAction = async (action: string) => {
        if (!environment) return;
        setActionLoading(`bulk-${action}`);
        try {
            await api.post(`/classes/environments/${environment.id}/power`, { action });
            showToast(`Bulk ${action} initiated`, 'success');
            setTimeout(fetchEnvironment, 2000);
        } catch (err: any) {
            showToast('Bulk action failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRevert = async (vmId?: number) => {
        if (!environment) return;
        if (!window.confirm('Revert to initial state? This cannot be undone.')) return;
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
        if (window.confirm('Are you sure you want to end your session?')) {
            navigate('/');
        }
    };

    const toggleVmExpanded = (vmId: number) => {
        setExpandedVms(prev => {
            const next = new Set(prev);
            if (next.has(vmId)) next.delete(vmId);
            else next.add(vmId);
            return next;
        });
    };

    const formatTime = (seconds: number) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${seconds % 60}s`;
    };

    const getAuthToken = () => {
        const userToken = localStorage.getItem('token');
        if (userToken) return userToken;
        const guestToken = sessionStorage.getItem(`guest_token_${classId}`);
        if (guestToken) return `guest-${guestToken}`;
        return '';
    };

    const downloadRdpFile = (vm: VM) => {
        if (!vm.ip_address) return;
        const rdpContent = `full address:s:${vm.ip_address}\nprompt for credentials:i:1\nadministrative session:i:1`;
        const blob = new Blob([rdpContent], { type: 'application/x-rdp' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${vm.name || vm.vm_name}.rdp`;
        a.click();
        showToast('RDP file downloaded', 'success');
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        showToast(`${label} copied!`, 'success');
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-fuchsia-500/20 border-t-fuchsia-500 rounded-full animate-spin" />
                    <p className="text-slate-400 font-medium animate-pulse">Initializing Environment...</p>
                </div>
            </div>
        );
    }

    if (!environment) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-white">No Environment Found</h2>
                        <p className="text-slate-400 mt-2">You don't have an environment assigned for this class.</p>
                    </div>
                    <button onClick={() => navigate('/')} className="text-fuchsia-400 hover:text-white transition-colors">Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
            {/* ===== TOP HEADER BAR ===== */}
            <header className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 flex items-center justify-center">
                        <Monitor className="w-4 h-4 text-fuchsia-400" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold text-sm uppercase tracking-wide">{environment.name}</h1>
                        <span className="text-[10px] text-slate-500 uppercase">Workspace • ENV #{environment.id}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-full border border-slate-700">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-white font-mono font-bold text-xs">{formatTime(sessionTime)}</span>
                </div>

                <button
                    onClick={handleEndSession}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 rounded-lg text-red-400 text-xs font-bold uppercase tracking-wide transition-colors"
                >
                    <LogOut className="w-3.5 h-3.5" />
                    End Session
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* ===== LEFT SIDEBAR ===== */}
                <aside className="w-64 bg-slate-900/80 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
                    {/* LAB INFRASTRUCTURE */}
                    <div className="p-3 border-b border-slate-800">
                        <h2 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Lab Infrastructure</h2>
                        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                            {environment.vms.map(vm => {
                                const isExpanded = expandedVms.has(vm.id);
                                const isSelected = selectedVm?.id === vm.id;
                                const vmName = vm.name || vm.vm_name || 'VM';
                                const isPoweredOn = vm.power_state === 'poweredOn';

                                return (
                                    <div key={vm.id} className="rounded-lg overflow-hidden">
                                        {/* VM Header Row */}
                                        <div
                                            className={clsx(
                                                "flex items-center gap-2 px-2 py-2 cursor-pointer transition-all",
                                                isSelected ? "bg-fuchsia-500/20 border-l-2 border-fuchsia-500" : "hover:bg-slate-800"
                                            )}
                                        >
                                            <button
                                                onClick={() => toggleVmExpanded(vm.id)}
                                                className="p-0.5 text-slate-500 hover:text-white"
                                            >
                                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                            </button>
                                            
                                            <div
                                                onClick={() => setSelectedVm(vm)}
                                                className="flex-1 flex items-center gap-2 min-w-0"
                                            >
                                                <div className={clsx(
                                                    "w-6 h-6 rounded flex items-center justify-center shrink-0",
                                                    isSelected ? "bg-fuchsia-500" : "bg-slate-700"
                                                )}>
                                                    <Server className="w-3 h-3 text-white" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={clsx(
                                                        "text-[10px] font-bold uppercase truncate",
                                                        isSelected ? "text-fuchsia-300" : "text-white"
                                                    )}>{vmName}</p>
                                                    <p className="text-[9px] text-slate-500 truncate">{vm.ip_address || 'No IP'}</p>
                                                </div>
                                            </div>
                                            
                                            <div className={clsx(
                                                "w-2 h-2 rounded-full shrink-0",
                                                isPoweredOn ? "bg-green-500" : "bg-slate-500"
                                            )} />
                                        </div>

                                        {/* Expanded VM Details */}
                                        {isExpanded && (
                                            <div className="bg-slate-800/50 border-t border-slate-700 px-3 py-2 space-y-2 text-[10px]">
                                                {/* VM Specs */}
                                                <div className="grid grid-cols-2 gap-1">
                                                    <div className="flex items-center gap-1.5 text-slate-400">
                                                        <Cpu className="w-3 h-3 text-blue-400" />
                                                        <span>{vm.cpu || 2} vCPU</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-slate-400">
                                                        <MemoryStick className="w-3 h-3 text-purple-400" />
                                                        <span>{vm.memory_mb ? Math.round(vm.memory_mb/1024) : 4} GB RAM</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-slate-400">
                                                        <HardDrive className="w-3 h-3 text-amber-400" />
                                                        <span>{vm.disk_gb || 40} GB Disk</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-slate-400">
                                                        <Globe className="w-3 h-3 text-cyan-400" />
                                                        <span>{vm.ip_address || 'N/A'}</span>
                                                    </div>
                                                </div>

                                                {/* VM Status */}
                                                <div className="flex items-center gap-2 pt-1 border-t border-slate-700">
                                                    <Activity className={clsx("w-3 h-3", isPoweredOn ? "text-green-400" : "text-slate-500")} />
                                                    <span className={isPoweredOn ? "text-green-400" : "text-slate-500"}>
                                                        {isPoweredOn ? 'Powered On' : 'Powered Off'}
                                                    </span>
                                                </div>

                                                {/* VM Power Actions */}
                                                <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-700">
                                                    {!isPoweredOn ? (
                                                        <button
                                                            onClick={() => handleVmAction('start', vm.id)}
                                                            disabled={actionLoading !== null}
                                                            className="flex items-center gap-1 px-2 py-1 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-400 rounded text-[9px] font-bold"
                                                        >
                                                            {actionLoading === `start-${vm.id}` ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
                                                            Start
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleVmAction('stop', vm.id)}
                                                                disabled={actionLoading !== null}
                                                                className="flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[9px] font-bold"
                                                            >
                                                                {actionLoading === `stop-${vm.id}` ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Square className="w-2.5 h-2.5" />}
                                                                Stop
                                                            </button>
                                                            <button
                                                                onClick={() => handleVmAction('reset', vm.id)}
                                                                disabled={actionLoading !== null}
                                                                className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded text-[9px] font-bold"
                                                            >
                                                                {actionLoading === `reset-${vm.id}` ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <RotateCcw className="w-2.5 h-2.5" />}
                                                                Restart
                                                            </button>
                                                            <button
                                                                onClick={() => handleVmAction('suspend', vm.id)}
                                                                disabled={actionLoading !== null}
                                                                className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded text-[9px] font-bold"
                                                            >
                                                                {actionLoading === `suspend-${vm.id}` ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Pause className="w-2.5 h-2.5" />}
                                                                Suspend
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => handleRevert(vm.id)}
                                                        disabled={actionLoading !== null}
                                                        className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-[9px] font-bold"
                                                    >
                                                        {actionLoading === `revert-${vm.id}` ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <RotateCcw className="w-2.5 h-2.5" />}
                                                        Revert
                                                    </button>
                                                </div>

                                                {/* Quick Copy Actions */}
                                                {vm.ip_address && (
                                                    <div className="flex gap-1 pt-1 border-t border-slate-700">
                                                        <button
                                                            onClick={() => copyToClipboard(vm.ip_address!, 'IP')}
                                                            className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-[9px]"
                                                        >
                                                            <Copy className="w-2.5 h-2.5" /> IP
                                                        </button>
                                                        <button
                                                            onClick={() => downloadRdpFile(vm)}
                                                            className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-[9px]"
                                                        >
                                                            <Download className="w-2.5 h-2.5" /> RDP
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* MANAGEMENT - Bulk Actions */}
                    <div className="p-3 border-b border-slate-800">
                        <h2 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Management</h2>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                onClick={() => handleBulkAction('start')}
                                disabled={actionLoading !== null}
                                className="flex flex-col items-center gap-1 p-2 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-500/20 rounded-lg transition-all"
                            >
                                <Play className={clsx("w-4 h-4 text-fuchsia-400", actionLoading === 'bulk-start' && "animate-pulse")} />
                                <span className="text-[8px] font-bold text-fuchsia-400 uppercase">Start All</span>
                            </button>
                            <button
                                onClick={() => handleBulkAction('stop')}
                                disabled={actionLoading !== null}
                                className="flex flex-col items-center gap-1 p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-all"
                            >
                                <Square className={clsx("w-4 h-4 text-red-400", actionLoading === 'bulk-stop' && "animate-pulse")} />
                                <span className="text-[8px] font-bold text-red-400 uppercase">Stop All</span>
                            </button>
                            <button
                                onClick={() => handleBulkAction('reset')}
                                disabled={actionLoading !== null}
                                className="flex flex-col items-center gap-1 p-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-all"
                            >
                                <RotateCcw className={clsx("w-4 h-4 text-amber-400", actionLoading === 'bulk-reset' && "animate-pulse")} />
                                <span className="text-[8px] font-bold text-amber-400 uppercase">Restart All</span>
                            </button>
                            <button
                                onClick={() => handleRevert()}
                                disabled={actionLoading !== null}
                                className="flex flex-col items-center gap-1 p-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg transition-all"
                            >
                                <RotateCcw className={clsx("w-4 h-4 text-purple-400", actionLoading === 'bulk-revert' && "animate-pulse")} />
                                <span className="text-[8px] font-bold text-purple-400 uppercase">Revert All</span>
                            </button>
                        </div>
                    </div>

                    {/* SYSTEM DETAILS */}
                    <div className="p-3 flex-1">
                        <h2 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">System Details</h2>
                        <div className="space-y-2 text-[10px]">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 flex items-center gap-1.5"><User className="w-3 h-3" /> Role</span>
                                <span className="text-white font-medium px-1.5 py-0.5 bg-slate-800 rounded text-[9px] uppercase">Guest</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 flex items-center gap-1.5"><Settings className="w-3 h-3" /> Platform</span>
                                <span className="text-white font-medium text-[9px] uppercase">Standard</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 flex items-center gap-1.5"><Server className="w-3 h-3" /> VMs</span>
                                <span className="text-white font-medium text-[9px]">{environment.vms.length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 flex items-center gap-1.5"><Wifi className="w-3 h-3" /> Status</span>
                                <span className={clsx("font-medium text-[9px]", isConnected ? "text-green-400" : "text-red-400")}>
                                    {isConnected ? 'Connected' : 'Disconnected'}
                                </span>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* ===== MAIN CONTENT AREA ===== */}
                <main className="flex-1 flex flex-col overflow-hidden bg-black">
                    {/* Console Toolbar */}
                    {selectedVm && (
                        <div className="h-9 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <Zap className="w-3 h-3 text-fuchsia-400" />
                                <span className="text-[10px] font-bold text-white uppercase">{selectedVm.name || selectedVm.vm_name} Connection</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] text-slate-500 uppercase font-bold mr-1">Adaptive DPI</span>
                                
                                <button
                                    onClick={() => window.open(`/api/classes/environments/${classId}/vms/${selectedVm?.id}/console?token=${getAuthToken()}`, '_blank')}
                                    className="flex items-center gap-1 px-2 py-1 bg-fuchsia-500 hover:bg-fuchsia-600 rounded text-white text-[9px] font-bold uppercase transition-colors"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    Pop-out
                                </button>

                                <div className="w-px h-4 bg-slate-700" />

                                <button
                                    onClick={sendCtrlAltDel}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 text-[9px] font-medium"
                                >
                                    Ctrl+Alt+Del
                                </button>

                                <button
                                    onClick={toggleFullscreen}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 text-[9px] font-medium"
                                >
                                    {isFullscreen ? 'Exit' : 'Fullscreen'}
                                </button>

                                <div className="w-px h-4 bg-slate-700" />

                                <div className={clsx(
                                    "flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium",
                                    isConnected ? "text-green-400" : "text-red-400"
                                )}>
                                    {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                                    {isConnected ? 'Connected' : 'Disconnected'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Console View */}
                    <div className="flex-1 relative">
                        {selectedVm ? (
                            selectedVm.power_state === 'poweredOn' ? (
                                <iframe 
                                    ref={consoleRef}
                                    src={`/api/classes/environments/${classId}/vms/${selectedVm.id}/console?token=${getAuthToken()}`}
                                    className="w-full h-full border-0"
                                    title="VM Console"
                                />
                            ) : (
                                <div className="flex-1 h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 to-slate-950">
                                    <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
                                        <Power className="w-12 h-12 text-slate-600" />
                                    </div>
                                    <p className="text-slate-300 font-bold">VM is powered off</p>
                                    <p className="text-slate-500 text-sm">{selectedVm.name || selectedVm.vm_name}</p>
                                    <button 
                                        onClick={() => handleVmAction('start')}
                                        disabled={actionLoading !== null}
                                        className="px-6 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold rounded-lg transition-all flex items-center gap-2"
                                    >
                                        {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                        Power On
                                    </button>
                                </div>
                            )
                        ) : (
                            <div className="flex-1 h-full flex flex-col items-center justify-center text-slate-600">
                                <Monitor className="w-16 h-16 mb-3 opacity-20" />
                                <p>Select a VM to open console</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ClassView;
