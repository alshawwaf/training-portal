import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Monitor, Play, Square, RotateCcw, Power, 
    Maximize2, Minimize2, Terminal, AlertCircle,
    Copy, ExternalLink, User, Server, Keyboard,
    PanelLeftClose, PanelLeft, Clock, Wifi, WifiOff,
    ChevronDown, Settings2, Zap, RefreshCw, Hand
} from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import clsx from 'clsx';

interface VM {
    id: number;
    name: string;
    moid: string;
    ip_address?: string;
    power_state: string;
    access_url?: string;
    guest_os?: string;
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
    const [showLeftPanel, setShowLeftPanel] = useState(true);
    const [displayScale, setDisplayScale] = useState<'fit' | '100' | '125'>('fit');
    const [sessionTime, setSessionTime] = useState(0);
    const [isConnected, setIsConnected] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

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
                if (!selectedVm && matchedEnv.vms.length > 0) {
                    setSelectedVm(matchedEnv.vms[0]);
                }
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

    // Session timer
    useEffect(() => {
        const timer = setInterval(() => setSessionTime(t => t + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    // Fullscreen handling
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

        setActionLoading(action);
        try {
            await api.post(`/classes/environments/${classId}/vms/${targetVmId}/power`, { action });
            showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} initiated`, 'success');
            fetchEnvironment();
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Action failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleBulkAction = async (action: string) => {
        if (!environment) return;
        setActionLoading(action);
        try {
            await api.post(`/classes/environments/${environment.id}/power`, { action });
            showToast(`Bulk ${action} initiated`, 'success');
            fetchEnvironment();
        } catch (err: any) {
            showToast('Bulk action failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRevert = async () => {
        if (!environment) return;
        if (!window.confirm('Revert all machines to initial state? This cannot be undone.')) return;
        setActionLoading('revert');
        try {
            await api.post(`/classes/environments/${environment.id}/revert`);
            showToast('Revert initiated', 'success');
            fetchEnvironment();
        } catch {
            showToast('Revert failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const sendCtrlAltDel = () => {
        // Post message to iframe for Ctrl+Alt+Del
        if (consoleRef.current?.contentWindow) {
            consoleRef.current.contentWindow.postMessage({ type: 'send-ctrl-alt-del' }, '*');
            showToast('Sent Ctrl+Alt+Del', 'info');
        }
    };

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getAuthToken = () => {
        const userToken = localStorage.getItem('token');
        if (userToken) return userToken;
        const guestToken = sessionStorage.getItem(`guest_token_${classId}`);
        if (guestToken) return `guest-${guestToken}`;
        return '';
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
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
                    <button onClick={() => navigate('/')} className="text-indigo-400 hover:text-white transition-colors">Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
            {/* ===== TOP BAR: VM Tabs ===== */}
            <header className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-2 shrink-0 z-20">
                {/* Logo/Title */}
                <div className="flex items-center gap-2 px-3 border-r border-slate-800 h-full">
                    <Monitor className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-bold text-white hidden sm:inline">{environment.name}</span>
                </div>

                {/* VM Tabs */}
                <div className="flex-1 flex items-center gap-1 px-2 overflow-x-auto scrollbar-hide">
                    {environment.vms.map(vm => (
                        <button
                            key={vm.id}
                            onClick={() => setSelectedVm(vm)}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shrink-0",
                                selectedVm?.id === vm.id
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                            )}
                        >
                            <div className={clsx(
                                "w-2 h-2 rounded-full",
                                vm.power_state === 'poweredOn' ? "bg-green-500" : "bg-red-500"
                            )} />
                            <span className="max-w-[120px] truncate">{vm.name}</span>
                        </button>
                    ))}
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-1 px-2 border-l border-slate-800 h-full">
                    {/* Connection Status */}
                    <div className={clsx(
                        "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase",
                        isConnected ? "text-green-400" : "text-red-400"
                    )}>
                        {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        <span className="hidden sm:inline">{isConnected ? 'Connected' : 'Disconnected'}</span>
                    </div>

                    {/* Session Timer */}
                    <div className="flex items-center gap-1.5 px-2 py-1 text-slate-400 text-xs font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(sessionTime)}</span>
                    </div>

                    {/* User */}
                    <div className="flex items-center gap-2 px-2 py-1 bg-slate-800 rounded text-xs">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-300 font-medium hidden sm:inline">{user?.name || 'Guest'}</span>
                    </div>
                </div>
            </header>

            {/* ===== TOOLBAR ===== */}
            <div className="h-10 bg-slate-800/80 border-b border-slate-700 flex items-center px-3 justify-between shrink-0">
                <div className="flex items-center gap-2">
                    {/* Toggle Panel */}
                    <button
                        onClick={() => setShowLeftPanel(!showLeftPanel)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        title={showLeftPanel ? "Hide Panel" : "Show Panel"}
                    >
                        {showLeftPanel ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
                    </button>

                    <div className="w-px h-5 bg-slate-700" />

                    {/* VM Actions */}
                    {selectedVm && (
                        <>
                            <button
                                onClick={() => handleVmAction(selectedVm.power_state === 'poweredOn' ? 'stop' : 'start')}
                                disabled={actionLoading !== null}
                                className={clsx(
                                    "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all",
                                    selectedVm.power_state === 'poweredOn'
                                        ? "text-red-400 hover:bg-red-500/10"
                                        : "text-green-400 hover:bg-green-500/10"
                                )}
                            >
                                {actionLoading === 'start' || actionLoading === 'stop' 
                                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    : <Power className="w-3.5 h-3.5" />
                                }
                                {selectedVm.power_state === 'poweredOn' ? 'Stop' : 'Start'}
                            </button>
                            <button
                                onClick={() => handleVmAction('reset')}
                                disabled={actionLoading !== null}
                                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-all"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Restart
                            </button>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Ctrl+Alt+Del */}
                    <button
                        onClick={sendCtrlAltDel}
                        className="flex items-center gap-1.5 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium text-slate-300 transition-all"
                        title="Send Ctrl+Alt+Del"
                    >
                        <Keyboard className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Ctrl+Alt+Del</span>
                    </button>

                    {/* Display Scale */}
                    <div className="flex items-center bg-slate-700 rounded overflow-hidden">
                        {(['fit', '100', '125'] as const).map(scale => (
                            <button
                                key={scale}
                                onClick={() => setDisplayScale(scale)}
                                className={clsx(
                                    "px-2 py-1 text-[10px] font-bold transition-colors",
                                    displayScale === scale
                                        ? "bg-indigo-600 text-white"
                                        : "text-slate-400 hover:text-white"
                                )}
                            >
                                {scale === 'fit' ? 'Fit' : `${scale}%`}
                            </button>
                        ))}
                    </div>

                    {/* Fullscreen */}
                    <button
                        onClick={toggleFullscreen}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>

                    {/* Open in New Window */}
                    <button
                        onClick={() => window.open(`/api/classes/environments/${classId}/vms/${selectedVm?.id}/console?token=${getAuthToken()}`, '_blank')}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        title="Open in New Window"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* ===== LEFT PANEL ===== */}
                {showLeftPanel && (
                    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 animate-in slide-in-from-left-2 duration-200">
                        {/* Overview */}
                        <div className="p-3 border-b border-slate-800">
                            <div className="flex items-center gap-2 mb-3">
                                <Server className="w-4 h-4 text-indigo-400" />
                                <span className="text-xs font-bold text-white uppercase tracking-wide">Overview</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-800/50 rounded-lg p-2">
                                    <div className="text-[10px] text-slate-500 uppercase">VMs</div>
                                    <div className="text-lg font-bold text-white">{environment.vms.length}</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-2">
                                    <div className="text-[10px] text-slate-500 uppercase">Online</div>
                                    <div className="text-lg font-bold text-green-400">
                                        {environment.vms.filter(v => v.power_state === 'poweredOn').length}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Selected VM Details */}
                        {selectedVm && (
                            <div className="p-3 border-b border-slate-800 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-indigo-400" />
                                    <span className="text-xs font-bold text-white uppercase tracking-wide">VM Details</span>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Name</span>
                                        <span className="text-slate-200 font-medium truncate ml-2">{selectedVm.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Status</span>
                                        <span className={clsx(
                                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                            selectedVm.power_state === 'poweredOn' 
                                                ? "bg-green-500/20 text-green-400" 
                                                : "bg-red-500/20 text-red-400"
                                        )}>
                                            {selectedVm.power_state === 'poweredOn' ? 'Online' : 'Offline'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500">IP Address</span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-indigo-400 font-mono text-[11px]">{selectedVm.ip_address || '—'}</span>
                                            {selectedVm.ip_address && (
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(selectedVm.ip_address!);
                                                        showToast('IP copied', 'success');
                                                    }}
                                                    className="text-slate-500 hover:text-indigo-400"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">OS</span>
                                        <span className="text-slate-300 text-[11px]">{selectedVm.guest_os || 'Unknown'}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Quick Actions */}
                        <div className="p-3 flex-1">
                            <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-amber-400" />
                                <span className="text-xs font-bold text-white uppercase tracking-wide">Quick Actions</span>
                            </div>
                            <div className="space-y-1">
                                <button
                                    onClick={() => handleBulkAction('start')}
                                    disabled={actionLoading !== null}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    <Play className="w-3.5 h-3.5 text-green-400" />
                                    Start All VMs
                                </button>
                                <button
                                    onClick={() => handleBulkAction('stop')}
                                    disabled={actionLoading !== null}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    <Square className="w-3.5 h-3.5 text-red-400" />
                                    Stop All VMs
                                </button>
                                <button
                                    onClick={handleRevert}
                                    disabled={actionLoading !== null}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Revert to Snapshot
                                </button>
                            </div>
                        </div>

                        {/* Help */}
                        <div className="p-3 border-t border-slate-800">
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors">
                                <Hand className="w-3.5 h-3.5" />
                                Request Assistance
                            </button>
                        </div>
                    </aside>
                )}

                {/* ===== MAIN CONSOLE AREA ===== */}
                <main className="flex-1 bg-black flex flex-col overflow-hidden relative">
                    {selectedVm ? (
                        selectedVm.power_state === 'poweredOn' ? (
                            <iframe 
                                ref={consoleRef}
                                src={`/api/classes/environments/${classId}/vms/${selectedVm.id}/console?token=${getAuthToken()}`}
                                className={clsx(
                                    "w-full h-full border-0",
                                    displayScale === 'fit' && "object-contain",
                                    displayScale === '100' && "scale-100 origin-top-left",
                                    displayScale === '125' && "scale-125 origin-top-left"
                                )}
                                title="VM Console"
                            />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 to-slate-950">
                                <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
                                    <Power className="w-12 h-12 text-slate-600" />
                                </div>
                                <div className="text-center">
                                    <p className="text-slate-300 font-medium mb-1">VM is powered off</p>
                                    <p className="text-slate-500 text-sm">{selectedVm.name}</p>
                                </div>
                                <button 
                                    onClick={() => handleVmAction('start')}
                                    disabled={actionLoading === 'start'}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                                >
                                    {actionLoading === 'start' ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4" />
                                    )}
                                    Power On
                                </button>
                            </div>
                        )
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                            <Monitor className="w-16 h-16 mb-4 opacity-20" />
                            <p>Select a VM to open console</p>
                        </div>
                    )}
                </main>
            </div>

            {/* ===== BOTTOM STATUS BAR ===== */}
            <footer className="h-7 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-3 text-[10px] shrink-0">
                <div className="flex items-center gap-4 text-slate-500">
                    <span>Environment: <span className="text-slate-300">{environment.name}</span></span>
                    <span>VMs: <span className="text-slate-300">{environment.vms.length}</span></span>
                </div>
                <div className="flex items-center gap-4 text-slate-500">
                    <span>Session: <span className="text-slate-300 font-mono">{formatTime(sessionTime)}</span></span>
                    {selectedVm && <span>Current: <span className="text-indigo-400">{selectedVm.name}</span></span>}
                </div>
            </footer>
        </div>
    );
};

export default ClassView;
