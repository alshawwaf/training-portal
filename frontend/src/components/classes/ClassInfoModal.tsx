import React, { useState, useEffect } from 'react';
import { 
    MoreVertical, Trash2, Search, Calendar, Users, Server, Play, Square, RotateCcw, Key, RefreshCw
} from 'lucide-react';
import Modal from '../Modal';
import type { ClassModel, ClassEnvironment } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';

interface ClassInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    classData: ClassModel | null;
}

const ClassInfoModal: React.FC<ClassInfoModalProps> = ({ isOpen, onClose, classData }) => {
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

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
             setOpenEnvMenuId(null);
             setOpenVmMenuId(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const fetchEnvironments = async (classId: number) => {
        setLoadingEnvs(true);
        try {
            const response = await api.get(`/classes/${classId}/environments`);
            setEnvironments(response.data);
        } catch (error) {
            console.error('Failed to fetch environments:', error);
            showToast('Failed to load environment data', 'error');
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
            await api.post(`/environments/${envId}/revert`);
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
            // Using the new logic discovered: control_vm_power supports 'revert' action
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

    // Helper functions
    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
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
            icon={<Server className="w-6 h-6 text-blue-500" />} // Changed icon for freshness
            maxWidth="5xl"
        >
            <div className="space-y-8 animate-fadeIn">
                {/* Hero Stats Section - Enhanced with Glassmorphism */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-5 rounded-2xl border border-blue-500/10 backdrop-blur-sm hover:border-blue-500/30 transition-all shadow-sm">
                        <div className="text-sm font-medium text-blue-400 mb-1 flex items-center gap-2">
                            <Key className="w-4 h-4" /> Passcode
                        </div>
                        <div className="text-2xl font-mono text-primary font-bold tracking-wider">
                            {classData.passcode}
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 p-5 rounded-2xl border border-purple-500/10 backdrop-blur-sm hover:border-purple-500/30 transition-all shadow-sm">
                        <div className="text-sm font-medium text-purple-400 mb-1 flex items-center gap-2">
                             <Calendar className="w-4 h-4" /> Duration
                        </div>
                        <div className="text-primary font-semibold flex flex-col">
                             <span>{formatDate(classData.start_date)}</span>
                             <span className="text-xs text-secondary opacity-70">to {formatDate(classData.end_date)}</span>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 p-5 rounded-2xl border border-emerald-500/10 backdrop-blur-sm hover:border-emerald-500/30 transition-all shadow-sm">
                        <div className="text-sm font-medium text-emerald-400 mb-1 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Capacity
                        </div>
                        <div className="text-2xl font-bold text-primary">
                            {environments.length} <span className="text-sm text-secondary font-normal">/ {classData.max_users} Students</span>
                        </div>
                    </div>
                </div>

                {/* Environments List - Enhanced Layout */}
                <div className="bg-secondary/5 rounded-2xl border border-theme p-1 overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-elevated border-b border-theme rounded-t-xl">
                        <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                            Student Environments
                            <span className="px-2 py-0.5 rounded-full bg-secondary/20 text-xs font-normal text-secondary border border-theme">
                                {environments.length} Total
                            </span>
                        </h3>
                        <div className="flex items-center gap-3">
                            <div className="relative group">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-secondary group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Find environment..."
                                    value={envSearch}
                                    onChange={(e) => setEnvSearch(e.target.value)}
                                    className="bg-secondary/10 border border-transparent hover:border-theme focus:border-blue-500/50 rounded-xl pl-9 pr-4 py-2 text-sm text-primary focus:ring-4 focus:ring-blue-500/10 outline-none w-64 transition-all"
                                />
                            </div>
                            <button 
                                onClick={() => classData && fetchEnvironments(classData.id)}
                                className="p-2 hover:bg-secondary/10 rounded-xl text-secondary hover:text-primary transition-all border border-transparent hover:border-theme"
                                title="Refresh List"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingEnvs ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className="p-4 bg-secondary/5 min-h-[300px] max-h-[600px] overflow-y-auto space-y-4 custom-scrollbar">
                        {loadingEnvs ? (
                            <div className="text-center py-20">
                                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                                <p className="text-secondary animate-pulse">Syncing environments...</p>
                            </div>
                        ) : filteredEnvironments.length === 0 ? (
                            <div className="text-center py-20 opacity-50">
                                <Server className="w-16 h-16 text-secondary mx-auto mb-4 opacity-50" />
                                <h3 className="text-lg font-medium text-primary">No environments found</h3>
                                <p className="text-sm text-secondary mt-1">
                                    {envSearch ? "Try adjusting your search terms" : "Wait for students to join"}
                                </p>
                            </div>
                        ) : (
                            filteredEnvironments.map((env) => (
                                <div key={env.id} className="bg-elevated border border-theme rounded-xl shadow-sm hover:shadow-md transition-all duration-300 group">
                                    {/* Environment Header */}
                                    <div className="p-4 border-b border-theme flex items-center justify-between bg-gradient-to-r from-transparent to-secondary/5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-lg">
                                                {env.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-primary">{env.name}</h4>
                                                <div className="flex items-center gap-2 text-xs text-secondary mt-0.5">
                                                    <span className="font-mono bg-secondary/10 px-1.5 py-0.5 rounded">ID: {env.user_id || 'unassigned'}</span>
                                                    <span>•</span>
                                                    <span>{new Date(env.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenEnvMenuId(openEnvMenuId === env.id ? null : env.id);
                                                    setOpenVmMenuId(null);
                                                }}
                                                className="px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary bg-secondary/10 hover:bg-secondary/20 rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                Manage Env <MoreVertical className="w-3 h-3" />
                                            </button>
                                            
                                            {openEnvMenuId === env.id && (
                                                <div className="absolute right-0 mt-2 w-56 bg-elevated border border-theme rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                                    <div className="px-3 py-2 text-[10px] font-bold text-secondary uppercase tracking-widest bg-secondary/5 border-b border-theme mb-1">
                                                        Environment Controls
                                                    </div>
                                                    <button onClick={() => handleEnvPower(env.id, 'start')} className="w-full text-left px-4 py-2 text-sm text-green-500 hover:bg-green-500/5 hover:pl-5 transition-all flex items-center gap-2">
                                                        <Play className="w-3.5 h-3.5" /> Start All VMs
                                                    </button>
                                                    <button onClick={() => handleEnvPower(env.id, 'stop')} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-500/5 hover:pl-5 transition-all flex items-center gap-2">
                                                        <Square className="w-3.5 h-3.5" /> Stop All VMs
                                                    </button>
                                                    <button onClick={() => handleEnvPower(env.id, 'restart')} className="w-full text-left px-4 py-2 text-sm text-amber-500 hover:bg-amber-500/5 hover:pl-5 transition-all flex items-center gap-2">
                                                        <RotateCcw className="w-3.5 h-3.5" /> Restart All VMs
                                                    </button>
                                                    <div className="h-px bg-theme my-1"></div>
                                                    <button onClick={() => handleEnvRevert(env.id)} className="w-full text-left px-4 py-2 text-sm text-orange-500 hover:bg-orange-500/5 hover:pl-5 transition-all flex items-center gap-2">
                                                        <RefreshCw className="w-3.5 h-3.5" /> Revert to Base
                                                    </button>
                                                    <button onClick={() => handleEnvDelete(env.id)} className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-red-500 hover:bg-red-500/5 hover:pl-5 transition-all flex items-center gap-2">
                                                        <Trash2 className="w-3.5 h-3.5" /> Destroy Env
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* VMs List */}
                                    <div className="px-4 py-2 bg-secondary/5 space-y-2">
                                        {env.vms.map((vm) => (
                                            <div key={vm.id} className="p-3 bg-elevated/50 border border-theme/50 hover:border-theme rounded-lg group/vm flex items-center justify-between transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-offset-2 ring-offset-elevated ${
                                                        vm.power_state === 'poweredOn' ? 'bg-green-500 ring-green-500/20' :
                                                        vm.power_state === 'suspended' ? 'bg-amber-500 ring-amber-500/20' :
                                                        'bg-red-500 ring-red-500/20'
                                                    }`} title={`Status: ${vm.power_state}`}></div>
                                                    <div>
                                                        <div className="font-mono text-sm font-medium text-primary">{vm.name}</div>
                                                        <div className="flex items-center gap-2 text-[10px] text-secondary">
                                                            <span>{vm.ip_address || 'No IP Address'}</span>
                                                            {vm.power_state !== 'poweredOn' && (
                                                                <span className="italic opacity-70">({vm.power_state})</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 opacity-0 group-hover/vm:opacity-100 transition-opacity">
                                                    {/* Quick Actions */}
                                                    {vm.power_state === 'poweredOn' ? (
                                                        <button 
                                                            onClick={() => handlePowerControl(env.id, vm.id, 'stop')}
                                                            className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors" 
                                                            title="Stop VM"
                                                        >
                                                            <Square className="w-3.5 h-3.5 animate-in zoom-in" />
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handlePowerControl(env.id, vm.id, 'start')}
                                                            className="p-1.5 text-green-400 hover:text-green-500 hover:bg-green-500/10 rounded transition-colors"
                                                            title="Start VM"
                                                        >
                                                            <Play className="w-3.5 h-3.5 animate-in zoom-in" />
                                                        </button>
                                                    )}

                                                    <div className="relative">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenVmMenuId(openVmMenuId === vm.id ? null : vm.id);
                                                                setOpenEnvMenuId(null);
                                                            }}
                                                            className="p-1.5 text-secondary hover:text-primary hover:bg-secondary/20 rounded transition-colors"
                                                        >
                                                            <MoreVertical className="w-3.5 h-3.5" />
                                                        </button>
                                                        
                                                        {openVmMenuId === vm.id && (
                                                            <div className="absolute right-0 mt-1 w-40 bg-elevated border border-theme rounded-lg shadow-xl z-50 py-1 overflow-hidden origin-top-right">
                                                                <button onClick={() => handlePowerControl(env.id, vm.id, 'restart')} className="w-full text-left px-3 py-1.5 text-xs text-amber-500 hover:bg-theme-hover flex items-center gap-2">
                                                                    <RotateCcw className="w-3 h-3" /> Restart
                                                                </button>
                                                                <button onClick={() => handleVmRevert(vm.id)} className="w-full text-left px-3 py-1.5 text-xs text-orange-500 hover:bg-theme-hover flex items-center gap-2">
                                                                    <RefreshCw className="w-3 h-3" /> Revert
                                                                </button>
                                                                <div className="border-t border-theme my-1"></div>
                                                                <button onClick={() => handleVmDelete(vm.id)} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-theme-hover flex items-center gap-2">
                                                                    <Trash2 className="w-3 h-3" /> Delete
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

export default ClassInfoModal;
