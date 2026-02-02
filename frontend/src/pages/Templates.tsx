import React, { useEffect, useState } from 'react';
import api from '../api';
import { 
    Plus, Search, Server, Trash2, Edit, Check, Clock, PlayCircle, HardDrive, Cpu, 
    Layout as LayoutTemplate, RefreshCw, Layers, Network as NetworkIcon
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ProviderSelectionModal from '../components/templates/ProviderSelectionModal';
import NetworkDesigner from './NetworkDesigner';
import { getProviderIcon } from '../components/ProviderIcons';
import clsx from 'clsx';

interface TemplateVM {
    id?: number;
    vm_name: string;
    vm_moid: string;
    guest_os: string | null;
    cpu: number;
    memory_mb: number;
    is_template: boolean;
    is_primary: boolean;
    access_protocol: string;
    access_port: number | null;
}

interface TemplateModel {
    id: number;
    name: string;
    description: string | null;
    icon: string;
    provider: string;
    is_active: boolean;
    status: string; // source_only, preparing, ready, configured
    vms: TemplateVM[];
    connection_id: number | null;
    created_at: string | null;
    updated_at: string | null;
}

interface InventoryVM {
    name: string;
    moid: string;
    guest: string;
    num_cpu: number;
    memory_mb: number;
    is_template: boolean;
    power_state: string;
}

const Templates: React.FC = () => {
    const { showToast } = useToast();
    const [templates, setTemplates] = useState<TemplateModel[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Modal states
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [vmSelectorOpen, setVmSelectorOpen] = useState(false);
    const [providerModalOpen, setProviderModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateModel | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDesignerOpen, setIsDesignerOpen] = useState(false);

    // vSphere Inventory
    const [inventory, setInventory] = useState<any>(null);
    const [loadingInventory, setLoadingInventory] = useState(false);
    const [inventorySearch, setInventorySearch] = useState('');

    // Form state
    const [form, setForm] = useState({
        name: '',
        description: '',
        provider: 'vSphere',
        connection_id: null as number | null,
        is_active: true,
    });
    const [connections, setConnections] = useState<any[]>([]);
    const [selectedVMs, setSelectedVMs] = useState<TemplateVM[]>([]);

    useEffect(() => {
        fetchTemplates();
        fetchConnections();
    }, []);

    const fetchConnections = async () => {
        try {
            const res = await api.get('/infrastructure-connections/');
            setConnections(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error('Failed to fetch connections:', e);
        }
    };

    const fetchTemplates = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/templates/');
            setTemplates(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error("Failed to fetch templates", e);
            showToast('Failed to load templates', 'error');
            setTemplates([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchInventory = async () => {
        setLoadingInventory(true);
        try {
            if (form.provider === 'vSphere') {
                if (!form.connection_id) {
                    showToast(`Please select a ${form.provider} connection`, 'warning');
                    setInventory(null);
                    return;
                }
                const url = `/infrastructure-connections/${form.connection_id}/inventory`;
                const res = await api.get(url);
                if (res.data.success) {
                    setInventory(res.data.data);
                }
            } else if (form.provider === 'Proxmox') {
                if (!form.connection_id) {
                    showToast(`Please select a ${form.provider} connection`, 'warning');
                    setInventory(null);
                    return;
                }
                const url = `/infrastructure-connections/${form.connection_id}/inventory`;
                const res = await api.get(url);
                if (res.data.success) {
                    setInventory(res.data.data);
                }
            } else {
                setInventory(null);
            }
        } catch (e) {
            showToast(`Failed to load ${form.provider} inventory`, 'error');
        } finally {
            setLoadingInventory(false);
        }
    };

    const syncInventory = async () => {
        if (form.provider !== 'vSphere' && form.provider !== 'Proxmox') {
            showToast(`Sync for ${form.provider} not implemented yet`, 'info');
            return;
        }

        setLoadingInventory(true);
        try {
            if (!form.connection_id) {
                showToast(`Please select a ${form.provider} connection`, 'warning');
                return;
            }
            const url = `/infrastructure-connections/${form.connection_id}/sync`;
            const res = await api.post(url);
            if (res.data.success) {
                showToast('Inventory synced!', 'success');
                await fetchInventory();
            } else {
                showToast(res.data.message || 'Sync failed', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Sync failed', 'error');
        } finally {
            setLoadingInventory(false);
        }
    };

    const resetForm = () => {
        setForm({
            name: '',
            description: '',
            provider: 'vSphere',
            connection_id: null,
            is_active: true,
        });
        setSelectedVMs([]);
    };

    const handleCreate = async () => {
        if (!form.name.trim()) {
            showToast('Please enter a template name', 'warning');
            return;
        }
        if (selectedVMs.length === 0) {
            showToast('Please select at least one VM', 'warning');
            return;
        }
        setIsSubmitting(true);
        try {
            await api.post('/templates/', {
                ...form,
                vms: selectedVMs.map(vm => ({
                    vm_name: vm.vm_name,
                    vm_moid: vm.vm_moid,
                    guest_os: vm.guest_os,
                    cpu: vm.cpu,
                    memory_mb: vm.memory_mb,
                    is_template: vm.is_template,
                    is_primary: vm.is_primary,
                    access_protocol: vm.access_protocol,
                    access_port: vm.access_port,
                }))
            });
            showToast('Template created successfully', 'success');
            setCreateModalOpen(false);
            resetForm();
            fetchTemplates();
        } catch {
            showToast('Failed to create template', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = async () => {
        if (!selectedTemplate) return;
        setIsSubmitting(true);
        try {
            await api.put(`/templates/${selectedTemplate.id}`, form);
            const currentVMs = selectedTemplate.vms || [];
            const currentMoids = currentVMs.map(v => v.vm_moid);
            const newMoids = selectedVMs.map(v => v.vm_moid);

            for (const vm of currentVMs) {
                if (!newMoids.includes(vm.vm_moid)) {
                    await api.delete(`/templates/${selectedTemplate.id}/vms/${vm.id}`);
                }
            }

            for (const vm of selectedVMs) {
                if (!currentMoids.includes(vm.vm_moid)) {
                    await api.post(`/templates/${selectedTemplate.id}/vms`, {
                        vm_name: vm.vm_name,
                        vm_moid: vm.vm_moid,
                        guest_os: vm.guest_os,
                        cpu: vm.cpu,
                        memory_mb: vm.memory_mb,
                        is_template: vm.is_template,
                        is_primary: vm.is_primary,
                        access_protocol: vm.access_protocol,
                        access_port: vm.access_port,
                    });
                }
            }

            showToast('Template updated successfully', 'success');
            setEditModalOpen(false);
            setSelectedTemplate(null);
            fetchTemplates();
        } catch {
            showToast('Failed to update template', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedTemplate) return;
        try {
            await api.delete(`/templates/${selectedTemplate.id}`);
            showToast('Template deleted successfully', 'success');
            setDeleteModalOpen(false);
            setSelectedTemplate(null);
            fetchTemplates();
        } catch {
            showToast('Failed to delete template', 'error');
        }
    };

    const handlePrepare = async (templateId: number) => {
        try {
            showToast('Starting template preparation...', 'info');
            const res = await api.post(`/templates/${templateId}/prepare`);
            if (res.data.success) {
                showToast('Template prepared successfully', 'success');
                fetchTemplates(); // Refresh to show new status
            } else {
                showToast(res.data.message || 'Preparation failed', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to prepare template', 'error');
            fetchTemplates();
        }
    };

    const openEditModal = (tpl: TemplateModel) => {
        setSelectedTemplate(tpl);
        setForm({
            name: tpl.name,
            description: tpl.description || '',
            provider: tpl.provider || 'vSphere',
            connection_id: tpl.connection_id || null,
            is_active: tpl.is_active,
        });
        setSelectedVMs(tpl.vms || []);
        setEditModalOpen(true);
    };

    const openDeleteModal = (tpl: TemplateModel) => {
        setSelectedTemplate(tpl);
        setDeleteModalOpen(true);
    };

    const openVMSelector = () => {
        setVmSelectorOpen(true);
        // Always fetch fresh inventory when opening the selector
        fetchInventory();
    };

    const toggleVMSelection = (vm: InventoryVM) => {
        setSelectedVMs(prevSelected => {
            const exists = prevSelected.find(v => v.vm_moid === vm.moid);
            if (exists) {
                return prevSelected.filter(v => v.vm_moid !== vm.moid);
            } else {
                return [...prevSelected, {
                    vm_name: vm.name,
                    vm_moid: vm.moid,
                    guest_os: vm.guest,
                    cpu: vm.num_cpu,
                    memory_mb: vm.memory_mb,
                    is_template: vm.is_template,
                    is_primary: prevSelected.length === 0,
                    access_protocol: 'rdp',
                    access_port: 3389,
                }];
            }
        });
    };

    const setPrimaryVM = (moid: string) => {
        setSelectedVMs(selectedVMs.map(vm => ({
            ...vm,
            is_primary: vm.vm_moid === moid
        })));
    };

    const removeSelectedVM = (moid: string) => {
        setSelectedVMs(selectedVMs.filter(v => v.vm_moid !== moid));
    };

    const filteredTemplates = (Array.isArray(templates) ? templates : []).filter(tpl =>
        tpl.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tpl.description && tpl.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const filteredInventoryVMs = inventory?.vms?.filter((vm: InventoryVM) =>
        vm.is_template && vm.name.toLowerCase().includes(inventorySearch.toLowerCase())
    ) || [];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                          <Layers className="w-5 h-5 text-purple-500" />
                      </div>
                      <h1 className="text-3xl font-extrabold tracking-tight text-primary">Catalog</h1>
                  </div>
                  <p className="text-secondary font-medium pl-10">
                    Manage and deploy <span className="text-purple-500 font-bold">environment blueprints</span> for your labs.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group max-w-xs transition-all duration-300 focus-within:max-w-md">
                        <Search className="w-5 h-5 text-secondary absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-purple-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Find templates..."
                            className="input pl-12 bg-secondary/30 border-theme/50 focus:border-purple-500/50 rounded-2xl w-full"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => { 
                            resetForm(); 
                            setProviderModalOpen(true); 
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-bold shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">New Template</span>
                    </button>
                </div>
            </div>

            {isDesignerOpen && selectedTemplate ? (
                <NetworkDesigner 
                    templateId={selectedTemplate.id} 
                    onBack={() => {
                        setIsDesignerOpen(false);
                        setSelectedTemplate(null);
                        fetchTemplates();
                    }} 
                />
            ) : (
                <>
                {/* Templates Content */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="glass rounded-2xl p-4 border border-theme animate-pulse flex items-center gap-4">
                            <div className="h-10 w-10 bg-secondary/20 rounded-xl"></div>
                            <div className="flex-1">
                                <div className="h-4 bg-secondary/20 rounded-full w-1/3 mb-2"></div>
                                <div className="h-3 bg-secondary/20 rounded-full w-1/2"></div>
                            </div>
                            <div className="h-6 w-16 bg-secondary/20 rounded-full"></div>
                        </div>
                    ))}
                </div>
            ) : filteredTemplates.length === 0 ? (
                <div className="glass rounded-[3rem] border border-dashed border-theme p-20 text-center shadow-xl">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-[2rem] bg-secondary/20 flex items-center justify-center border border-theme">
                        <LayoutTemplate className="w-12 h-12 text-secondary/50" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-primary mb-3 tracking-tight">
                        {searchTerm ? "No blueprints match your search" : "Your catalog is empty"}
                    </h3>
                    <p className="text-secondary font-medium max-w-sm mx-auto mb-8">
                        {searchTerm
                            ? "Try refining your keywords or clear the search to see all templates."
                            : "Blueprints define the structure, network, and resources for your training environments."}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                    {filteredTemplates.map(tpl => (
                        <TemplateCard
                            key={tpl.id}
                            tpl={tpl}
                            onEdit={() => openEditModal(tpl)}
                            onDelete={() => openDeleteModal(tpl)}
                            onDesign={() => {
                                setSelectedTemplate(tpl);
                                setIsDesignerOpen(true);
                            }}
                            onRedeploy={() => handlePrepare(tpl.id)}
                            onPrepare={() => handlePrepare(tpl.id)}
                        />
                    ))}
                </div>
            )}

            {/* Creation Modal */}
            <Modal
                isOpen={createModalOpen || editModalOpen}
                onClose={() => { setCreateModalOpen(false); setEditModalOpen(false); }}
                title={createModalOpen ? "New Blueprint" : "Edit Blueprint"}
                icon={<LayoutTemplate className="w-4 h-4 text-purple-500" />}
                maxWidth="md"
            >
                <div className="space-y-4">
                    {/* Row 1: Name + Status */}
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Name</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 text-sm font-medium"
                                placeholder="e.g. Enterprise Lab v3"
                                value={form.name}
                                onChange={e => setForm({...form, name: e.target.value})}
                            />
                        </div>
                        <div className="w-24">
                            <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Status</label>
                            <button
                                type="button"
                                onClick={() => setForm({...form, is_active: !form.is_active})}
                                className={clsx(
                                    "w-full px-3 py-2 rounded-lg text-xs font-bold border transition-all",
                                    form.is_active 
                                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-500" 
                                        : "bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-secondary"
                                )}
                            >
                                {form.is_active ? 'Active' : 'Draft'}
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Provider + Connection */}
                    <div className="flex gap-3">
                        <div className="w-28">
                            <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Provider</label>
                            <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-900 dark:text-slate-100">
                                {form.provider}
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Connection</label>
                            <select
                                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-900 dark:text-slate-100"
                                value={form.connection_id || ''}
                                onChange={e => {
                                    setForm({...form, connection_id: e.target.value ? parseInt(e.target.value) : null});
                                    setSelectedVMs([]);
                                    setInventory(null);
                                }}
                            >
                                <option value="" disabled className="bg-slate-900 text-white">Select Connection</option>
                                {connections.filter(c => c.provider === form.provider).map(c => (
                                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">{c.name} ({c.host})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Row 3: Description */}
                    <div>
                        <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Description (optional)</label>
                        <textarea
                            className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 min-h-[60px] resize-none"
                            placeholder="Brief description..."
                            value={form.description}
                            onChange={e => setForm({...form, description: e.target.value})}
                        />
                    </div>

                    {/* VMs Section */}
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-primary">VMs ({selectedVMs.length})</span>
                            <button 
                                type="button"
                                onClick={openVMSelector}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                                Select VMs
                            </button>
                        </div>

                        {selectedVMs.length > 0 ? (
                            <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                {selectedVMs.map(vm => (
                                    <div key={vm.vm_moid} className="flex items-center gap-2 px-2 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg text-xs">
                                        <Server className="w-3 h-3 text-purple-400" />
                                        <span className="flex-1 font-medium text-gray-900 dark:text-white truncate">{vm.vm_name}</span>
                                        
                                        <button onClick={() => removeSelectedVM(vm.vm_moid)} className="text-red-400 hover:text-red-500">×</button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-4 text-center text-xs text-secondary border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
                                No VMs selected
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <button 
                        onClick={createModalOpen ? handleCreate : handleEdit}
                        disabled={isSubmitting || !form.name || !form.connection_id || selectedVMs.length === 0}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold text-sm shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.01] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                {createModalOpen ? "Create Template" : "Save Changes"}
                            </>
                        )}
                    </button>
                </div>
            </Modal>

            {/* VM Selector Modal - Compact Table Design */}
            <Modal 
                isOpen={vmSelectorOpen} 
                onClose={() => setVmSelectorOpen(false)} 
                title="Select VMs"
                icon={<Server className="w-4 h-4 text-purple-500" />}
                maxWidth="md"
            >
                <div className="space-y-2">
                    {/* Search & Sync Row - Compact */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="w-3 h-3 text-secondary absolute left-2 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text"
                                placeholder="Filter VMs..."
                                className="w-full pl-7 pr-2 py-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white"
                                value={inventorySearch}
                                onChange={e => setInventorySearch(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={syncInventory}
                            disabled={loadingInventory}
                            className="p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-xs transition-all"
                        >
                            <RefreshCw className={clsx("w-3.5 h-3.5", loadingInventory && "animate-spin")} />
                        </button>
                    </div>

                    {/* Compact Table */}
                    <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-900/50">
                        {loadingInventory ? (
                            <div className="p-4 text-center text-xs text-secondary">Loading inventory...</div>
                        ) : filteredInventoryVMs.length > 0 ? (
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                                    <tr className="border-b border-slate-200 dark:border-slate-700">
                                        <th className="w-8 p-1.5"></th>
                                        <th className="text-left p-1.5 font-medium text-secondary">Name</th>
                                        <th className="text-center p-1.5 font-medium text-secondary w-16">CPU</th>
                                        <th className="text-center p-1.5 font-medium text-secondary w-16">RAM</th>
                                        <th className="text-center p-1.5 font-medium text-secondary w-16">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInventoryVMs.map((vm: InventoryVM) => {
                                        const isSelected = selectedVMs.some(v => v.vm_moid === vm.moid);
                                        return (
                                            <tr 
                                                key={vm.moid}
                                                onClick={() => toggleVMSelection(vm)}
                                                className={clsx(
                                                    "cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-800",
                                                    isSelected 
                                                        ? "bg-purple-500/10" 
                                                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                                )}
                                            >
                                                <td className="p-1.5 text-center">
                                                    <div className={clsx(
                                                        "w-4 h-4 rounded flex items-center justify-center border mx-auto",
                                                        isSelected 
                                                            ? "bg-purple-500 border-purple-500" 
                                                            : "bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600"
                                                    )}>
                                                        {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                                                    </div>
                                                </td>
                                                <td className="p-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-medium text-slate-900 dark:text-white truncate max-w-[180px]">
                                                            {vm.name}
                                                        </span>
                                                        {vm.is_template && (
                                                            <span className="px-1 py-0.5 text-[8px] font-bold bg-purple-500/20 text-purple-500 rounded">TPL</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-1.5 text-center text-slate-500 dark:text-slate-400">{vm.num_cpu}</td>
                                                <td className="p-1.5 text-center text-slate-500 dark:text-slate-400">{Math.round(vm.memory_mb/1024)}GB</td>
                                                <td className="p-1.5 text-center">
                                                    <span className={clsx(
                                                        "inline-block w-2 h-2 rounded-full",
                                                        vm.power_state === 'poweredOn' ? "bg-green-500" : "bg-slate-400"
                                                    )} title={vm.power_state === 'poweredOn' ? 'Online' : 'Offline'} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div className="py-6 text-center text-xs text-secondary">No VMs found</div>
                        )}
                    </div>

                    {/* Footer - Compact */}
                    <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] font-medium text-secondary">{selectedVMs.length} selected</span>
                        <button 
                            onClick={() => setVmSelectorOpen(false)}
                            className="px-3 py-1.5 bg-purple-600 text-white rounded font-medium text-xs hover:bg-purple-500 transition-colors"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Modal */}
            <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Decommission" maxWidth="sm">
                <div className="space-y-6 text-center">
                    <div className="w-20 h-20 mx-auto rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                        <Trash2 className="w-10 h-10 text-red-500" />
                    </div>
                    <div>
                        <h4 className="text-xl font-extrabold text-primary mb-2">Delete Blueprint?</h4>
                        <p className="text-secondary font-medium">This action cannot be undone. All VM configurations associated with <span className="text-primary font-bold">{selectedTemplate?.name}</span> will be purged.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <button onClick={() => setDeleteModalOpen(false)} className="px-6 py-3 bg-secondary/50 rounded-2xl font-bold text-secondary hover:bg-secondary transition-all">
                            Keep it
                        </button>
                        <button 
                            onClick={handleDelete} 
                            className="px-6 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-500 shadow-lg shadow-red-500/20 transition-all"
                        >
                            Yes, Purge
                        </button>
                    </div>
                </div>
            </Modal>
            
            {/* Provider Selection Modal */}
            <ProviderSelectionModal 
                isOpen={providerModalOpen}
                onClose={() => setProviderModalOpen(false)}
                onSelect={(providerId) => {
                    setProviderModalOpen(false);
                    setForm({ ...form, provider: providerId });
                    setCreateModalOpen(true);
                }}
            />

                </>
            )}
        </div>
    );
};

// --- MODERN SUB-COMPONENTS ---

const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
);

const TemplateCard: React.FC<{ 
    tpl: TemplateModel; 
    onEdit: () => void; 
    onDelete: () => void;
    onDesign?: () => void;
    onRedeploy?: () => void;
    onPrepare?: () => void;
}> = ({ tpl, onEdit, onDelete, onDesign, onRedeploy, onPrepare }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showRedeployConfirm, setShowRedeployConfirm] = useState(false);
    const ProviderIcon = getProviderIcon(tpl.provider);
    
    return (
        <div className="bg-secondary/20 rounded-lg border border-theme hover:border-purple-500/40 transition-all group overflow-hidden">
            {/* Redeploy Confirmation Modal */}
            {showRedeployConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRedeployConfirm(false)}>
                    <div className="glass rounded-3xl border border-theme shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
                                    <RefreshCw className="w-6 h-6 text-cyan-400" />
                                </div>
                                <h3 className="text-xl font-bold text-primary">Redeploy Template</h3>
                            </div>
                            <p className="text-secondary font-medium">
                                This will re-clone the source VMs. Useful after making changes to the original templates in vSphere. Continue?
                            </p>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowRedeployConfirm(false)}
                                    className="flex-1 px-4 py-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl font-bold text-secondary transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setShowRedeployConfirm(false);
                                        onRedeploy && onRedeploy();
                                    }}
                                    className="flex-1 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-500/20 transition-all"
                                >
                                    Redeploy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Compact Header */}
            <div 
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/10 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <button className="text-secondary p-0.5">
                    {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                </button>

                <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <ProviderIcon className="w-4 h-4 text-purple-400" />
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-primary truncate">{tpl.name}</h3>
                    <span className="text-xs text-secondary">{tpl.provider || 'vSphere'} • {tpl.vms?.length || 0} VMs</span>
                </div>

                <div className={clsx(
                    "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                    tpl.status === 'ready' || tpl.status === 'configured' ? "bg-emerald-500/15 text-emerald-400" :
                    tpl.status === 'preparing' ? "bg-amber-500/15 text-amber-400" :
                    "bg-slate-500/15 text-slate-400"
                )}>
                    {tpl.status?.replace('_', ' ') || 'Source Only'}
                </div>

                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if (tpl.status === 'source_only' || !tpl.status) {
                                onPrepare && onPrepare();
                            } else {
                                setShowRedeployConfirm(true);
                            }
                        }} 
                        disabled={tpl.status === 'preparing'}
                        className={clsx(
                            "p-1.5 transition-colors rounded",
                            tpl.status === 'source_only' || !tpl.status 
                                ? "text-amber-400 hover:bg-amber-500/10" 
                                : "text-cyan-400 hover:bg-cyan-500/10",
                            tpl.status === 'preparing' && "opacity-50 cursor-not-allowed"
                        )}
                        title={tpl.status === 'source_only' || !tpl.status ? "Prepare Template (Clone Source)" : "Redeploy (Re-clone from source)"}
                    >
                        {tpl.status === 'preparing' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 
                         (tpl.status === 'source_only' || !tpl.status) ? <PlayCircle className="w-3.5 h-3.5" /> : 
                         <RefreshCw className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onDesign && onDesign();
                        }} 
                        className="p-1.5 text-secondary hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                        title="Design Topology"
                    >
                        <NetworkIcon className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onEdit} className="p-1.5 text-secondary hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onDelete} className="p-1.5 text-secondary hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t border-theme bg-secondary/10 px-3 py-2 space-y-2 animate-in slide-in-from-top-1 duration-150">
                    {tpl.description && (
                        <p className="text-xs text-secondary pl-2 border-l-2 border-purple-500/30">{tpl.description}</p>
                    )}
                    <div className="space-y-1">
                        {tpl.vms?.map(vm => (
                                                        <div key={vm.vm_moid} className="flex items-center gap-2 bg-secondary/20 px-2 py-1.5 rounded text-xs">
                                <div className="w-1 h-4 rounded-full bg-purple-500/40" />
                                <span className="font-medium text-primary truncate flex-1">{vm.vm_name}</span>
                                <span className="text-secondary flex items-center gap-1"><Cpu className="w-3 h-3" />{vm.cpu}</span>
                                <span className="text-secondary flex items-center gap-1"><HardDrive className="w-3 h-3" />{Math.round(vm.memory_mb/1024)}G</span>
                            </div>
                        ))}
                        {(!tpl.vms || tpl.vms.length === 0) && <div className="text-center py-2 text-secondary text-xs">No VMs</div>}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-secondary pt-1">
                        <Clock className="w-3 h-3" />
                        <span>Updated: {tpl.updated_at ? new Date(tpl.updated_at).toLocaleDateString() : 'Never'}</span>
                    </div>
                </div>
            )}
        </div>
    );
};



export default Templates;
