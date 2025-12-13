import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Search, Edit, Trash2, Layers, Save, Server, RefreshCw, Check, X, Cpu, HardDrive } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import { getProviderIcon } from '../components/ProviderIcons';

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
    vms: TemplateVM[];
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

const providerOptions = ['vSphere', 'Proxmox', 'AWS', 'Azure', 'GCP', 'CloudShare', 'Skytap'];

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
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateModel | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // vSphere Inventory
    const [inventory, setInventory] = useState<any>(null);
    const [loadingInventory, setLoadingInventory] = useState(false);
    const [inventorySearch, setInventorySearch] = useState('');

    // Form state
    const [form, setForm] = useState({
        name: '',
        description: '',
        provider: 'vSphere',
        is_active: true,
    });
    const [selectedVMs, setSelectedVMs] = useState<TemplateVM[]>([]);

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            const res = await api.get('/templates/');
            setTemplates(res.data);
        } catch (e) {
            console.error("Failed to fetch templates", e);
            showToast('Failed to load templates', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchInventory = async () => {
        setLoadingInventory(true);
        try {
            if (form.provider === 'vSphere') {
                const res = await api.get('/infrastructure/vsphere/inventory');
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
        if (form.provider !== 'vSphere') {
            showToast(`Sync for ${form.provider} not implemented yet`, 'info');
            return;
        }

        setLoadingInventory(true);
        try {
            const res = await api.post('/infrastructure/vsphere/sync');
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
            // Update template info
            await api.put(`/templates/${selectedTemplate.id}`, form);
            
            // Get current VMs in template
            const currentVMs = selectedTemplate.vms || [];
            const currentMoids = currentVMs.map(v => v.vm_moid);
            const newMoids = selectedVMs.map(v => v.vm_moid);
            
            // Remove VMs not in new selection
            for (const vm of currentVMs) {
                if (!newMoids.includes(vm.vm_moid)) {
                    await api.delete(`/templates/${selectedTemplate.id}/vms/${vm.id}`);
                }
            }
            
            // Add new VMs
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

    const openEditModal = (tpl: TemplateModel) => {
        setSelectedTemplate(tpl);
        setForm({
            name: tpl.name,
            description: tpl.description || '',
            provider: tpl.provider || 'vSphere',
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
        if (!inventory) {
            fetchInventory();
        }
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
                    is_primary: prevSelected.length === 0, // First VM is primary
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

    const filteredTemplates = templates.filter(tpl =>
        tpl.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tpl.description && tpl.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const filteredInventoryVMs = inventory?.vms?.filter((vm: InventoryVM) =>
        vm.name.toLowerCase().includes(inventorySearch.toLowerCase())
    ) || [];

    const getProviderBg = (provider: string) => {
        switch(provider.toLowerCase()) {
            case 'vsphere': return 'from-blue-500/20 to-sky-500/20 text-blue-600 dark:text-blue-400';
            case 'aws': return 'from-orange-500/20 to-yellow-500/20 text-orange-600 dark:text-orange-400';
            case 'azure': return 'from-blue-500/20 to-sky-500/20 text-blue-600 dark:text-blue-400';
            case 'gcp': return 'from-red-500/20 to-rose-500/20 text-red-600 dark:text-red-400';
            case 'cloudshare': return 'from-purple-500/20 to-pink-500/20 text-purple-600 dark:text-purple-400';
            case 'skytap': return 'from-cyan-500/20 to-teal-500/20 text-cyan-600 dark:text-cyan-400';
            default: return 'from-indigo-500/20 to-purple-500/20 text-indigo-600 dark:text-indigo-400';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-primary">Templates</h1>
                    <p className="text-secondary mt-1">Manage environment templates with VM configurations</p>
                </div>
                <button onClick={() => { resetForm(); setCreateModalOpen(true); }} className="btn-primary">
                    <Plus className="w-5 h-5" />
                    New Template
                </button>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="w-5 h-5 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                    type="text"
                    placeholder="Search templates..."
                    className="input pl-10"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Templates Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="card p-6 animate-pulse">
                            <div className="h-12 w-12 bg-secondary/20 rounded-xl mb-4"></div>
                            <div className="h-4 bg-secondary/20 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-secondary/20 rounded w-1/2"></div>
                        </div>
                    ))}
                </div>
            ) : filteredTemplates.length === 0 ? (
                <div className="card-elevated p-12 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-secondary/20 flex items-center justify-center">
                        <Layers className="w-10 h-10 text-secondary" />
                    </div>
                    <h3 className="text-xl font-semibold text-primary mb-2">No templates found</h3>
                    <p className="text-secondary mb-6">
                        {searchTerm ? 'Try adjusting your search' : 'Create your first template to get started'}
                    </p>
                    {!searchTerm && (
                        <button onClick={() => { resetForm(); setCreateModalOpen(true); }} className="btn-primary inline-flex">
                            <Plus className="w-5 h-5" />
                            Create Template
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredTemplates.map(tpl => {
                        const ProviderIcon = getProviderIcon(tpl.provider);
                        return (
                            <div key={tpl.id} className="card-elevated p-6 hover:border-theme transition-all group">
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getProviderBg(tpl.provider)} flex items-center justify-center`}>
                                        <ProviderIcon className="w-8 h-8" />
                                    </div>
                                    <span className={`badge ${tpl.is_active ? 'badge-success' : 'badge-warning'}`}>
                                        {tpl.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                
                                <h3 className="text-lg font-semibold text-primary mb-2">{tpl.name}</h3>
                                <div className="flex gap-2 mb-3">
                                    <span className="text-xs font-medium px-2 py-1 rounded bg-secondary/20 text-secondary border border-theme">
                                        {tpl.provider || 'vSphere'}
                                    </span>
                                    <span className="text-xs font-medium px-2 py-1 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                        {tpl.vms?.length || 0} VMs
                                    </span>
                                </div>
                                <p className="text-sm text-secondary mb-4 line-clamp-2">
                                    {tpl.description || 'No description'}
                                </p>

                                {/* VM Preview */}
                                {tpl.vms && tpl.vms.length > 0 && (
                                    <div className="mb-4 space-y-1">
                                        {tpl.vms.slice(0, 3).map(vm => (
                                            <div key={vm.vm_moid} className="flex items-center gap-2 text-xs text-secondary">
                                                <Server className="w-3 h-3" />
                                                <span className="truncate">{vm.vm_name}</span>
                                                {vm.is_primary && <span className="text-green-500 text-[10px]">(Primary)</span>}
                                            </div>
                                        ))}
                                        {tpl.vms.length > 3 && (
                                            <div className="text-xs text-secondary">+{tpl.vms.length - 3} more</div>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center justify-end gap-1 pt-4 border-t border-theme">
                                    <button 
                                        onClick={() => openEditModal(tpl)}
                                        className="p-2 text-secondary hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors" 
                                        title="Edit"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => openDeleteModal(tpl)}
                                        className="p-2 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" 
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create/Edit Modal */}
            <Modal 
                isOpen={createModalOpen || editModalOpen} 
                onClose={() => { setCreateModalOpen(false); setEditModalOpen(false); }} 
                title={createModalOpen ? "Create Template" : "Edit Template"}
                maxWidth="xl"
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="input-label">Template Name</label>
                            <input 
                                type="text"
                                className="input"
                                placeholder="e.g., Security Lab Environment"
                                value={form.name}
                                onChange={e => setForm({...form, name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="input-label">Provider</label>
                            <select
                                className="input"
                                value={form.provider}
                                onChange={e => {
                                    setForm({...form, provider: e.target.value});
                                    setSelectedVMs([]);
                                    setInventory(null);
                                }}
                            >
                                {providerOptions.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="input-label">Description</label>
                        <textarea 
                            className="input min-h-[60px]"
                            placeholder="Brief description of this template..."
                            value={form.description}
                            onChange={e => setForm({...form, description: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="input-label">Status</label>
                        <button
                            type="button"
                            onClick={() => setForm({...form, is_active: !form.is_active})}
                            className="flex items-center gap-3 mt-2 group"
                        >
                            <div className={`relative w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-blue-600' : 'bg-secondary'}`}>
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-0'}`} />
                            </div>
                            <span className="text-secondary font-medium group-hover:text-primary transition-colors">
                                {form.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </button>
                    </div>

                    {/* VM Selection Section */}
                    <div className="border-t border-theme pt-5 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between mb-3">
                            <label className="input-label mb-0">Virtual Machines</label>
                            
                            <div className="relative group">
                                <button 
                                    type="button"
                                    onClick={openVMSelector}
                                    disabled={form.provider !== 'vSphere'}
                                    className={`btn-secondary text-sm py-1.5 ${form.provider !== 'vSphere' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <Plus className="w-4 h-4" />
                                    Select VMs
                                </button>
                                
                                {form.provider !== 'vSphere' && (
                                    <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                                        No objects have been synced. Please configure credentials and sync objects in Settings for {form.provider}.
                                        <div className="absolute top-full right-4 -mt-1 border-4 border-transparent border-t-gray-900" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {selectedVMs.length === 0 ? (
                            <div className={`p-6 border-2 border-dashed border-theme rounded-lg text-center ${form.provider !== 'vSphere' ? 'opacity-50' : ''}`}>
                                <Server className="w-8 h-8 mx-auto mb-2 text-secondary/50" />
                                <p className="text-sm text-secondary">No VMs selected</p>
                                <p className="text-xs text-secondary/70 mt-1">
                                    {form.provider === 'vSphere' 
                                        ? 'Click "Select VMs" to add from vSphere inventory' 
                                        : `Connect to ${form.provider} to select VMs`
                                    }
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                {selectedVMs.map(vm => (
                                    <div key={vm.vm_moid} className="flex items-center justify-between p-3 bg-base-200 rounded-lg border border-theme">
                                        <div className="flex items-center gap-3">
                                            <Server className="w-5 h-5 text-blue-500" />
                                            <div>
                                                <div className="font-medium text-primary text-sm">{vm.vm_name}</div>
                                                <div className="text-xs text-secondary flex items-center gap-2">
                                                    <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{vm.cpu} CPU</span>
                                                    <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{Math.round(vm.memory_mb / 1024)}GB</span>
                                                    {vm.is_template && <span className="text-purple-500">Template</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setPrimaryVM(vm.vm_moid)}
                                                className={`text-xs px-2 py-1 rounded ${vm.is_primary ? 'bg-green-500/20 text-green-600' : 'bg-secondary/20 text-secondary hover:bg-green-500/10 hover:text-green-500'}`}
                                            >
                                                {vm.is_primary ? '✓ Primary' : 'Set Primary'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeSelectedVM(vm.vm_moid)}
                                                className="p-1 text-secondary hover:text-red-500"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-theme">
                        <button 
                            onClick={() => { setCreateModalOpen(false); setEditModalOpen(false); }} 
                            className="btn-secondary"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={createModalOpen ? handleCreate : handleEdit} 
                            disabled={isSubmitting} 
                            className="btn-primary"
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    {createModalOpen ? 'Create Template' : 'Save Changes'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* VM Selector Modal */}
            <Modal 
                isOpen={vmSelectorOpen} 
                onClose={() => setVmSelectorOpen(false)} 
                title={`Select VMs from ${form.provider} Inventory`}
                maxWidth="3xl"
            >
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text"
                                placeholder={`Search ${form.provider} VMs...`}
                                className="input pl-9 py-2"
                                value={inventorySearch}
                                onChange={e => setInventorySearch(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={syncInventory}
                            disabled={loadingInventory}
                            className="btn-secondary py-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingInventory ? 'animate-spin' : ''}`} />
                            Sync
                        </button>
                    </div>

                    {loadingInventory ? (
                        <div className="p-8 text-center">
                            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-secondary">Loading inventory...</p>
                        </div>
                    ) : !inventory || filteredInventoryVMs.length === 0 ? (
                        <div className="p-8 text-center border-2 border-dashed border-theme rounded-lg">
                            <Server className="w-10 h-10 mx-auto mb-3 text-secondary/50" />
                            <p className="text-secondary">No VMs found in inventory</p>
                            <p className="text-xs text-secondary/70 mt-1">Click Sync to fetch from vSphere</p>
                        </div>
                    ) : (
                        <div className="max-h-[400px] overflow-y-auto space-y-1">
                            {filteredInventoryVMs.map((vm: InventoryVM) => {
                                const isSelected = selectedVMs.some(v => v.vm_moid === vm.moid);
                                return (
                                    <div 
                                        key={vm.moid}
                                        onClick={() => toggleVMSelection(vm)}
                                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-blue-500/20 border border-blue-500/40' : 'bg-base-200 border border-transparent hover:border-theme'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${vm.is_template ? 'bg-purple-500/20' : 'bg-blue-500/20'}`}>
                                                <Server className={`w-4 h-4 ${vm.is_template ? 'text-purple-500' : 'text-blue-500'}`} />
                                            </div>
                                            <div>
                                                <div className="font-medium text-primary text-sm">{vm.name}</div>
                                                <div className="text-xs text-secondary flex items-center gap-3">
                                                    <span>{vm.guest || 'Unknown OS'}</span>
                                                    <span>{vm.num_cpu} CPU</span>
                                                    <span>{Math.round(vm.memory_mb / 1024)}GB RAM</span>
                                                    {vm.is_template && <span className="text-purple-500">Template</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isSelected ? 'bg-blue-500' : 'border-2 border-secondary/40'}`}>
                                            {isSelected && <Check className="w-4 h-4 text-white" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-theme">
                        <p className="text-sm text-secondary">{selectedVMs.length} VMs selected</p>
                        <button 
                            onClick={() => setVmSelectorOpen(false)}
                            className="btn-primary"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Template" maxWidth="sm">
                <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="p-3 bg-red-500/20 rounded-full">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <p className="text-primary font-medium">Are you sure?</p>
                            <p className="text-sm text-secondary">
                                This will permanently delete <span className="text-primary font-medium">{selectedTemplate?.name}</span>
                                {selectedTemplate?.vms && selectedTemplate.vms.length > 0 && (
                                    <span> and its {selectedTemplate.vms.length} VM configuration(s)</span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button onClick={() => setDeleteModalOpen(false)} className="btn-secondary">
                            Cancel
                        </button>
                        <button 
                            onClick={handleDelete} 
                            className="bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors"
                        >
                            Delete Template
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Templates;
