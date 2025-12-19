import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Monitor, Play, Square, RotateCcw, Power, LayoutGrid, 
    Settings, Maximize2, Terminal, Info, ChevronRight, AlertCircle,
    Copy, ExternalLink, ShieldCheck, User, Server
} from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

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

    const [environment, setEnvironment] = useState<Environment | null>(null);
    const [selectedVm, setSelectedVm] = useState<VM | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'console' | 'details'>('console');

    const fetchEnvironment = async () => {
        try {
            // If guest, we might need a different endpoint or handle it in the standard one
            const res = await api.get(`/classes/${classId}/environments`);
            // Scoping: In a real app, the backend should only return one env for the user/guest.
            // For now, we take the first unassigned one or the one assigned to us.
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
            }
        } catch (err) {
            showToast('Failed to load environment', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchEnvironment();
        const interval = setInterval(fetchEnvironment, 30000); // refresh states every 30s
        return () => clearInterval(interval);
    }, [classId]);

    const handleVmAction = async (action: string, vmId?: number) => {
        const targetVmId = vmId || selectedVm?.id;
        if (!targetVmId) return;

        try {
            await api.post(`/classes/environments/${classId}/vms/${targetVmId}/power`, { action });
            showToast(`Task '${action}' started`, 'success');
            // Optimistic update or wait for refresh
            fetchEnvironment();
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Action failed', 'error');
        } finally {
        }
    };

    const handleBulkAction = async (action: string) => {
        if (!environment) return;
        if (!window.confirm(`Apply '${action}' to ALL machines in this environment?`)) return;

        try {
            await api.post(`/classes/environments/${environment.id}/power`, { action });
            showToast(`Bulk ${action} initialized`, 'success');
            fetchEnvironment();
        } catch (err: any) {
            showToast('Bulk action failed', 'error');
        } finally {
        }
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
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-white">No Environment Found</h2>
                        <p className="text-slate-400 mt-2">You don't have an environment assigned for this class. Please contact your instructor.</p>
                    </div>
                    <button onClick={() => navigate('/')} className="text-indigo-400 hover:text-white transition-colors">Go Back</button>
                </div>
            </div>
        );
    }

    const getAuthToken = () => {
        const userToken = localStorage.getItem('token');
        console.log('[ClassView] getAuthToken: userToken from localStorage =', userToken);
        if (userToken) return userToken;
        
        const guestToken = sessionStorage.getItem(`guest_token_${classId}`);
        console.log('[ClassView] getAuthToken: guestToken from sessionStorage =', guestToken);
        if (guestToken) return `guest-${guestToken}`;
        
        console.warn('[ClassView] getAuthToken: NO TOKEN FOUND - authentication will fail');
        return '';
    };

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden">
            {/* Top Navigation / Header */}
            <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-20 shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                        <Monitor className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold leading-none">{environment.name}</h1>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-bold">Training Classroom</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="hidden md:flex items-center gap-4 mr-6 pr-6 border-r border-slate-800">
                        <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                            <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-[10px] text-green-400 font-bold uppercase">Connected</span>
                        </div>
                    </div>
                    
                    <div className="relative group">
                        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all text-sm font-semibold shadow-lg shadow-indigo-500/10">
                            <Power className="w-4 h-4" />
                            Environment Control
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all z-30 overflow-hidden">
                            <div className="p-2 space-y-1">
                                <button onClick={() => handleBulkAction('start')} className="w-full text-left px-4 py-3 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-lg flex items-center gap-3 transition-colors">
                                    <Play className="w-4 h-4 text-green-500" />
                                    <span>Start All VMs</span>
                                </button>
                                <button onClick={() => handleBulkAction('stop')} className="w-full text-left px-4 py-3 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-lg flex items-center gap-3 transition-colors">
                                    <Square className="w-4 h-4 text-red-500" />
                                    <span>Stop All VMs</span>
                                </button>
                                <button onClick={() => handleBulkAction('reset')} className="w-full text-left px-4 py-3 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-lg flex items-center gap-3 transition-colors">
                                    <RotateCcw className="w-4 h-4 text-amber-500" />
                                    <span>Restart All VMs</span>
                                </button>
                                <div className="border-t border-slate-700 my-1"></div>
                                <button 
                                    onClick={() => {
                                        if (window.confirm('Revert all machines to initial state? This cannot be undone.')) {
                                             api.post(`/classes/environments/${environment.id}/revert`).then(() => showToast('Reverting initialized', 'success'));
                                        }
                                    }}
                                    className="w-full text-left px-4 py-3 hover:bg-red-500/10 text-red-400 rounded-lg flex items-center gap-3 transition-colors"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    <span>Revert Environment</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* VM Sidebar Tabs */}
                <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">Your Machines</p>
                        <div className="space-y-1">
                            {environment.vms.map(vm => (
                                <button
                                    key={vm.id}
                                    onClick={() => setSelectedVm(vm)}
                                    className={`w-full group relative flex items-center gap-3 p-3 rounded-xl transition-all ${
                                        selectedVm?.id === vm.id 
                                            ? 'bg-indigo-600/10 border border-indigo-500/30 text-white shadow-inner' 
                                            : 'text-slate-400 hover:bg-slate-800 border border-transparent'
                                    }`}
                                >
                                    <div className={`w-2 h-2 rounded-full shadow-lg ${vm.power_state === 'poweredOn' ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'}`} />
                                    <div className="flex-1 text-left min-w-0">
                                        <p className={`text-sm font-semibold truncate ${selectedVm?.id === vm.id ? 'text-indigo-300' : 'group-hover:text-slate-200'}`}>
                                            {vm.name}
                                        </p>
                                        <p className="text-[10px] text-slate-500 truncate font-mono">
                                            {vm.ip_address || 'Connecting...'}
                                        </p>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedVm?.id === vm.id ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} />
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex-1 p-4 overflow-y-auto space-y-6">
                        {selectedVm && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                <div className="space-y-2">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Selected VM Actions</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => handleVmAction(selectedVm.power_state === 'poweredOn' ? 'stop' : 'start')}
                                            className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                                                selectedVm.power_state === 'poweredOn' 
                                                    ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20' 
                                                    : 'bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500/20'
                                            }`}
                                        >
                                            <Power className="w-4 h-4" />
                                            <span className="text-xs font-bold">{selectedVm.power_state === 'poweredOn' ? 'Stop' : 'Start'}</span>
                                        </button>
                                        <button 
                                            onClick={() => handleVmAction('reset')}
                                            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all font-bold"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            <span className="text-xs">Restart</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <Info className="w-4 h-4 text-indigo-400" />
                                        <span className="text-xs font-bold">VM Details</span>
                                    </div>
                                    <div className="space-y-2 text-[10px]">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Operating System</span>
                                            <span className="font-mono text-sm text-slate-300">{selectedVm.guest_os || 'Unknown'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Status</span>
                                            <span className={`px-2 py-0.5 rounded ${selectedVm.power_state === 'poweredOn' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {selectedVm.power_state}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center group">
                                            <span className="text-slate-500">IP Address</span>
                                            <div className="flex items-center gap-1">
                                                <span className="text-indigo-400 font-mono">{selectedVm.ip_address || '---'}</span>
                                                {selectedVm.ip_address && <Copy className="w-3 h-3 text-slate-500 cursor-pointer hover:text-indigo-400" />}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-slate-900 border-t border-slate-800">
                        <div className="flex items-center gap-3 text-slate-400">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                                <User className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-200 truncate">{user?.name || 'Guest User'}</p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-tighter">Student Seat</p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Console Area */}
                <main className="flex-1 bg-black flex flex-col overflow-hidden relative group/main">
                    {/* View Actions Overlay */}
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-2 opacity-0 group-hover/main:opacity-100 transition-opacity">
                        <button 
                            className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-2 text-slate-300 hover:text-white rounded-lg transition-all"
                            onClick={() => window.open(`/api/classes/environments/${classId}/vms/${selectedVm?.id}/console?token=${getAuthToken()}`, '_blank')}
                            title="Open in New Window"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </button>
                        <button className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-2 text-slate-300 hover:text-white rounded-lg transition-all">
                            <Maximize2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Console Iframe */}
                    {selectedVm ? (
                        <div className="flex-1 flex flex-col">
                            {/* Toolbar */}
                            <div className="h-10 bg-slate-800/80 border-b border-slate-700 flex items-center px-4 justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <Terminal className="w-4 h-4 text-indigo-400" />
                                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{selectedVm.name} Console</span>
                                    </div>
                                    <div className="flex items-center gap-1 border-l border-slate-700 pl-6 space-x-2">
                                        <button 
                                            className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${activeTab === 'console' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                            onClick={() => setActiveTab('console')}
                                        >
                                            CONSOLE
                                        </button>
                                        <button 
                                            className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${activeTab === 'details' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                            onClick={() => setActiveTab('details')}
                                        >
                                            INFO
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {activeTab === 'console' ? (
                                <div className="flex-1 bg-[#1a1a2e] relative group">
                                    {selectedVm.power_state === 'poweredOn' ? (
                                        <iframe 
                                            src={`/api/classes/environments/${classId}/vms/${selectedVm.id}/console?token=${getAuthToken()}`}
                                            className="w-full h-full border-0"
                                            title="VM Console"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/40 backdrop-blur-sm z-10 transition-all">
                                            <div className="p-4 bg-slate-800 rounded-full border border-slate-700 shadow-xl">
                                                <Power className="w-8 h-8 text-slate-600" />
                                            </div>
                                            <p className="text-slate-400 font-medium">VM is powered off</p>
                                            <button 
                                                onClick={() => handleVmAction('start')}
                                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                                            >
                                                Power On
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex-1 bg-slate-900 p-8">
                                    <div className="max-w-4xl mx-auto space-y-8">
                                        <h2 className="text-2xl font-bold text-white mb-6">Diagnostic Overview</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="card p-6 border-indigo-500/20 bg-indigo-500/5">
                                                <h3 className="text-indigo-400 font-bold mb-4 flex items-center gap-2">
                                                    <Server className="w-4 h-4" />
                                                    VM Identity
                                                </h3>
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Internal MOID</label>
                                                        <p className="font-mono text-sm text-slate-300">{selectedVm.moid}</p>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Network Context</label>
                                                        <p className="font-mono text-sm text-slate-300">{selectedVm.ip_address || 'Not Assigned'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="card p-6 border-slate-700 bg-slate-800/30">
                                                <h3 className="text-slate-300 font-bold mb-4 flex items-center gap-2">
                                                    <Settings className="w-4 h-4" />
                                                    Configuration
                                                </h3>
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Power Status</label>
                                                        <p className="text-sm font-bold text-green-400 uppercase">{selectedVm.power_state}</p>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Guest Services</label>
                                                        <p className="text-sm text-slate-300">VMware Tools Installed</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                             <LayoutGrid className="w-16 h-16 mb-4 opacity-20" />
                             <p>Select a VM to open console</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default ClassView;
