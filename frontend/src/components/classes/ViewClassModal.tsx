import React, { useState, useEffect } from 'react';
import { 
    MoreVertical, Eye, Trash2, Search, Calendar, Users, Server, Edit, Play, Square, RotateCcw, Key, RefreshCw 
} from 'lucide-react';
import Modal from '../Modal';
import { ProviderIcon } from '../ProviderIcons';
import type { ClassModel, ClassEnvironment } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';

interface ViewClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    classData: ClassModel | null;
    onEdit: (cls: ClassModel) => void;
    onDelete: (cls: ClassModel) => void;
}

const ViewClassModal: React.FC<ViewClassModalProps> = ({ isOpen, onClose, classData, onEdit, onDelete }) => {
    const { showToast } = useToast();
    const [environments, setEnvironments] = useState<ClassEnvironment[]>([]);
    const [loadingEnvs, setLoadingEnvs] = useState(false);
    const [envSearch, setEnvSearch] = useState('');
    
    // Action menu states
    const [openEnvMenuId, setOpenEnvMenuId] = useState<number | null>(null);
    const [openVmMenuId, setOpenVmMenuId] = useState<number | null>(null);
    const [isClassActionMenuOpen, setIsClassActionMenuOpen] = useState(false);

    useEffect(() => {
        if (classData && isOpen) {
            fetchEnvironments(classData.id);
            setIsClassActionMenuOpen(false);
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

    const handleProvision = async () => {
        if (!classData) return;
        
        try {
            showToast('Provisioning started...', 'success');
            await api.post(`/classes/${classData.id}/provision`);
            showToast('Provisioning task queued successfully', 'success');
            // Refresh environments to see the new task/environments (give it a moment or poll?)
            // We'll fetch immediately, and maybe the user clicks refresh if it takes time.
            fetchEnvironments(classData.id);
        } catch (error) {
            console.error('Failed to provision class:', error);
            showToast('Failed to start provisioning', 'error');
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
            headerActions={
                <div className="relative">
                    <button 
                        onClick={() => setIsClassActionMenuOpen(!isClassActionMenuOpen)}
                        className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        <MoreVertical className="w-5 h-5" />
                    </button>

                    {isClassActionMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                            <button 
                                onClick={() => {
                                    onEdit(classData);
                                    setIsClassActionMenuOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700/50 flex items-center gap-2"
                            >
                                <Edit className="w-4 h-4" /> Edit Class
                            </button>
                            <button 
                                onClick={() => {
                                    handleProvision();
                                    setIsClassActionMenuOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700/50 flex items-center gap-2"
                            >
                                <Play className="w-4 h-4" /> Provision Environments
                            </button>
                            <div className="border-t border-gray-700 my-1"></div>
                            <button 
                                onClick={() => {
                                    onDelete(classData);
                                    setIsClassActionMenuOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700/50 flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Delete Class
                            </button>
                        </div>
                    )}
                </div>
            }
        >
            <div className="space-y-8">
                {/* Header Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                        <div className="text-sm text-gray-400 mb-1">Passcode</div>
                        <div className="text-xl font-mono text-white flex items-center gap-2">
                            <Key className="w-4 h-4 text-blue-400" />
                            {classData.passcode}
                        </div>
                    </div>
                    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                        <div className="text-sm text-gray-400 mb-1">Duration</div>
                        <div className="text-white flex items-center gap-2">
                             <Calendar className="w-4 h-4 text-purple-400" />
                             <span className="text-sm">
                                 {formatDate(classData.start_date)} - {formatDate(classData.end_date)}
                             </span>
                        </div>
                    </div>
                    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                        <div className="text-sm text-gray-400 mb-1">Capacity</div>
                        <div className="text-white flex items-center gap-2">
                            <Users className="w-4 h-4 text-emerald-400" />
                            {environments.length} / {classData.max_users} Students
                        </div>
                    </div>
                </div>

                {/* Environments List */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Server className="w-5 h-5 text-blue-400" />
                            Student Environments
                        </h3>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search environments..."
                                    value={envSearch}
                                    onChange={(e) => setEnvSearch(e.target.value)}
                                    className="bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/50 outline-none w-64"
                                />
                            </div>
                            <button 
                                onClick={() => classData && fetchEnvironments(classData.id)}
                                className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingEnvs ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {loadingEnvs ? (
                            <div className="text-center py-12 text-gray-400">
                                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                                Loading environments...
                            </div>
                        ) : filteredEnvironments.length === 0 ? (
                            <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-8 text-center">
                                <Server className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                <h3 className="text-lg font-medium text-gray-300">No environments yet</h3>
                                <p className="text-gray-500 mt-1">Students haven't joined or provisioned this class yet.</p>
                            </div>
                        ) : (
                            filteredEnvironments.map((env) => (
                                <div key={env.id} className="bg-gray-800/30 border border-gray-700/50 rounded-xl hover:border-gray-600 transition-colors">
                                    {/* Environment Header */}
                                    <div className="px-6 py-4 border-b border-gray-700/50 bg-gray-800/50 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                                                <Server className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-white">{env.name}</h4>
                                                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
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
                                                    className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors flex items-center gap-1"
                                                >
                                                    Actions <MoreVertical className="w-3 h-3" />
                                                </button>

                                                {openEnvMenuId === env.id && (
                                                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 py-1">
                                                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                            Power All VMs
                                                        </div>
                                                        <button 
                                                            onClick={() => handleEnvPower(env.id, 'start')}
                                                            className="w-full text-left px-4 py-2 text-sm text-green-400 hover:bg-gray-700/50 flex items-center gap-2"
                                                        >
                                                            <Play className="w-4 h-4" /> Start All
                                                        </button>
                                                        <button 
                                                            onClick={() => handleEnvPower(env.id, 'stop')}
                                                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700/50 flex items-center gap-2"
                                                        >
                                                            <Square className="w-4 h-4" /> Stop All
                                                        </button>
                                                        <button 
                                                            onClick={() => handleEnvPower(env.id, 'restart')}
                                                            className="w-full text-left px-4 py-2 text-sm text-amber-400 hover:bg-gray-700/50 flex items-center gap-2"
                                                        >
                                                            <RotateCcw className="w-4 h-4" /> Restart All
                                                        </button>
                                                        
                                                        <div className="my-1 border-t border-gray-700"></div>

                                                        <button 
                                                            onClick={() => handleEnvRevert(env.id)}
                                                            className="w-full text-left px-4 py-2 text-sm text-orange-400 hover:bg-gray-700/50 flex items-center gap-2"
                                                        >
                                                            <RefreshCw className="w-4 h-4" /> Revert Env
                                                        </button>
                                                        <button 
                                                            onClick={() => handleEnvDelete(env.id)}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700/50 flex items-center gap-2"
                                                        >
                                                            <Trash2 className="w-4 h-4" /> Delete Env
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* VMs List */}
                                    <div className="divide-y divide-gray-700/50">
                                        {env.vms.map((vm) => (
                                            <div key={vm.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-800/20 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-2 h-2 rounded-full ${
                                                        vm.power_state === 'poweredOn' ? 'bg-green-500 shadow-lg shadow-green-500/50' :
                                                        vm.power_state === 'suspended' ? 'bg-amber-500 shadow-lg shadow-amber-500/50' :
                                                        'bg-red-500 shadow-lg shadow-red-500/50'
                                                    }`}></div>
                                                    <div>
                                                        <div className="font-mono text-sm text-gray-200">{vm.name}</div>
                                                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
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
                                                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" 
                                                            title="Stop VM"
                                                        >
                                                            <Square className="w-4 h-4" />
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handlePowerControl(env.id, vm.id, 'start')}
                                                            className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                                                            title="Start VM"
                                                        >
                                                            <Play className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    {/* VM Menu */}
                                                    <div className="relative">
                                                        <button 
                                                            onClick={() => setOpenVmMenuId(openVmMenuId === vm.id ? null : vm.id)}
                                                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                                                        >
                                                            <MoreVertical className="w-4 h-4" />
                                                        </button>
                                                        
                                                        {openVmMenuId === vm.id && (
                                                            <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 py-1">
                                                                <button 
                                                                    onClick={() => handlePowerControl(env.id, vm.id, 'restart')}
                                                                    className="w-full text-left px-4 py-2 text-sm text-amber-400 hover:bg-gray-700/50 flex items-center gap-2"
                                                                >
                                                                    <RotateCcw className="w-4 h-4" /> Restart
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleVmRevert(vm.id)}
                                                                    className="w-full text-left px-4 py-2 text-sm text-orange-400 hover:bg-gray-700/50 flex items-center gap-2"
                                                                >
                                                                    <RefreshCw className="w-4 h-4" /> Revert Snapshot
                                                                </button>
                                                                <div className="border-t border-gray-700 my-1"></div>
                                                                <button 
                                                                    onClick={() => handleVmDelete(vm.id)}
                                                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700/50 flex items-center gap-2"
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

export default ViewClassModal;
