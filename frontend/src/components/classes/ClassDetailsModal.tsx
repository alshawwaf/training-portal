import React, { useState, useEffect } from 'react';
import { 
    MoreVertical, Eye, Trash2, Search, Calendar, Users, Server, Play, Square, RotateCcw, Key, RefreshCw, Monitor, ChevronDown, ChevronRight, Pause 
} from 'lucide-react';
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
    
    // Action menu states
    const [openEnvMenuId, setOpenEnvMenuId] = useState<number | null>(null);
    const [openVmMenuId, setOpenVmMenuId] = useState<number | null>(null);

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
            setOpenEnvMenuId(null);
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
            setOpenEnvMenuId(null);
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
            setOpenEnvMenuId(null);
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
            setOpenVmMenuId(null);
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
            setOpenVmMenuId(null);
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
             setOpenVmMenuId(null);
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
            icon={<Eye className="w-6 h-6 text-blue-400" />}
            maxWidth="6xl"
        >
            <div className="space-y-6">
                {/* Compact Header Stats */}
                <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                        <Key className="w-4 h-4 text-blue-400" />
                        <span className="text-secondary">Passcode:</span>
                        <span className="font-mono font-bold text-primary">{classData.passcode}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-purple-400" />
                        <span className="text-secondary">{formatDate(classData.start_date)} - {formatDate(classData.end_date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-primary">{environments.length}</span>
                        <span className="text-secondary">/ {classData.max_users} Students</span>
                    </div>
                </div>

                {/* Search and Actions Bar */}
                <div className="flex items-center justify-between gap-4 bg-secondary/10 p-3 rounded-xl border border-theme">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-secondary" />
                        <input
                            type="text"
                            placeholder="Search by student name or ID..."
                            value={envSearch}
                            onChange={(e) => setEnvSearch(e.target.value)}
                            className="bg-elevated border border-theme rounded-lg pl-9 pr-4 py-2 text-sm text-primary focus:ring-2 focus:ring-blue-500/50 outline-none w-full"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-secondary">
                            {filteredEnvironments.length} environment{filteredEnvironments.length !== 1 ? 's' : ''}
                        </span>
                        <button 
                            onClick={() => classData && fetchEnvironments(classData.id)}
                            className="p-2 hover:bg-theme-hover rounded-lg text-secondary hover:text-primary transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingEnvs ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Compact Table View */}
                <div className="border border-theme rounded-xl overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-secondary/10 border-b border-theme text-xs font-bold text-secondary uppercase tracking-wider">
                        <div className="col-span-1"></div>
                        <div className="col-span-3">Student</div>
                        <div className="col-span-2">VMs</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-4 text-right">Quick Actions</div>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y divide-theme max-h-[50vh] overflow-y-auto">
                        {loadingEnvs ? (
                            <div className="text-center py-12 text-secondary">
                                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                                Loading environments...
                            </div>
                        ) : filteredEnvironments.length === 0 ? (
                            <div className="text-center py-12">
                                <Server className="w-10 h-10 text-secondary mx-auto mb-2" />
                                <p className="text-secondary">No environments found</p>
                            </div>
                        ) : (
                            filteredEnvironments.map((env) => {
                                const status = getVmStatusCounts(env);
                                const isExpanded = expandedEnvId === env.id;
                                
                                return (
                                    <div key={env.id} className="bg-elevated">
                                        {/* Compact Row */}
                                        <div 
                                            className="grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer hover:bg-secondary/5 transition-colors"
                                            onClick={() => setExpandedEnvId(isExpanded ? null : env.id)}
                                        >
                                            <div className="col-span-1">
                                                {isExpanded ? (
                                                    <ChevronDown className="w-4 h-4 text-secondary" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4 text-secondary" />
                                                )}
                                            </div>
                                            <div className="col-span-3">
                                                <div className="font-medium text-primary">{env.name}</div>
                                                <div className="text-xs text-secondary">ID: {env.user_id || 'Unassigned'}</div>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-sm text-primary">{status.total} VM{status.total !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="col-span-2 flex items-center gap-2">
                                                {status.on > 0 && (
                                                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                        {status.on}
                                                    </span>
                                                )}
                                                {status.off > 0 && (
                                                    <span className="flex items-center gap-1 text-xs text-red-500">
                                                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                        {status.off}
                                                    </span>
                                                )}
                                                {status.suspended > 0 && (
                                                    <span className="flex items-center gap-1 text-xs text-amber-500">
                                                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                        {status.suspended}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="col-span-4 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                                                <button 
                                                    onClick={() => handleEnvPower(env.id, 'start')}
                                                    className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded transition-colors"
                                                    title="Start All"
                                                >
                                                    <Play className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleEnvPower(env.id, 'stop')}
                                                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                                    title="Stop All"
                                                >
                                                    <Square className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleEnvPower(env.id, 'suspend')}
                                                    className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded transition-colors"
                                                    title="Suspend All"
                                                >
                                                    <Pause className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleEnvRevert(env.id)}
                                                    className="p-1.5 text-purple-500 hover:bg-purple-500/10 rounded transition-colors"
                                                    title="Revert All"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                                <div className="w-px h-4 bg-theme mx-1"></div>
                                                <button 
                                                    onClick={() => handleEnvDelete(env.id)}
                                                    className="p-1.5 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                                    title="Delete Environment"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded VM Details */}
                                        {isExpanded && (
                                            <div className="bg-secondary/5 border-t border-theme">
                                                <div className="px-4 py-2 space-y-1">
                                                    {env.vms.map((vm) => (
                                                        <div key={vm.id} className="flex items-center justify-between py-2 px-3 bg-elevated rounded-lg border border-theme/50">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-2 h-2 rounded-full ${
                                                                    vm.power_state === 'poweredOn' ? 'bg-green-500 shadow-lg shadow-green-500/50' :
                                                                    vm.power_state === 'suspended' ? 'bg-amber-500 shadow-lg shadow-amber-500/50' :
                                                                    'bg-red-500 shadow-lg shadow-red-500/50'
                                                                }`}></div>
                                                                <div>
                                                                    <div className="font-mono text-sm text-primary">{vm.name}</div>
                                                                    <div className="text-xs text-secondary">
                                                                        {vm.ip_address || 'No IP'} • {vm.power_state}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-2">
                                                                {/* Console Button */}
                                                                <a 
                                                                    href={`/api/classes/environments/${classData.id}/vms/${vm.id}/console`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1 px-2.5 py-1 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded text-xs font-medium border border-blue-500/30" 
                                                                    title="Open Console"
                                                                >
                                                                    <Monitor className="w-3.5 h-3.5" />
                                                                    Console
                                                                </a>
                                                                
                                                                {/* Power Toggle */}
                                                                {vm.power_state === 'poweredOn' ? (
                                                                    <button 
                                                                        onClick={() => handlePowerControl(env.id, vm.id, 'stop')}
                                                                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors" 
                                                                        title="Stop VM"
                                                                    >
                                                                        <Square className="w-3.5 h-3.5" />
                                                                    </button>
                                                                ) : (
                                                                    <button 
                                                                        onClick={() => handlePowerControl(env.id, vm.id, 'start')}
                                                                        className="p-1.5 text-green-500 hover:bg-green-500/10 rounded transition-colors"
                                                                        title="Start VM"
                                                                    >
                                                                        <Play className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}

                                                                {/* VM Menu */}
                                                                <div className="relative">
                                                                    <button 
                                                                        onClick={() => setOpenVmMenuId(openVmMenuId === vm.id ? null : vm.id)}
                                                                        className="p-1.5 text-secondary hover:text-primary hover:bg-theme-hover rounded transition-colors"
                                                                    >
                                                                        <MoreVertical className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    
                                                                    {openVmMenuId === vm.id && (
                                                                        <div className="absolute right-0 mt-1 w-40 bg-elevated border border-theme rounded-lg shadow-xl z-50 py-1">
                                                                            <button 
                                                                                onClick={() => handlePowerControl(env.id, vm.id, 'restart')}
                                                                                className="w-full text-left px-3 py-1.5 text-xs text-amber-500 hover:bg-theme-hover flex items-center gap-2"
                                                                            >
                                                                                <RotateCcw className="w-3.5 h-3.5" /> Restart
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => handleVmRevert(vm.id)}
                                                                                className="w-full text-left px-3 py-1.5 text-xs text-purple-500 hover:bg-theme-hover flex items-center gap-2"
                                                                            >
                                                                                <RefreshCw className="w-3.5 h-3.5" /> Revert
                                                                            </button>
                                                                            <div className="border-t border-theme my-1"></div>
                                                                            <button 
                                                                                onClick={() => handleVmDelete(vm.id)}
                                                                                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-theme-hover flex items-center gap-2"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" /> Delete
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer Legend */}
                <div className="flex items-center justify-between text-xs text-secondary pt-2 border-t border-theme">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Running
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span> Stopped
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Suspended
                        </span>
                    </div>
                    <span>Click a row to expand VM details</span>
                </div>
            </div>
        </Modal>
    );
};

export default ClassDetailsModal;
