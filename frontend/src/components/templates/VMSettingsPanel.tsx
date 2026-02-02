import React, { useState, useEffect, useCallback } from 'react';
import { 
    Cpu, MemoryStick, HardDrive, Camera,
    Plus, Trash2, RotateCcw, RefreshCw, Save, X, Info, Zap,
    Shield, Database, Terminal, Disc,
    Monitor, Settings2, Power
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import clsx from 'clsx';

interface VMSettingsPanelProps {
    vmMoid: string;
    vmName: string;
    connectionId: number;
    onClose: () => void;
    onRefresh?: () => void;
}

interface VMHardware {
    success: boolean;
    vm_name: string;
    power_state: string;
    compute: {
        num_cpus: number;
        cores_per_socket: number;
        memory_mb: number;
        memory_gb: number;
        nested_hv_enabled: boolean;
        cpu_hot_add_enabled: boolean;
        memory_hot_add_enabled: boolean;
    };
    firmware: {
        type: string;
        secure_boot_enabled: boolean;
        has_tpm: boolean;
    };
    disks: Array<{
        key: number;
        label: string;
        capacity_gb: number;
        datastore: string;
        thin_provisioned: boolean;
    }>;
    nics: Array<{
        key: number;
        label: string;
        mac_address: string;
        type: string;
        network: string;
    }>;
    cdroms?: Array<{
        label: string;
        iso_path?: string;
    }>;
    snapshots?: Array<{
        id: string;
        name: string;
        description: string;
        created: string;
    }>;
    guest_os: string;
}

interface Datastore {
    name: string;
    free_gb: number;
    capacity_gb: number;
}

// Tab type
type TabType = 'compute' | 'storage' | 'snapshots' | 'advanced';

const VMSettingsPanel: React.FC<VMSettingsPanelProps> = ({ 
    vmMoid, vmName, connectionId, onClose, onRefresh 
}) => {
    const { showToast } = useToast();
    const [hardware, setHardware] = useState<VMHardware | null>(null);
    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [datastores, setDatastores] = useState<Datastore[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('compute');
    
    // Form state for compute settings
    const [compute, setCompute] = useState({
        num_cpus: 1,
        cores_per_socket: 1,
        memory_mb: 1024,
        nested_hv_enabled: false,
        cpu_hot_add_enabled: false,
        memory_hot_add_enabled: false
    });
    
    // Add disk dialog
    const [showAddDisk, setShowAddDisk] = useState(false);
    const [newDisk, setNewDisk] = useState({ size_gb: 40, datastore_name: '', thin_provisioned: true });
    
    // Create snapshot dialog
    const [showCreateSnapshot, setShowCreateSnapshot] = useState(false);
    const [newSnapshot, setNewSnapshot] = useState({ name: '', description: '' });
    
    // VM Name edit
    const [vmNameEdit, setVmNameEdit] = useState(vmName);
    const [isEditingName, setIsEditingName] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    
    const loadHardware = useCallback(async () => {
        if (!vmMoid || vmMoid === 'None' || vmMoid === 'undefined') {
            console.warn('VMSettingsPanel: vmMoid is invalid, skipping hardware load');
            setLoadError('This VM does not have a valid identifier. It may not have been deployed yet.');
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        try {
            const res = await api.get(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/hardware`);
            if (res.data.success) {
                setHardware(res.data);
                setCompute({
                    num_cpus: res.data.compute.num_cpus,
                    cores_per_socket: res.data.compute.cores_per_socket,
                    memory_mb: res.data.compute.memory_mb,
                    nested_hv_enabled: res.data.compute.nested_hv_enabled,
                    cpu_hot_add_enabled: res.data.compute.cpu_hot_add_enabled,
                    memory_hot_add_enabled: res.data.compute.memory_hot_add_enabled
                });
            } else {
                setLoadError(res.data.message || 'Failed to load VM hardware');
            }
        } catch (e: any) {
            setLoadError(e.response?.data?.detail || 'Failed to load VM hardware');
        } finally {
            setIsLoading(false);
        }
    }, [connectionId, vmMoid]);
    
    const loadSnapshots = useCallback(async () => {
        if (!vmMoid || vmMoid === 'None' || vmMoid === 'undefined') {
            return;
        }
        try {
            const res = await api.get(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/snapshots`);
            if (res.data.success) {
                setSnapshots(res.data.snapshots || []);
            }
        } catch (e) {
            console.error('Failed to load snapshots', e);
        }
    }, [connectionId, vmMoid]);
    
    const loadDatastores = useCallback(async () => {
        try {
            const res = await api.get(`/infrastructure-connections/${connectionId}/datastores`);
            if (res.data.success) {
                setDatastores(res.data.datastores || []);
                if (res.data.datastores?.length > 0 && !newDisk.datastore_name) {
                    setNewDisk(prev => ({ ...prev, datastore_name: res.data.datastores[0].name }));
                }
            }
        } catch (e) {
            console.error('Failed to load datastores', e);
        }
    }, [connectionId]);
    
    useEffect(() => {
        loadHardware();
        loadSnapshots();
        loadDatastores();
    }, [loadHardware, loadSnapshots, loadDatastores]);
    
    const handleSaveCompute = async () => {
        setIsSaving(true);
        try {
            const res = await api.put(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/reconfigure`, compute);
            if (res.data.success) {
                showToast('Settings saved!', 'success');
                loadHardware();
                onRefresh?.();
            } else {
                showToast(res.data.message || 'Failed to save', 'error');
            }
        } catch (e: any) {
            const detail = e.response?.data?.detail;
            const errorMsg = typeof detail === 'string' ? detail : 
                Array.isArray(detail) ? detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(', ') :
                'Failed to save settings';
            showToast(errorMsg, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleRename = async () => {
        if (!vmNameEdit.trim() || vmNameEdit === hardware?.vm_name) {
            setIsEditingName(false);
            return;
        }
        setIsSaving(true);
        try {
            const res = await api.put(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/reconfigure`, {
                name: vmNameEdit.trim()
            });
            if (res.data.success) {
                showToast('VM renamed!', 'success');
                setIsEditingName(false);
                loadHardware();
                onRefresh?.();
            } else {
                showToast(res.data.message || 'Failed to rename', 'error');
            }
        } catch (e: any) {
            const detail = e.response?.data?.detail;
            const errorMsg = typeof detail === 'string' ? detail : 
                Array.isArray(detail) ? detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(', ') :
                'Failed to rename';
            showToast(errorMsg, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleAddDisk = async () => {
        if (!newDisk.datastore_name) {
            showToast('Please select a datastore', 'warning');
            return;
        }
        setIsSaving(true);
        try {
            const res = await api.post(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/disks`, newDisk);
            if (res.data.success) {
                showToast('Disk added!', 'success');
                setShowAddDisk(false);
                setNewDisk({ size_gb: 40, datastore_name: datastores[0]?.name || '', thin_provisioned: true });
                loadHardware();
            } else {
                showToast(res.data.message || 'Failed to add disk', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to add disk', 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleRemoveDisk = async (diskKey: number, diskLabel: string) => {
        if (!confirm(`Delete ${diskLabel}? This will destroy the disk data.`)) return;
        
        try {
            const res = await api.delete(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/disks/${diskKey}`);
            if (res.data.success) {
                showToast('Disk removed!', 'success');
                loadHardware();
            } else {
                showToast(res.data.message || 'Failed to remove disk', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to remove disk', 'error');
        }
    };
    
    const handleCreateSnapshot = async () => {
        if (!newSnapshot.name.trim()) {
            showToast('Please enter a snapshot name', 'warning');
            return;
        }
        setIsSaving(true);
        try {
            const res = await api.post(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/snapshots`, newSnapshot);
            if (res.data.success) {
                showToast('Snapshot created!', 'success');
                setShowCreateSnapshot(false);
                setNewSnapshot({ name: '', description: '' });
                loadSnapshots();
            } else {
                showToast(res.data.message || 'Failed to create snapshot', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to create snapshot', 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleRevertSnapshot = async (snapshotId: string, snapshotName: string) => {
        if (!confirm(`Revert to "${snapshotName}"? Current state will be lost.`)) return;
        
        try {
            const res = await api.post(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/snapshots/${snapshotId}/revert`);
            if (res.data.success) {
                showToast('Reverted!', 'success');
            } else {
                showToast(res.data.message || 'Failed to revert', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to revert', 'error');
        }
    };
    
    const handleDeleteSnapshot = async (snapshotId: string, snapshotName: string) => {
        if (!confirm(`Delete snapshot "${snapshotName}"?`)) return;
        
        try {
            const res = await api.delete(`/infrastructure-connections/${connectionId}/vms/${vmMoid}/snapshots/${snapshotId}`);
            if (res.data.success) {
                showToast('Deleted!', 'success');
                loadSnapshots();
            } else {
                showToast(res.data.message || 'Failed to delete', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to delete', 'error');
        }
    };
    
    // Loading state
    if (isLoading) {
        return (
            <div className="w-[420px] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-4 flex items-center justify-between border-b border-white/10">
                    <span className="text-sm font-bold text-white">VM Settings</span>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="flex items-center justify-center py-16">
                    <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
                </div>
            </div>
        );
    }
    
    // Error or no hardware state
    if (loadError || !hardware?.success) {
        return (
            <div className="w-[420px] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-4 flex items-center justify-between border-b border-white/10">
                    <span className="text-sm font-bold text-white">VM Settings</span>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="p-8 text-center">
                    <Info className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                    <p className="text-sm text-slate-300 mb-2">Unable to load VM settings</p>
                    <p className="text-xs text-slate-500">{loadError || 'Hardware configuration not available'}</p>
                </div>
            </div>
        );
    }
    
    const hasComputeChanges = 
        compute.num_cpus !== hardware.compute.num_cpus ||
        compute.cores_per_socket !== hardware.compute.cores_per_socket ||
        compute.memory_mb !== hardware.compute.memory_mb ||
        compute.nested_hv_enabled !== hardware.compute.nested_hv_enabled;

    const totalDiskGB = hardware.disks.reduce((acc, d) => acc + d.capacity_gb, 0);
    const memoryGB = Math.round(compute.memory_mb / 1024);

    const tabs: { id: TabType; label: string; icon: React.ReactNode; badge?: string }[] = [
        { id: 'compute', label: 'Compute', icon: <Cpu className="w-3.5 h-3.5" /> },
        { id: 'storage', label: 'Storage', icon: <HardDrive className="w-3.5 h-3.5" />, badge: `${hardware.disks.length}` },
        { id: 'snapshots', label: 'Snapshots', icon: <Camera className="w-3.5 h-3.5" />, badge: snapshots.length > 0 ? `${snapshots.length}` : undefined },
        { id: 'advanced', label: 'Advanced', icon: <Settings2 className="w-3.5 h-3.5" /> },
    ];

    return (
        <div className="w-[420px] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Compact Header */}
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-b border-white/10">
                <div className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        {isEditingName ? (
                            <input
                                type="text"
                                value={vmNameEdit}
                                onChange={e => setVmNameEdit(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleRename()}
                                onBlur={handleRename}
                                autoFocus
                                className="w-full bg-slate-800 border border-purple-500/50 rounded-lg px-2 py-1 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        ) : (
                            <h3 
                                className="text-sm font-bold text-white truncate cursor-pointer hover:text-purple-300 transition-colors"
                                onDoubleClick={() => { setVmNameEdit(hardware.vm_name); setIsEditingName(true); }}
                                title="Double-click to rename"
                            >
                                {hardware.vm_name}
                            </h3>
                        )}
                        <p className="text-[10px] text-slate-400 truncate">{hardware.guest_os}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={clsx(
                            "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold",
                            hardware.power_state === 'On' 
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                                : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                        )}>
                            <Power className="w-3 h-3" />
                            {hardware.power_state}
                        </span>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>
                </div>
                
                {/* Quick Stats Row */}
                <div className="px-3 pb-3 grid grid-cols-4 gap-2">
                    {[
                        { label: 'CPU', value: `${compute.num_cpus}`, unit: 'vCPU', color: 'text-blue-400' },
                        { label: 'RAM', value: `${memoryGB}`, unit: 'GB', color: 'text-emerald-400' },
                        { label: 'Disk', value: `${totalDiskGB}`, unit: 'GB', color: 'text-amber-400' },
                        { label: 'NICs', value: `${hardware.nics.length}`, unit: '', color: 'text-purple-400' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-slate-800/50 rounded-lg p-2 text-center border border-white/5">
                            <p className={clsx("text-lg font-black", stat.color)}>{stat.value}<span className="text-[10px] ml-0.5">{stat.unit}</span></p>
                            <p className="text-[9px] text-slate-500 uppercase tracking-wider">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Tab Navigation */}
            <div className="flex border-b border-white/10 bg-slate-800/30">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-all relative",
                            activeTab === tab.id 
                                ? "text-purple-400" 
                                : "text-slate-500 hover:text-slate-300"
                        )}
                    >
                        {tab.icon}
                        <span className="hidden sm:inline">{tab.label}</span>
                        {tab.badge && (
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-purple-500 rounded-full text-[9px] text-white flex items-center justify-center">
                                {tab.badge}
                            </span>
                        )}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-purple-500 rounded-full" />
                        )}
                    </button>
                ))}
            </div>
            
            {/* Tab Content */}
            <div className="p-3 max-h-[400px] overflow-y-auto space-y-3">
                {/* COMPUTE TAB */}
                {activeTab === 'compute' && (
                    <>
                        {hardware.power_state === 'On' && (
                            <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                <p className="text-[11px] text-amber-400">Some changes require VM to be powered off</p>
                            </div>
                        )}
                        
                        {/* CPU Section */}
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <Cpu className="w-4 h-4 text-blue-400" />
                                CPU Configuration
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-slate-500 mb-1 block">vCPUs</label>
                                    <div className="flex gap-1">
                                        {[1, 2, 4, 8].map(n => (
                                            <button
                                                key={n}
                                                onClick={() => setCompute({...compute, num_cpus: n})}
                                                className={clsx(
                                                    "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
                                                    compute.num_cpus === n
                                                        ? "bg-blue-500 text-white"
                                                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                                                )}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 mb-1 block">Custom</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={128}
                                        value={compute.num_cpus}
                                        onChange={e => setCompute({...compute, num_cpus: parseInt(e.target.value) || 1})}
                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                        
                        {/* Memory Section */}
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <MemoryStick className="w-4 h-4 text-emerald-400" />
                                Memory
                            </div>
                            <div className="grid grid-cols-6 gap-1">
                                {[2, 4, 8, 16, 32, 64].map(gb => (
                                    <button
                                        key={gb}
                                        onClick={() => setCompute({...compute, memory_mb: gb * 1024})}
                                        className={clsx(
                                            "py-2 rounded-lg text-xs font-bold transition-all",
                                            memoryGB === gb
                                                ? "bg-emerald-500 text-white"
                                                : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                                        )}
                                    >
                                        {gb}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min={1}
                                    max={512}
                                    value={memoryGB}
                                    onChange={e => setCompute({...compute, memory_mb: parseInt(e.target.value) * 1024})}
                                    className="flex-1 accent-emerald-500"
                                />
                                <input
                                    type="number"
                                    min={1}
                                    max={512}
                                    value={memoryGB}
                                    onChange={e => setCompute({...compute, memory_mb: (parseInt(e.target.value) || 1) * 1024})}
                                    className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-emerald-400 font-bold text-center"
                                />
                                <span className="text-xs text-slate-500">GB</span>
                            </div>
                        </div>
                        
                        {/* Nested Virtualization */}
                        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-white/5">
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-purple-400" />
                                <span className="text-xs font-medium text-white">Nested Virtualization</span>
                            </div>
                            <button
                                onClick={() => setCompute({...compute, nested_hv_enabled: !compute.nested_hv_enabled})}
                                className={clsx(
                                    "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                                    compute.nested_hv_enabled 
                                        ? "bg-purple-500 text-white" 
                                        : "bg-slate-700 text-slate-400"
                                )}
                            >
                                {compute.nested_hv_enabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        
                        {hasComputeChanges && (
                            <button
                                onClick={handleSaveCompute}
                                disabled={isSaving}
                                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                            >
                                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Apply Changes
                            </button>
                        )}
                    </>
                )}
                
                {/* STORAGE TAB */}
                {activeTab === 'storage' && (
                    <div className="space-y-2">
                        {hardware.disks.map(disk => (
                            <div key={disk.key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-white/5 group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                        <Database className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white">{disk.label}</p>
                                        <p className="text-[10px] text-slate-500">{disk.capacity_gb} GB • {disk.datastore}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemoveDisk(disk.key, disk.label)}
                                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-lg transition-all"
                                >
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                            </div>
                        ))}
                        
                        {/* CD/DVD */}
                        {hardware.cdroms?.map((cdrom, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                        <Disc className="w-4 h-4 text-cyan-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white">{cdrom.label}</p>
                                        <p className="text-[10px] text-slate-500 truncate max-w-[180px]">{cdrom.iso_path || 'No media'}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {showAddDisk ? (
                            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-3 animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-slate-500 mb-1 block">Size (GB)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={newDisk.size_gb}
                                            onChange={e => setNewDisk({...newDisk, size_gb: parseInt(e.target.value) || 40})}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 mb-1 block">Datastore</label>
                                        <select
                                            value={newDisk.datastore_name}
                                            onChange={e => setNewDisk({...newDisk, datastore_name: e.target.value})}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white"
                                        >
                                            {datastores.map(ds => (
                                                <option key={ds.name} value={ds.name}>{ds.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setShowAddDisk(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-400">
                                        Cancel
                                    </button>
                                    <button onClick={handleAddDisk} disabled={isSaving} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                                        {isSaving ? 'Adding...' : 'Add Disk'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowAddDisk(true)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-700 hover:border-blue-500/50 rounded-xl text-xs font-bold text-slate-500 hover:text-blue-400 transition-all"
                            >
                                <Plus className="w-4 h-4" />
                                Add Disk
                            </button>
                        )}
                    </div>
                )}
                
                {/* SNAPSHOTS TAB */}
                {activeTab === 'snapshots' && (
                    <div className="space-y-2">
                        {snapshots.length === 0 ? (
                            <div className="text-center py-8">
                                <Camera className="w-12 h-12 text-slate-700 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">No snapshots</p>
                            </div>
                        ) : (
                            snapshots.map(snap => (
                                <div key={snap.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-white/5 group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                            <Camera className="w-4 h-4 text-amber-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-white">{snap.name}</p>
                                            <p className="text-[10px] text-slate-500">
                                                {snap.created ? new Date(snap.created).toLocaleDateString() : 'Unknown'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleRevertSnapshot(snap.id, snap.name)}
                                            className="p-1.5 hover:bg-amber-500/20 rounded-lg"
                                            title="Revert"
                                        >
                                            <RotateCcw className="w-4 h-4 text-amber-400" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteSnapshot(snap.id, snap.name)}
                                            className="p-1.5 hover:bg-red-500/20 rounded-lg"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                        
                        {showCreateSnapshot ? (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3 animate-in slide-in-from-top-2">
                                <input
                                    type="text"
                                    value={newSnapshot.name}
                                    onChange={e => setNewSnapshot({...newSnapshot, name: e.target.value})}
                                    placeholder="Snapshot name..."
                                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                                />
                                <div className="flex gap-2">
                                    <button onClick={() => setShowCreateSnapshot(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-400">
                                        Cancel
                                    </button>
                                    <button onClick={handleCreateSnapshot} disabled={isSaving} className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                                        {isSaving ? 'Creating...' : 'Create'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowCreateSnapshot(true)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl text-xs font-bold text-slate-500 hover:text-amber-400 transition-all"
                            >
                                <Plus className="w-4 h-4" />
                                Create Snapshot
                            </button>
                        )}
                    </div>
                )}
                
                {/* ADVANCED TAB */}
                {activeTab === 'advanced' && (
                    <div className="space-y-3">
                        {/* Firmware */}
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                            <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-400 uppercase">
                                <Shield className="w-4 h-4 text-blue-400" />
                                Firmware
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                                    <p className="text-[10px] text-slate-500">Type</p>
                                    <p className="text-xs font-bold text-blue-400">{hardware.firmware.type.toUpperCase()}</p>
                                </div>
                                <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                                    <p className="text-[10px] text-slate-500">Secure Boot</p>
                                    <p className={clsx("text-xs font-bold", hardware.firmware.secure_boot_enabled ? "text-emerald-400" : "text-slate-500")}>
                                        {hardware.firmware.secure_boot_enabled ? 'ON' : 'OFF'}
                                    </p>
                                </div>
                                <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                                    <p className="text-[10px] text-slate-500">TPM 2.0</p>
                                    <p className={clsx("text-xs font-bold", hardware.firmware.has_tpm ? "text-emerald-400" : "text-slate-500")}>
                                        {hardware.firmware.has_tpm ? 'YES' : 'NO'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Console */}
                        <button
                            onClick={() => window.open(`/api/console/template/${connectionId}/${vmMoid}`, '_blank')}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all"
                        >
                            <Terminal className="w-4 h-4" />
                            Open Console
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VMSettingsPanel;
