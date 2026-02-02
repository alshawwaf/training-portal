import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { 
    Network, Server, Cpu, RefreshCw, Check,
    Link2, Unplug, ChevronDown, ChevronRight, AlertCircle
} from 'lucide-react';
import clsx from 'clsx';

interface Network {
    id: number;
    name: string;
    network_identifier: string | null;
    is_isolated: boolean;
}

interface NICInfo {
    name: string;
    label: string;
    current_network?: string;
}

interface VMWithNICs {
    id: number;
    vm_name: string;
    vm_moid: string;
    nics: NICInfo[];
    network_mappings?: Array<{
        id: number;
        network_id: number;
        network_name: string;
        nic_name: string;
    }>;
}

interface NICMapping {
    vm_id: number;
    nic_name: string;
    network_id: number | null;
}

interface TemplateNetworkModalProps {
    isOpen: boolean;
    onClose: () => void;
    templateId: number;
    templateName: string;
}

const TemplateNetworkModal: React.FC<TemplateNetworkModalProps> = ({
    isOpen,
    onClose,
    templateId,
    templateName
}) => {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [vms, setVMs] = useState<VMWithNICs[]>([]);
    const [networks, setNetworks] = useState<Network[]>([]);
    const [mappings, setMappings] = useState<Map<string, number | null>>(new Map());
    const [expandedVMs, setExpandedVMs] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen && templateId) {
            loadData();
        }
    }, [isOpen, templateId]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load networks and template VM networks in parallel
            const [networksRes, vmNetworksRes] = await Promise.all([
                api.get('/networks/'),
                api.get(`/networks/templates/${templateId}/vm-networks`)
            ]);

            setNetworks(networksRes.data);
            const loadedVMs = vmNetworksRes.data.vms || [];
            setVMs(loadedVMs);

            // Initialize mappings from existing data
            const newMappings = new Map<string, number | null>();
            for (const vm of loadedVMs) {
                for (const mapping of vm.network_mappings || []) {
                    const key = `${vm.id}:${mapping.nic_name}`;
                    newMappings.set(key, mapping.network_id);
                }
            }
            setMappings(newMappings);

            // Expand all VMs by default
            // VMs start COLLAPSED by default for cleaner view
            setExpandedVMs(new Set());
            
            // Auto-detect NICs if any VM has no NICs
            const hasVMsWithoutNICs = loadedVMs.some((vm: VMWithNICs) => !vm.nics || vm.nics.length === 0);
            if (hasVMsWithoutNICs && loadedVMs.length > 0) {
                // Automatically detect NICs from infrastructure
                try {
                    const res = await api.get(`/networks/templates/${templateId}/detect-nics`);
                    setVMs(res.data.vms || []);
                    // Keep collapsed after auto-detect
                    setExpandedVMs(new Set());
                } catch (e) {
                    console.warn('Auto NIC detection failed:', e);
                }
            }

        } catch (e) {
            console.error('Failed to load template networks:', e);
            showToast('Failed to load network configuration', 'error');
        } finally {
            setLoading(false);
        }
    };

    const detectNICs = async () => {
        setDetecting(true);
        try {
            const res = await api.get(`/networks/templates/${templateId}/detect-nics`);
            setVMs(res.data.vms || []);
            setExpandedVMs(new Set((res.data.vms || []).map((v: VMWithNICs) => v.id)));
            showToast('NICs detected successfully', 'success');
        } catch (e) {
            showToast('Failed to detect NICs', 'error');
        } finally {
            setDetecting(false);
        }
    };

    const handleMappingChange = (vmId: number, nicName: string, networkId: number | null) => {
        const key = `${vmId}:${nicName}`;
        const newMappings = new Map(mappings);
        if (networkId === null || networkId === 0) {
            newMappings.delete(key);
        } else {
            newMappings.set(key, networkId);
        }
        setMappings(newMappings);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Convert mappings to array format
            const mappingsArray: NICMapping[] = [];
            for (const vm of vms) {
                for (const nic of vm.nics) {
                    const key = `${vm.id}:${nic.name}`;
                    const networkId = mappings.get(key);
                    mappingsArray.push({
                        vm_id: vm.id,
                        nic_name: nic.name,
                        network_id: networkId || null
                    });
                }
            }

            await api.post(`/networks/templates/${templateId}/vm-networks`, {
                mappings: mappingsArray
            });

            showToast('Network mappings saved successfully', 'success');
            onClose();
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to save mappings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleVMExpand = (vmId: number) => {
        const newExpanded = new Set(expandedVMs);
        if (newExpanded.has(vmId)) {
            newExpanded.delete(vmId);
        } else {
            newExpanded.add(vmId);
        }
        setExpandedVMs(newExpanded);
    };

    const getMappedNetwork = (vmId: number, nicName: string): number | null => {
        const key = `${vmId}:${nicName}`;
        return mappings.get(key) || null;
    };

    const getNetworkById = (networkId: number | null): Network | undefined => {
        return networks.find(n => n.id === networkId);
    };

    const totalNICs = vms.reduce((acc, vm) => acc + (vm.nics?.length || 0), 0);
    const mappedNICs = Array.from(mappings.values()).filter(v => v !== null).length;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Configure Template Networks"
            icon={<Network className="w-5 h-5 text-blue-500" />}
            maxWidth="xl"
        >
            <div className="space-y-4">
                {/* Header Info */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-2xl border border-blue-500/20">
                    <div>
                        <h3 className="text-lg font-bold text-primary">{templateName}</h3>
                        <p className="text-xs text-secondary mt-1">
                            Map virtual machine NICs to your defined networks
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-2xl font-black text-blue-500">{mappedNICs}/{totalNICs}</p>
                            <p className="text-[10px] text-secondary uppercase font-bold">NICs Mapped</p>
                        </div>
                        <button
                            onClick={detectNICs}
                            disabled={detecting}
                            className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-xl transition-colors"
                            title="Detect NICs from infrastructure"
                        >
                            <RefreshCw className={clsx("w-5 h-5 text-blue-400", detecting && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {/* VM List */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                ) : vms.length === 0 ? (
                    <div className="text-center py-12 text-secondary">
                        <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="font-semibold">No VMs in this template</p>
                        <p className="text-xs mt-1">Add VMs to the template first</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[450px] overflow-y-auto overflow-x-visible pr-2">
                        {vms.map(vm => (
                            <div key={vm.id} className="glass rounded-2xl border border-theme">
                                {/* VM Header */}
                                <button
                                    onClick={() => toggleVMExpand(vm.id)}
                                    className="w-full flex items-center gap-3 p-4 hover:bg-secondary/10 transition-colors"
                                >
                                    <div className="p-2 rounded-xl bg-indigo-500/10">
                                        <Cpu className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-bold text-primary">{vm.vm_name}</h4>
                                        <p className="text-[10px] text-secondary font-mono">{vm.vm_moid}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded-lg">
                                            {vm.nics?.length || 0} NICs
                                        </span>
                                        {expandedVMs.has(vm.id) ? (
                                            <ChevronDown className="w-5 h-5 text-blue-400" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-blue-400" />
                                        )}
                                    </div>
                                </button>

                                {/* NIC Mappings */}
                                {expandedVMs.has(vm.id) && (
                                    <div className="px-4 pb-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                        {(vm.nics || []).map((nic) => {
                                            const mappedNetworkId = getMappedNetwork(vm.id, nic.name);
                                            const mappedNetwork = getNetworkById(mappedNetworkId);

                                            return (
                                                <div 
                                                    key={`${vm.id}-${nic.name}`}
                                                    className={clsx(
                                                        "flex items-center gap-3 p-3 rounded-xl border transition-all",
                                                        mappedNetworkId 
                                                            ? "bg-emerald-500/5 border-emerald-500/30"
                                                            : "bg-slate-500/5 border-slate-500/20"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2 min-w-[160px]">
                                                        <div className={clsx(
                                                            "w-8 h-8 rounded-lg flex items-center justify-center",
                                                            mappedNetworkId ? "bg-emerald-500/20" : "bg-slate-500/20"
                                                        )}>
                                                            {mappedNetworkId ? (
                                                                <Link2 className="w-4 h-4 text-emerald-400" />
                                                            ) : (
                                                                <Unplug className="w-4 h-4 text-slate-400" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-primary">{nic.name}</p>
                                                            {nic.current_network && (
                                                                <p className="text-[9px] text-secondary">
                                                                    Currently: {nic.current_network}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center text-secondary">
                                                        →
                                                    </div>

                                                    <select
                                                        value={mappedNetworkId || ''}
                                                        onChange={e => handleMappingChange(
                                                            vm.id, 
                                                            nic.name, 
                                                            e.target.value ? parseInt(e.target.value) : null
                                                        )}
                                                        className={clsx(
                                                            "flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-all",
                                                            "focus:outline-none focus:ring-2",
                                                            "[&>option]:bg-slate-800 [&>option]:text-white",
                                                            mappedNetworkId 
                                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 focus:ring-emerald-500/30"
                                                                : "bg-slate-800 border-slate-600 text-white focus:ring-blue-500/30"
                                                        )}
                                                    >
                                                        <option value="">— Not Mapped —</option>
                                                        {networks.map(net => (
                                                            <option key={net.id} value={net.id}>
                                                                {net.name} {net.network_identifier ? `(${net.network_identifier})` : ''}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    {mappedNetwork && (
                                                        <span className={clsx(
                                                            "px-2 py-1 rounded text-[10px] font-bold",
                                                            mappedNetwork.is_isolated 
                                                                ? "bg-purple-500/20 text-purple-400"
                                                                : "bg-blue-500/20 text-blue-400"
                                                        )}>
                                                            {mappedNetwork.is_isolated ? 'Isolated' : 'Shared'}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {(vm.nics || []).length === 0 && (
                                            <div className="flex items-center gap-2 p-3 bg-orange-500/10 rounded-xl text-orange-400 text-sm">
                                                <AlertCircle className="w-4 h-4" />
                                                No NICs detected. Click refresh to detect from infrastructure.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Legend */}
                {networks.length > 0 && (
                    <div className="flex items-center gap-4 p-3 bg-secondary/10 rounded-xl text-[10px]">
                        <span className="text-secondary font-bold uppercase">Legend:</span>
                        <span className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-secondary">Mapped</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-slate-400" />
                            <span className="text-secondary">Unmapped</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">Isolated</span>
                            <span className="text-secondary">= Per-student VLAN</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">Shared</span>
                            <span className="text-secondary">= Same for all</span>
                        </span>
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-theme">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-secondary/10 hover:bg-secondary/20 text-primary rounded-xl font-bold transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                    >
                        {saving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
                        Save Mappings
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default TemplateNetworkModal;
