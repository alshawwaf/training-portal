import React, { useState, useEffect } from 'react';
import { 
    MoreVertical, Eye, Trash2, Search, Calendar, Users, Server, Play, Square, RotateCcw, Key, RefreshCw 
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
            await api.post(`/environments/${envId}/revert`);
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

    const handlePowerControl = async (envId: number, vmId: number, action: string) => {
        try {
            // Note: Router expects /environments/{class_id}/vms/{vm_id}/power
            // We need classData.id here.
            if (!classData) return;
            await api.post(`/classes/environments/${classData.id}/vms/${vmId}/power`, { action });
            showToast(`VM ${action} command sent`, 'success');
            if (classData) fetchEnvironments(classData.id); // Refresh to update status
            setOpenVmMenuId(null);
        } catch (error) {
            console.error(`Failed to ${action} VM:`, error);
            showToast(`Failed to ${action} VM`, 'error');
        }
    };

    const handleVmRevert = async (vmId: number) => {
        if (!window.confirm("Are you sure you want to revert this VM to its initial state? All changes will be lost.")) return;
        
        // Find envId for this vm
        const env = environments.find(e => e.vms.some(v => v.id === vmId));
        if (!env) return;

        try {
            // Note: Router expects /environments/{class_id}/vms/{vm_id}/revert -> Wait no, check router.
            // Router: @router.post("/{class_id}/environments/revert-all") -> Revert ALL
            // Router: @router.post("/environments/{env_id}/revert") -> Revert Environment
            // Router: vsphere_service.revert_vm(vm_moid) is used in those.
            // There is NO specific single VM revert endpoint exposed in classes.py yet?
            // Checking classes.py... 
            // - suspend_all_vms
            // - revert_all_vms
            // - control_vm_power
            // - delete_vm
            // Wait, control_vm_power supports "revert" action!
            // Line 591 in vsphere_service: elif action == "revert": return self.revert_vm(vm_moid)
            // So we can use the power endpoint with action="revert".
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
         
         const env = environments.find(e => e.vms.some(v => v.id === vmId));
         if (!env) return;

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

    // Helper functions
    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Filtered Environments
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
            maxWidth="5xl"

        >
            <div className="space-y-8">
                {/* Header Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-secondary/20 p-4 rounded-xl border border-theme">
                        <div className="text-sm font-medium text-primary/70 mb-1">Passcode</div>
                        <div className="text-xl font-mono text-primary flex items-center gap-2">
                            <Key className="w-4 h-4 text-blue-400" />
                            {classData.passcode}
                        </div>
                    </div>
                    <div className="bg-secondary/20 p-4 rounded-xl border border-theme">
                        <div className="text-sm font-medium text-primary/70 mb-1">Duration</div>
                        <div className="text-primary flex items-center gap-2">
                             <Calendar className="w-4 h-4 text-purple-400" />
                             <span className="text-sm">
                                 {formatDate(classData.start_date)} - {formatDate(classData.end_date)}
                             </span>
                        </div>
                    </div>
                    <div className="bg-secondary/20 p-4 rounded-xl border border-theme">
                        <div className="text-sm font-medium text-primary/70 mb-1">Capacity</div>
                        <div className="text-primary flex items-center gap-2">
                            <Users className="w-4 h-4 text-emerald-400" />
                            {environments.length} / {classData.max_users} Students
                        </div>
                    </div>
                </div>

                {/* Environments List */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                            <Server className="w-5 h-5 text-blue-400" />
                            Student Environments
                        </h3>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-secondary" />
                                <input
                                    type="text"
                                    placeholder="Search environments..."
                                    value={envSearch}
                                    onChange={(e) => setEnvSearch(e.target.value)}
                                    className="bg-elevated border border-theme rounded-lg pl-9 pr-4 py-2 text-sm text-primary focus:ring-2 focus:ring-blue-500/50 outline-none w-64"
                                />
                            </div>
                            <button 
                                onClick={() => classData && fetchEnvironments(classData.id)}
                                className="p-2 hover:bg-theme-hover rounded-lg text-secondary hover:text-primary transition-colors"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingEnvs ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 pb-24">
                        {loadingEnvs ? (
                            <div className="text-center py-12 text-secondary">
                                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                                Loading environments...
                            </div>
                        ) : filteredEnvironments.length === 0 ? (
                            <div className="bg-secondary/10 border border-theme rounded-xl p-8 text-center">
                                <Server className="w-12 h-12 text-secondary mx-auto mb-3" />
                                <h3 className="text-lg font-medium text-primary">No environments yet</h3>
                                <p className="text-secondary mt-1">Students haven't joined or provisioned this class yet.</p>
                            </div>
                        ) : (
                            filteredEnvironments.map((env) => (
                                <div key={env.id} className="bg-elevated border border-theme rounded-xl hover:border-secondary transition-colors">
                                    {/* Environment Header */}
                                    <div className="px-6 py-4 border-b border-theme bg-secondary/5 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                                                <Server className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-primary">{env.name}</h4>
                                                <div className="flex items-center gap-3 text-xs text-secondary mt-1">
                                                    <span>User ID: {env.user_id || 'Unassigned'}</span>
                                                    <span>•</span>
                                                    <span>{new Date(env.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {/* Environment Actions Dropdown */}
                                            <div className="relative">
                                                <button 
                                                    onClick={() => setOpenEnvMenuId(openEnvMenuId === env.id ? null : env.id)}
                                                    className="px-3 py-1.5 text-xs font-medium text-secondary bg-theme-hover hover:bg-secondary/20 border border-theme rounded-lg transition-colors flex items-center gap-1"
                                                >
                                                    Actions <MoreVertical className="w-3 h-3" />
                                                </button>

                                                {openEnvMenuId === env.id && (
                                                    <div className="absolute right-0 mt-2 w-48 bg-elevated border border-theme rounded-lg shadow-xl z-50 py-1">
                                                        <div className="px-3 py-1.5 text-xs font-semibold text-secondary uppercase tracking-wider">
                                                            Power All VMs
                                                        </div>
                                                        <button 
                                                            onClick={() => handleEnvPower(env.id, 'start')}
                                                            className="w-full text-left px-4 py-2 text-sm text-green-500 hover:bg-theme-hover flex items-center gap-2"
                                                        >
                                                            <Play className="w-4 h-4" /> Start All
                                                        </button>
                                                        <button 
                                                            onClick={() => handleEnvPower(env.id, 'stop')}
                                                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-theme-hover flex items-center gap-2"
                                                        >
                                                            <Square className="w-4 h-4" /> Stop All
                                                        </button>
                                                        <button 
                                                            onClick={() => handleEnvPower(env.id, 'restart')}
                                                            className="w-full text-left px-4 py-2 text-sm text-amber-500 hover:bg-theme-hover flex items-center gap-2"
                                                        >
                                                            <RotateCcw className="w-4 h-4" /> Restart All
                                                        </button>
                                                        
                                                        <div className="my-1 border-t border-theme"></div>

                                                        <button 
                                                            onClick={() => handleEnvRevert(env.id)}
                                                            className="w-full text-left px-4 py-2 text-sm text-orange-500 hover:bg-theme-hover flex items-center gap-2"
                                                        >
                                                            <RefreshCw className="w-4 h-4" /> Revert Env
                                                        </button>
                                                        <button 
                                                            onClick={() => handleEnvDelete(env.id)}
                                                            className="w-full text-left px-4 py-2 text-sm text-secondary hover:text-red-500 hover:bg-theme-hover flex items-center gap-2"
                                                        >
                                                            <Trash2 className="w-4 h-4" /> Delete Env
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* VMs List */}
                                    <div className="divide-y divide-theme">
                                        {env.vms.map((vm) => (
                                            <div key={vm.id} className="px-6 py-4 flex items-center justify-between hover:bg-secondary/5 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-2 h-2 rounded-full ${
                                                        vm.power_state === 'poweredOn' ? 'bg-green-500 shadow-lg shadow-green-500/50' :
                                                        vm.power_state === 'suspended' ? 'bg-amber-500 shadow-lg shadow-amber-500/50' :
                                                        'bg-red-500 shadow-lg shadow-red-500/50'
                                                    }`}></div>
                                                    <div>
                                                        <div className="font-mono text-sm text-primary">{vm.name}</div>
                                                        <div className="flex items-center gap-3 text-xs text-secondary mt-0.5">
                                                            <span>{vm.ip_address || 'No IP'}</span>
                                                            {vm.power_state !== 'poweredOn' && (
                                                                <span className="italic">({vm.power_state})</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {/* Quick Actions */}
                                                    {vm.power_state === 'poweredOn' ? (
                                                        <button 
                                                            onClick={() => handlePowerControl(env.id, vm.id, 'stop')}
                                                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" 
                                                            title="Stop VM"
                                                        >
                                                            <Square className="w-4 h-4" />
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handlePowerControl(env.id, vm.id, 'start')}
                                                            className="p-1.5 text-green-500 hover:bg-green-500/10 rounded-lg transition-colors"
                                                            title="Start VM"
                                                        >
                                                            <Play className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    {/* VM Menu */}
                                                    <div className="relative">
                                                        <button 
                                                            onClick={() => setOpenVmMenuId(openVmMenuId === vm.id ? null : vm.id)}
                                                            className="p-1.5 text-secondary hover:text-primary hover:bg-theme-hover rounded-lg transition-colors"
                                                        >
                                                            <MoreVertical className="w-4 h-4" />
                                                        </button>
                                                        
                                                        {openVmMenuId === vm.id && (
                                                            <div className="absolute right-0 mt-2 w-48 bg-elevated border border-theme rounded-lg shadow-xl z-50 py-1">
                                                                <button 
                                                                    onClick={() => handlePowerControl(env.id, vm.id, 'restart')}
                                                                    className="w-full text-left px-4 py-2 text-sm text-amber-500 hover:bg-theme-hover flex items-center gap-2"
                                                                >
                                                                    <RotateCcw className="w-4 h-4" /> Restart
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleVmRevert(vm.id)}
                                                                    className="w-full text-left px-4 py-2 text-sm text-orange-500 hover:bg-theme-hover flex items-center gap-2"
                                                                >
                                                                    <RefreshCw className="w-4 h-4" /> Revert Snapshot
                                                                </button>
                                                                <div className="border-t border-theme my-1"></div>
                                                                <button 
                                                                    onClick={() => handleVmDelete(vm.id)}
                                                                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-theme-hover flex items-center gap-2"
                                                                >
                                                                    <Trash2 className="w-4 h-4" /> Delete VM
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ClassDetailsModal;
