import React, { useState, useEffect } from 'react';
import { 
    Eye, Trash2, Search, Calendar, Users, Server, Play, Square, RotateCcw, Key, RefreshCw, Monitor, ChevronDown, ChevronRight, Pause, Copy, Link2, Check 
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../Modal';
import type { ClassModel, ClassEnvironment } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';
import ProgressModal from './ProgressModal';

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
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Progress Modal State
    const [progressModal, setProgressModal] = useState<{
        isOpen: boolean;
        title: string;
        apiUrl: string;
        method: 'POST' | 'DELETE' | 'PUT';
    }>({
        isOpen: false,
        title: '',
        apiUrl: '',
        method: 'POST'
    });

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
            showToast(`Failed to ${action} environment`, 'error');
        }
    };

    const handleEnvRevert = async (envId: number) => {
        if (!confirm('Revert this environment? All changes will be lost.')) return;
        try {
            await api.post(`/classes/environments/${envId}/revert`);
            showToast('Environment revert triggered', 'success');
            if (classData) fetchEnvironments(classData.id);
        } catch (error) {
            showToast('Failed to revert environment', 'error');
        }
    };

    const handleEnvDelete = async (envId: number) => {
        if (!confirm('Delete this environment? This cannot be undone.')) return;
        try {
            await api.delete(`/classes/environments/${envId}`);
            showToast('Environment deleted', 'success');
            if (classData) fetchEnvironments(classData.id);
        } catch (error) {
            showToast('Failed to delete environment', 'error');
        }
    };

    const handleVmAction = async (envId: number, vmId: number, action: string, vmName: string) => {
        if (!classData) return;

        if (action === 'delete') {
            if (confirm(`Are you sure you want to delete VM ${vmName} from this environment?`)) {
                 setProgressModal({
                    isOpen: true,
                    title: `Deleting VM ${vmName}`,
                    apiUrl: `/classes/environments/${classData.id}/vms/${vmId}`,
                    method: 'DELETE'
                });
            }
            return;
        }

        if (action === 'revert') {
            if (confirm(`Revert VM ${vmName} to its initial snapshot? Current state will be lost.`)) {
                setProgressModal({
                    isOpen: true,
                    title: `Reverting VM ${vmName}`,
                    apiUrl: `/classes/environments/${classData.id}/vms/${vmId}/revert`,
                    method: 'POST'
                });
            }
            return;
        }

        // Power actions (start, stop, etc.)
        try {
            await api.post(`/classes/environments/${classData.id}/vms/${vmId}/power`, { action });
            showToast(`VM ${action} command sent`, 'success');
            fetchEnvironments(classData.id);
        } catch (error) {
            showToast(`Failed to ${action} VM`, 'error');
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

    const joinUrl = classData?.join_token 
        ? `${window.location.origin}/join/${classData.join_token}`
        : null;

    const copyToClipboard = (text: string, fieldId: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        showToast(`${label} copied!`, 'success');
        setTimeout(() => setCopiedField(null), 2000);
    };

    if (!classData) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={classData.name} icon={<Eye className="w-5 h-5 text-blue-500" />} maxWidth="5xl">
            <div className="space-y-5">
                {/* Header Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Passcode */}
                    <button
                        onClick={() => copyToClipboard(classData.passcode || '', 'passcode', 'Passcode')}
                        className="group flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-left"
                    >
                        <Key className="w-4 h-4 text-violet-500" />
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-semibold text-slate-400 uppercase">Passcode</div>
                            <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">{classData.passcode || 'N/A'}</div>
                        </div>
                        {copiedField === 'passcode' ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                    </button>
                    
                    {/* Date Range */}
                    <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase">Duration</div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{formatDate(classData.start_date)} – {formatDate(classData.end_date)}</div>
                        </div>
                    </div>
                    
                    {/* Enrollment */}
                    <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        <Users className="w-4 h-4 text-emerald-500" />
                        <div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase">Enrolled</div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{environments.length} / {classData.max_users}</div>
                        </div>
                    </div>
                    
                    {/* Active VMs */}
                    <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        <Server className="w-4 h-4 text-amber-500" />
                        <div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase">Templates</div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{classData.template?.name || 'None'}</div>
                        </div>
                    </div>
                </div>

                {/* Join Link */}
                {joinUrl && (
                    <button
                        onClick={() => copyToClipboard(joinUrl, 'joinlink', 'Join link')}
                        className="group w-full flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200/50 dark:border-blue-500/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors text-left"
                    >
                        <Link2 className="w-4 h-4 text-blue-500" />
                        <code className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{joinUrl}</code>
                        {copiedField === 'joinlink' ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                            <Copy className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-colors" />
                        )}
                    </button>
                )}

                {/* Search + Refresh */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search environments..."
                            value={envSearch}
                            onChange={(e) => setEnvSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <button 
                        onClick={() => classData && fetchEnvironments(classData.id)}
                        className="p-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        <RefreshCw className={clsx("w-4 h-4 text-slate-500", loadingEnvs && "animate-spin")} />
                    </button>
                </div>

                {/* Environment List */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        <div className="col-span-1"></div>
                        <div className="col-span-4">Environment</div>
                        <div className="col-span-2">VMs</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-3 text-right">Actions</div>
                    </div>

                    {/* Body */}
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[50vh] overflow-y-auto">
                        {loadingEnvs ? (
                            <div className="flex items-center justify-center py-12 text-slate-500">
                                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                                Loading environments...
                            </div>
                        ) : filteredEnvironments.length === 0 ? (
                            <div className="text-center py-12">
                                <Server className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                                <p className="text-sm font-medium text-slate-500">No environments found</p>
                            </div>
                        ) : (
                            filteredEnvironments.map((env) => {
                                const status = getVmStatusCounts(env);
                                const isExpanded = expandedEnvId === env.id;
                                
                                return (
                                    <div key={env.id}>
                                        {/* Row */}
                                        <div 
                                            className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                                            onClick={() => setExpandedEnvId(isExpanded ? null : env.id)}
                                        >
                                            <div className="col-span-1">
                                                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                            </div>
                                            <div className="col-span-4">
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{env.name}</div>
                                                <div className="text-xs text-slate-500">{env.user_id ? `User #${env.user_id}` : 'Provisioning...'}</div>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-sm text-slate-600 dark:text-slate-300">{status.total} VM{status.total !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="col-span-2 flex items-center gap-1.5">
                                                {status.on > 0 && <span className="flex items-center gap-1 text-xs text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>{status.on}</span>}
                                                {status.suspended > 0 && <span className="flex items-center gap-1 text-xs text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-500"></span>{status.suspended}</span>}
                                                {status.off > 0 && <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-400"></span>{status.off}</span>}
                                            </div>
                                            <div className="col-span-3 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                                    <button onClick={() => handleEnvPower(env.id, 'start')} className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-colors" title="Start All">
                                                        <Play className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleEnvPower(env.id, 'stop')} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded transition-colors" title="Stop All">
                                                        <Square className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleEnvPower(env.id, 'suspend')} className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded transition-colors" title="Suspend All">
                                                        <Pause className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <button onClick={() => handleEnvRevert(env.id)} className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors" title="Revert">
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => handleEnvDelete(env.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded VMs */}
                                        {isExpanded && (
                                            <div className="bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800 px-4 py-2 space-y-1">
                                                {env.vms.map((vm) => (
                                                    <div key={vm.id} className="flex items-center justify-between py-2 px-3 bg-white dark:bg-slate-800/50 rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <div className={clsx("w-2 h-2 rounded-full",
                                                                vm.power_state === 'poweredOn' ? 'bg-emerald-500' :
                                                                vm.power_state === 'suspended' ? 'bg-amber-500' :
                                                                'bg-slate-400'
                                                            )}></div>
                                                            <div>
                                                                <span className="text-sm font-medium text-slate-900 dark:text-white">{vm.name}</span>
                                                                <span className="text-xs text-slate-400 ml-2">{vm.ip_address || 'No IP'}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-2">
                                                            <a 
                                                                href={`/api/classes/environments/${classData.id}/vms/${vm.id}/console`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                                                            >
                                                                <Monitor className="w-3 h-3" />
                                                                Console
                                                            </a>
                                                            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
                                                                <button 
                                                                    onClick={() => handleVmAction(env.id, vm.id, vm.power_state === 'poweredOn' ? 'stop' : 'start', vm.name)}
                                                                    className={clsx("p-1.5 rounded transition-colors", 
                                                                        vm.power_state === 'poweredOn' 
                                                                            ? "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" 
                                                                            : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                                                    )}
                                                                >
                                                                    {vm.power_state === 'poweredOn' ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                                                </button>
                                                                <button onClick={() => handleVmAction(env.id, vm.id, 'revert', vm.name)} className="p-1.5 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded transition-colors">
                                                                    <RotateCcw className="w-3 h-3" />
                                                                </button>
                                                                <button onClick={() => handleVmAction(env.id, vm.id, 'delete', vm.name)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded transition-colors">
                                                                    <Trash2 className="w-3 h-3" />
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

                {/* Legend */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Running</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Suspended</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Stopped</span>
                    </div>
                    <span className="text-slate-400">Click row to expand VM details</span>
                </div>
            </div>

            <ProgressModal 
                isOpen={progressModal.isOpen} 
                onClose={() => {
                    setProgressModal(prev => ({ ...prev, isOpen: false }));
                    if (classData) fetchEnvironments(classData.id);
                }}
                title={progressModal.title}
                apiUrl={progressModal.apiUrl}
                method={progressModal.method}
            />
        </Modal>
    );
};

export default ClassDetailsModal;
