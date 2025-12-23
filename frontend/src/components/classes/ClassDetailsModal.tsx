import React, { useState, useEffect } from 'react';
import { 
    Eye, Trash2, Search, Calendar, Users, Server, Play, Square, RotateCcw, Key, RefreshCw, Monitor, ChevronDown, ChevronRight, Pause 
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../Modal';

import type { ClassModel, ClassEnvironment } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';

interface ClassDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    classData: ClassModel | null;
}

const ClassDetailsModal: React.FC<ClassDetailsModalProps> = ({ isOpen, onClose, classData }) => {
    const { showToast } = useToast();
    const [environments, setEnvironments] = useState<ClassEnvironment[]>([]);
    const [loadingEnvs, setLoadingEnvs] = useState(false);
    const [envSearch, setEnvSearch] = useState('');
    const [expandedEnvId, setExpandedEnvId] = useState<number | null>(null);

    useEffect(() => {
        if (classData && isOpen) {
            fetchEnvironments(classData.id);
        }
    }, [classData, isOpen]);

    const fetchEnvironments = async (classId: number) => {
        setLoadingEnvs(true);
        try {
            const response = await api.get(`/classes/${classId}/environments`);
            setEnvironments(response.data);
        } catch (error) {
            console.error('Failed to fetch environments:', error);
            showToast('Failed to load environments', 'error');
        } finally {
            setLoadingEnvs(false);
        }
    };

    const handleEnvPower = async (envId: number, action: string) => {
        try {
            await api.post(`/classes/environments/${envId}/power`, { action });
            showToast(`Environment ${action} triggered`, 'success');
            if (classData) fetchEnvironments(classData.id);
        } catch (error) {
            console.error(`Failed to ${action} environment:`, error);
            showToast(`Failed to ${action} environment`, 'error');
        }
    };

    const handleEnvRevert = async (envId: number) => {
        if (!confirm('Are you sure you want to revert this environment? All data will be lost.')) return;
        try {
            await api.post(`/classes/environments/${envId}/revert`);
            showToast('Environment revert triggered', 'success');
            if (classData) fetchEnvironments(classData.id);
        } catch (error) {
            console.error('Failed to revert environment:', error);
            showToast('Failed to revert environment', 'error');
        }
    };

    const handleEnvDelete = async (envId: number) => {
        if (!confirm('Are you sure you want to delete this environment? This cannot be undone.')) return;
        try {
            await api.delete(`/classes/environments/${envId}`);
            showToast('Environment deleted', 'success');
            if (classData) fetchEnvironments(classData.id);
        } catch (error) {
             console.error('Failed to delete environment:', error);
             showToast('Failed to delete environment', 'error');
        }
    };

    const handlePowerControl = async (_envId: number, vmId: number, action: string) => {
        try {
            if (!classData) return;
            await api.post(`/classes/environments/${classData.id}/vms/${vmId}/power`, { action });
            showToast(`VM ${action} command sent`, 'success');
            if (classData) fetchEnvironments(classData.id);
        } catch (error) {
            console.error(`Failed to ${action} VM:`, error);
            showToast(`Failed to ${action} VM`, 'error');
        }
    };

    const handleVmRevert = async (vmId: number) => {
        if (!window.confirm("Are you sure you want to revert this VM to its initial state? All changes will be lost.")) return;
        try {
            if (!classData) return;
            await api.post(`/classes/environments/${classData.id}/vms/${vmId}/power`, { action: 'revert' });
            showToast('VM revert started', 'success');
            if (classData) fetchEnvironments(classData.id);
        } catch (error) {
            console.error('Revert failed:', error);
            showToast('Failed to revert VM', 'error');
        }
    };

    const handleVmDelete = async (vmId: number) => {
         if (!window.confirm("Danger: Are you sure you want to DELETE this VM? This cannot be undone.")) return;
         try {
             if (!classData) return;
             await api.delete(`/classes/environments/${classData.id}/vms/${vmId}`);
             showToast('VM deletion started', 'success');
             if (classData) fetchEnvironments(classData.id);
         } catch (error) {
             console.error('Delete failed:', error);
             showToast('Failed to delete VM', 'error');
         }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // Clean up VM/environment names for display
    const formatDisplayName = (name: string) => {
        return name
            .replace(/[-_]/g, ' ')  // Replace dashes and underscores with spaces
            .replace(/\s+/g, ' ')   // Collapse multiple spaces
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    const getVmStatusCounts = (env: ClassEnvironment) => {
        const on = env.vms.filter(v => v.power_state === 'poweredOn').length;
        const off = env.vms.filter(v => v.power_state === 'poweredOff').length;
        const suspended = env.vms.filter(v => v.power_state === 'suspended').length;
        return { on, off, suspended, total: env.vms.length };
    };

    const filteredEnvironments = environments.filter(env => 
        env.name.toLowerCase().includes(envSearch.toLowerCase()) || 
        (env.user_id && env.user_id.toString().includes(envSearch))
    );

    if (!classData) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={classData.name}
            icon={<Eye className="w-5 h-5 text-blue-400" />}
            maxWidth="6xl"
        >
            <div className="space-y-4">
                {/* Header Stats - Tighter */}
                <div className="flex items-center gap-4 flex-wrap pb-2 border-b border-theme/30">
                    <div className="flex items-center gap-1.5 text-xs">
                        <Key className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-secondary font-bold uppercase tracking-tighter">Key:</span>
                        <span className="font-mono font-black text-primary bg-violet-500/10 px-1.5 rounded">{classData.passcode}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-fuchsia-400" />
                        <span className="text-primary font-medium">{formatDate(classData.start_date)} - {formatDate(classData.end_date)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-black text-primary">{environments.length}</span>
                        <span className="text-secondary opacity-70">/ {classData.max_users} Enrolled</span>
                    </div>
                </div>

                {/* Search and Actions Bar - Compact */}
                <div className="flex items-center justify-between gap-3 bg-secondary/5 p-2 rounded-lg border border-theme/50">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-secondary" />
                        <input
                            type="text"
                            placeholder="Find student..."
                            value={envSearch}
                            onChange={(e) => setEnvSearch(e.target.value)}
                            className="bg-transparent border border-theme/50 rounded-md pl-8 pr-3 py-1.5 text-xs text-primary focus:ring-1 focus:ring-blue-500/50 outline-none w-full"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                            {filteredEnvironments.length} Active Environments
                        </span>
                        <button 
                            onClick={() => classData && fetchEnvironments(classData.id)}
                            className="p-1.5 hover:bg-theme-hover rounded text-secondary hover:text-primary transition-colors"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingEnvs ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Ultra-Compact Table View */}
                <div className="border border-theme rounded-lg overflow-hidden bg-elevated/30">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-secondary/10 border-b border-theme text-[10px] font-black text-secondary uppercase tracking-[0.15em]">
                        <div className="col-span-1"></div>
                        <div className="col-span-3">Identity</div>
                        <div className="col-span-2">Fleet</div>
                        <div className="col-span-2">Telemetry</div>
                        <div className="col-span-4 text-right">Operations</div>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y divide-theme/30 max-h-[45vh] overflow-y-auto custom-scrollbar">
                        {loadingEnvs ? (
                            <div className="text-center py-8 text-secondary text-xs italic">
                                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 opacity-50" />
                                Synchronizing environment state...
                            </div>
                        ) : filteredEnvironments.length === 0 ? (
                            <div className="text-center py-12">
                                <Server className="w-8 h-8 text-secondary mx-auto mb-2 opacity-20" />
                                <p className="text-xs font-bold text-secondary uppercase">No matching records</p>
                            </div>
                        ) : (
                            filteredEnvironments.map((env) => {
                                const status = getVmStatusCounts(env);
                                const isExpanded = expandedEnvId === env.id;
                                
                                return (
                                    <div key={env.id} className="transition-colors hover:bg-white/[0.02]">
                                        {/* Compact Row */}
                                        <div 
                                            className="grid grid-cols-12 gap-2 px-3 py-2 items-center cursor-pointer"
                                            onClick={() => setExpandedEnvId(isExpanded ? null : env.id)}
                                        >
                                            <div className="col-span-1">
                                                {isExpanded ? (
                                                    <ChevronDown className="w-3 h-3 text-secondary" />
                                                ) : (
                                                    <ChevronRight className="w-3 h-3 text-secondary" />
                                                )}
                                            </div>
                                            <div className="col-span-3">
                                                <div className="text-xs font-bold text-primary truncate" title={env.name}>{formatDisplayName(env.name)}</div>
                                                <div className="text-[9px] font-mono text-secondary opacity-60 uppercase">{env.user_id || 'PROVISIONING'}</div>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-[11px] font-medium text-secondary">{status.total} Node{status.total !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="col-span-2 flex items-center gap-1.5">
                                                {status.on > 0 && (
                                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" title="Active"></div>
                                                )}
                                                {status.suspended > 0 && (
                                                    <div className="w-2.5 h-2.5 rounded-full bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.4)]" title="Suspended"></div>
                                                )}
                                                {status.off > 0 && (
                                                    <div className="w-2.5 h-2.5 rounded-full bg-slate-500" title="Offline"></div>
                                                )}
                                            </div>
                                            <div className="col-span-4 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                                                <div className="flex bg-secondary/5 rounded-md p-0.5 border border-theme/30">
                                                    <button 
                                                        onClick={() => handleEnvPower(env.id, 'start')}
                                                        className="p-1 px-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded transition-colors"
                                                        title="Power On Fleet"
                                                    >
                                                        <Play className="w-3 h-3 fill-current" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleEnvPower(env.id, 'stop')}
                                                        className="p-1 px-1.5 text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
                                                        title="Shutdown Fleet"
                                                    >
                                                        <Square className="w-3 h-3 fill-current" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleEnvPower(env.id, 'suspend')}
                                                        className="p-1 px-1.5 text-fuchsia-500 hover:bg-fuchsia-500/10 rounded transition-colors"
                                                        title="Suspend Fleet"
                                                    >
                                                        <Pause className="w-3 h-3 fill-current" />
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={() => handleEnvRevert(env.id)}
                                                    className="p-1.5 text-purple-400 hover:bg-purple-500/10 rounded transition-colors"
                                                    title="Revert Architectural State"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                </button>
                                                <button 
                                                    onClick={() => handleEnvDelete(env.id)}
                                                    className="p-1.5 text-secondary hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
                                                    title="Decommission Environment"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
 
                                        {/* Expanded VM Details - Ultra Compact */}
                                        {isExpanded && (
                                            <div className="bg-white/[0.01] border-t border-theme/20 px-3 py-1.5 space-y-1">
                                                {env.vms.map((vm) => (
                                                    <div key={vm.id} className="flex items-center justify-between py-1 px-2 hover:bg-secondary/5 rounded transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${
                                                                vm.power_state === 'poweredOn' ? 'bg-emerald-500' :
                                                                vm.power_state === 'suspended' ? 'bg-fuchsia-500' :
                                                                'bg-slate-500'
                                                            }`}></div>
                                                            <div>
                                                                <span className="text-[11px] font-medium text-primary">{formatDisplayName(vm.name)}</span>
                                                                <span className="text-[9px] text-secondary ml-2 opacity-50">{vm.ip_address || 'Pending'}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-3">
                                                            <a 
                                                                href={`/api/classes/environments/${classData.id}/vms/${vm.id}/console`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-tighter flex items-center gap-1"
                                                            >
                                                                <Monitor className="w-3 h-3" />
                                                                Attach
                                                            </a>
                                                            
                                                            <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                                                                <button 
                                                                    onClick={() => handlePowerControl(env.id, vm.id, vm.power_state === 'poweredOn' ? 'stop' : 'start')}
                                                                    className={clsx(
                                                                        "p-1 rounded",
                                                                        vm.power_state === 'poweredOn' ? "text-rose-400 hover:bg-rose-500/10" : "text-emerald-400 hover:bg-emerald-500/10"
                                                                    )}
                                                                >
                                                                    {vm.power_state === 'poweredOn' ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleVmRevert(vm.id)}
                                                                    className="p-1 text-violet-400 hover:bg-violet-500/10 rounded" 
                                                                >
                                                                    <RotateCcw className="w-2.5 h-2.5" />
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleVmDelete(vm.id)}
                                                                    className="p-1 text-secondary hover:text-rose-500 hover:bg-rose-500/10 rounded" 
                                                                >
                                                                    <Trash2 className="w-2.5 h-2.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer Legend - Ultra Compact */}
                <div className="flex items-center justify-between text-[9px] font-bold text-secondary uppercase tracking-[0.1em] px-1">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Active
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-fuchsia-500"></span> Suspended
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-500"></span> Offline
                        </span>
                    </div>
                    <span className="italic opacity-50">Operational telemetry active • Click row for Node control</span>
                </div>
            </div>
        </Modal>
    );
};

export default ClassDetailsModal;
