import React, { useEffect, useState } from 'react';
import api from '../api';
import { 
    Plus, Search, Server, Trash2, Edit, Check, Clock, Monitor, HardDrive, Cpu, 
    Layout as LayoutTemplate, RefreshCw, Layers
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
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

const providerOptions = ['vSphere', 'Proxmox', 'AWS', 'Azure', 'GCP'];

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
        vm.name.toLowerCase().includes(inventorySearch.toLowerCase())
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
                        onClick={() => { resetForm(); setCreateModalOpen(true); }}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-bold shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">New Template</span>
                    </button>
                </div>
            </div>

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
                        <Monitor className="w-12 h-12 text-secondary/50" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-primary mb-3 tracking-tight">
                        {searchTerm ? "No blueprints match your search" : "Your catalog is empty"}
                    </h3>
                    <p className="text-secondary font-medium max-w-sm mx-auto mb-8">
                        {searchTerm
                            ? "Try refining your keywords or clear the search to see all templates."
                            : "Blueprints define the structure, network, and resources for your training environments."}
                    </p>
                    {!searchTerm && (
                        <button
                            onClick={() => { resetForm(); setCreateModalOpen(true); }}
                            className="btn-primary"
                        >
                            <Plus className="w-5 h-5" />
                            Initialize Catalog
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredTemplates.map(tpl => (
                        <TemplateCard
                            key={tpl.id}
                            tpl={tpl}
                            onEdit={() => openEditModal(tpl)}
                            onDelete={() => openDeleteModal(tpl)}
                        />
                    ))}
                </div>
            )}

            {/* Creation Modal */}
            <Modal
                isOpen={createModalOpen || editModalOpen}
                onClose={() => { setCreateModalOpen(false); setEditModalOpen(false); }}
                title={createModalOpen ? "New Blueprint" : "Refine Blueprint"}
                icon={<LayoutTemplate className="w-6 h-6 text-blue-500" />}
                maxWidth="xl"
            >
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-secondary uppercase tracking-widest pl-1">Name</label>
                            <input
                                type="text"
                                className="input bg-secondary/20 border-theme/40 focus:border-blue-500 rounded-2xl p-4 text-primary font-medium"
                                placeholder="e.g., Enterprise Lab"
                                value={form.name}
                                onChange={e => setForm({...form, name: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-secondary uppercase tracking-widest pl-1">Platform</label>
                            <select
                                className="input bg-secondary/20 border-theme/40 focus:border-blue-500 rounded-2xl p-4 text-primary font-medium appearance-none"
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

                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-secondary uppercase tracking-widest pl-1">Description</label>
                        <textarea
                            className="input bg-secondary/20 border-theme/40 focus:border-blue-500 rounded-2xl p-4 text-primary font-medium min-h-[100px]"
                            placeholder="Describe the environment's purpose..."
                            value={form.description}
                            onChange={e => setForm({...form, description: e.target.value})}
                        />
                    </div>

                    <div className="flex items-center justify-between p-6 bg-secondary/20 rounded-[1.5rem] border border-theme">
                        <div>
                            <p className="text-sm font-bold text-primary">Blueprint Status</p>
                            <p className="text-xs text-secondary font-medium">Toggle availability for deployments</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setForm({...form, is_active: !form.is_active})}
                            className={clsx(
                                "relative w-14 h-8 rounded-full transition-all duration-300 flex items-center px-1 shadow-inner",
                                form.is_active ? "bg-emerald-500 shadow-emerald-500/20" : "bg-secondary"
                            )}
                        >
                            <div className={clsx(
                                "w-6 h-6 rounded-full bg-white shadow-xl transition-transform duration-300",
                                form.is_active ? "translate-x-6" : "translate-x-0"
                            )} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-primary uppercase tracking-widest">Resource Matrix</h3>
                            <button 
                                type="button"
                                onClick={openVMSelector}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
                            >
                                <Plus className="w-4 h-4" />
                                Add Instances
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {selectedVMs.length > 0 ? (
                                selectedVMs.map(vm => (
                                    <SelectedVMCard 
                                        key={vm.vm_moid} 
                                        vm={vm} 
                                        onRemove={removeSelectedVM}
                                        onSetPrimary={setPrimaryVM}
                                    />
                                ))
                            ) : (
                                <div className="p-8 border-2 border-dashed border-theme rounded-[1.5rem] text-center bg-secondary/10">
                                    <Server className="w-10 h-10 mx-auto mb-3 text-secondary/40" />
                                    <p className="text-sm font-bold text-secondary">No instances defined</p>
                                    <p className="text-[10px] uppercase font-bold text-secondary/60 mt-1">Add resources to finalize blueprint</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button 
                            onClick={createModalOpen ? handleCreate : handleEdit}
                            disabled={isSubmitting}
                            className="flex-1 flex items-center justify-center gap-3 px-8 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <RefreshCw className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    <Check className="w-5 h-5 font-bold" />
                                    <span>{createModalOpen ? "Commit Blueprint" : "Save Changes"}</span>
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
                title="Resource Selector"
                icon={<Server className="w-6 h-6 text-purple-500" />}
                maxWidth="3xl"
            >
                <div className="space-y-6">
                    <div className="flex items-center justify-between gap-4 p-4 bg-secondary/20 rounded-2xl border border-theme">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-secondary absolute left-4 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text"
                                placeholder={`Filter ${form.provider} Inventory...`}
                                className="input pl-10 bg-transparent border-none py-2 text-sm font-medium"
                                value={inventorySearch}
                                onChange={e => setInventorySearch(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={syncInventory}
                            disabled={loadingInventory}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary/50 hover:bg-theme-hover rounded-xl text-xs font-bold transition-all border border-theme"
                        >
                            <RefreshCw className={clsx("w-4 h-4", loadingInventory && "animate-spin")} />
                            Sync Source
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {loadingInventory ? (
                            [1,2,3,4].map(i => <div key={i} className="h-20 bg-secondary/10 animate-pulse rounded-2xl border border-theme" />)
                        ) : filteredInventoryVMs.length > 0 ? (
                            filteredInventoryVMs.map((vm: InventoryVM) => (
                                <InventoryVMRow 
                                    key={vm.moid} 
                                    vm={vm} 
                                    isSelected={selectedVMs.some(v => v.vm_moid === vm.moid)}
                                    onToggle={() => toggleVMSelection(vm)}
                                />
                            ))
                        ) : (
                            <div className="py-20 text-center opacity-50 italic">No resources found matching filter</div>
                        )}
                    </div>

                    <div className="flex items-center justify-between p-6 bg-secondary/20 border-t border-theme rounded-b-[2rem] -mx-8 -mb-8">
                        <span className="text-sm font-bold text-primary">{selectedVMs.length} entities staged</span>
                        <button 
                            onClick={() => setVmSelectorOpen(false)}
                            className="px-8 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-500 transition-colors shadow-lg shadow-purple-500/20"
                        >
                            Confirm Selection
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
        </div>
    );
};

// --- MODERN SUB-COMPONENTS ---

const TemplateCard: React.FC<{ tpl: TemplateModel; onEdit: () => void; onDelete: () => void }> = ({ tpl, onEdit, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const ProviderIcon = getProviderIcon(tpl.provider);
    const ChevronDown = ({ className }: { className?: string }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
    );
    const ChevronRight = ({ className }: { className?: string }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
    );
    
    return (
        <div className="glass-light rounded-2xl border border-white/10 hover:border-purple-500/40 transition-all duration-300 relative group shadow-xl bg-white/5 dark:bg-gray-900/40 overflow-hidden">
            {/* Compact Header - Always Visible */}
            <div 
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/5 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Expand Icon */}
                <div className="text-secondary">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>

                {/* Provider Icon */}
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-white/10 transition-all group-hover:scale-105">
                    <ProviderIcon className="w-5 h-5 text-primary" />
                </div>

                {/* Title & Provider */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-primary truncate group-hover:text-purple-400 transition-colors">
                        {tpl.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-secondary">
                        <span>{tpl.provider || 'vSphere'}</span>
                        <span>•</span>
                        <span>{tpl.vms?.length || 0} VMs</span>
                    </div>
                </div>

                {/* VM Count Pill */}
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-purple-500/10 rounded-lg text-xs border border-purple-500/20">
                    <Server className="w-3 h-3 text-purple-400" />
                    <span className="text-purple-400 font-medium">{tpl.vms?.length || 0}</span>
                </div>

                {/* Status Badge */}
                <div className={clsx(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                    tpl.is_active 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                        : "bg-slate-500/10 border-slate-500/30 text-slate-400"
                )}>
                    {tpl.is_active ? 'Active' : 'Inactive'}
                </div>

                {/* Quick Actions (always visible) */}
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={onEdit} 
                        className="p-2 text-secondary hover:text-purple-500 hover:bg-purple-500/10 rounded-lg transition-colors"
                        title="Edit Template"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={onDelete} 
                        className="p-2 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete Template"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t border-white/5 bg-secondary/5 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    {/* Description */}
                    {tpl.description && (
                        <p className="text-sm text-secondary leading-relaxed pl-1 border-l-2 border-purple-500/20">
                            {tpl.description}
                        </p>
                    )}

                    {/* VM List */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-secondary uppercase tracking-wide">Environment Stack</span>
                            <span className="text-[10px] text-secondary">{tpl.vms?.length || 0} VMs</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            {tpl.vms?.map(vm => (
                                <div key={vm.vm_moid} className="flex items-center gap-3 bg-secondary/20 p-3 rounded-xl border border-white/5 hover:bg-secondary/30 transition-colors">
                                    <div className={clsx(
                                        "w-1.5 h-6 rounded-full", 
                                        vm.is_primary ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-purple-500/40"
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-bold text-primary truncate block">{vm.vm_name}</span>
                                        <span className="text-[10px] text-secondary">{vm.guest_os || 'Unknown OS'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-secondary">
                                        <span className="flex items-center gap-1">
                                            <Cpu className="w-3 h-3 text-purple-400" /> {vm.cpu}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <HardDrive className="w-3 h-3 text-purple-400" /> {Math.round(vm.memory_mb/1024)}GB
                                        </span>
                                    </div>
                                    {vm.is_primary && (
                                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-bold uppercase rounded border border-emerald-500/30">
                                            Primary
                                        </span>
                                    )}
                                </div>
                            ))}
                            {(!tpl.vms || tpl.vms.length === 0) && (
                                <div className="text-center py-4 text-secondary text-sm">
                                    No VMs configured
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer with timestamp */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-secondary">
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Last updated: {tpl.updated_at ? new Date(tpl.updated_at).toLocaleDateString() : 'Never'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SelectedVMCard: React.FC<{ 
    vm: TemplateVM; 
    onRemove: (moid: string) => void;
    onSetPrimary: (moid: string) => void;
}> = ({ vm, onRemove, onSetPrimary }) => (
    <div className={clsx(
        "group relative flex items-center justify-between p-5 rounded-[2rem] transition-all border overflow-hidden",
        vm.is_primary 
            ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.2)]" 
            : "bg-secondary/40 border-white/5 hover:border-theme shadow-lg"
    )}>
        {/* Subtle Background Icon */}
        <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
            <Server className="w-24 h-24" />
        </div>

        <div className="flex items-center gap-5 relative z-10">
            <div className={clsx(
                "w-14 h-14 rounded-[1.25rem] flex items-center justify-center border shadow-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
                vm.is_primary 
                    ? "bg-emerald-500 text-white border-emerald-400/50 shadow-emerald-500/20" 
                    : "bg-blue-600 text-white border-blue-400/50 shadow-blue-500/20"
            )}>
                <Server className="w-7 h-7" />
            </div>
            <div>
                <dt className="text-[10px] font-black text-secondary uppercase tracking-[0.25em] mb-1.5 opacity-60">
                    {vm.guest_os || 'Architectural Entity'}
                </dt>
                <dd className="text-lg font-black text-primary tracking-tight uppercase italic drop-shadow-sm">
                    {vm.vm_name}
                </dd>
            </div>
        </div>
        
        <div className="flex items-center gap-6 relative z-10">
            <div className="hidden lg:flex flex-col items-end px-6 border-r border-white/10">
                <span className="text-[10px] font-black text-secondary uppercase tracking-widest opacity-50 mb-1">Configuration</span>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/5 px-2 py-1 rounded-lg">
                        <Cpu className="w-3 h-3 text-blue-500" /> {vm.cpu}vCPU
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/5 px-2 py-1 rounded-lg">
                        <HardDrive className="w-3 h-3 text-purple-500" /> {Math.round(vm.memory_mb/1024)}GB
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => onSetPrimary(vm.vm_moid)}
                    className={clsx(
                        "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all tracking-[0.2em] shadow-lg",
                        vm.is_primary 
                            ? "bg-emerald-500 text-white shadow-emerald-500/30 scale-105" 
                            : "bg-secondary/80 text-secondary hover:text-emerald-500 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 shadow-black/10"
                    )}
                >
                    {vm.is_primary ? 'MASTER ENTITY' : 'SET AS MASTER'}
                </button>
                <button 
                    onClick={() => onRemove(vm.vm_moid)} 
                    className="p-3 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20 group/remove"
                    title="Remove Instance"
                >
                    <Trash2 className="w-5 h-5 transition-transform group-hover/remove:scale-110" />
                </button>
            </div>
        </div>
    </div>
);

const InventoryVMRow: React.FC<{ vm: InventoryVM; isSelected: boolean; onToggle: () => void }> = ({ vm, isSelected, onToggle }) => (
    <div 
        onClick={onToggle}
        className={clsx(
            "group relative flex items-center justify-between p-5 rounded-[1.75rem] cursor-pointer transition-all border overflow-hidden",
            isSelected 
                ? "bg-purple-600/10 border-purple-500/50 shadow-[0_10px_30px_-10px_rgba(168,85,247,0.2)]" 
                : "bg-secondary/30 border-white/5 hover:bg-secondary/50 hover:border-purple-500/30 shadow-md"
        )}
    >
        <div className="flex items-center gap-5 relative z-10">
            <div className={clsx(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-2xl",
                isSelected 
                    ? "bg-purple-600 text-white scale-110 rotate-3 shadow-purple-500/40" 
                    : (vm.is_template ? "bg-purple-500/10 text-purple-500 border border-purple-500/20" : "bg-blue-500/10 text-blue-500 border border-blue-500/20")
            )}>
                <Server className="w-7 h-7" />
            </div>
            <div>
                <h4 className="text-lg font-black text-primary leading-tight mb-2 tracking-tight uppercase italic drop-shadow-sm transition-colors group-hover:text-purple-500">{vm.name}</h4>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/5 text-[9px] font-black text-secondary uppercase tracking-widest">
                        <Cpu className="w-3.5 h-3.5 text-blue-500" /> {vm.num_cpu}vCPU
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/5 text-[9px] font-black text-secondary uppercase tracking-widest">
                        <HardDrive className="w-3.5 h-3.5 text-purple-500" /> {Math.round(vm.memory_mb/1024)}GB RAM
                    </div>
                    <div className={clsx(
                        "text-[8px] px-2.5 py-1 rounded-md font-black tracking-[0.2em] uppercase border shadow-sm",
                        vm.power_state === 'poweredOn' 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                            : "bg-slate-500/10 border-slate-500/30 text-secondary"
                    )}>
                        {vm.power_state === 'poweredOn' ? 'ONLINE' : 'OFFLINE'}
                    </div>
                </div>
            </div>
        </div>
        <div className={clsx(
            "w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-500 border-2 relative z-10 shadow-lg",
            isSelected 
                ? "bg-purple-500 border-purple-400 scale-110 shadow-purple-500/50 rotate-12" 
                : "bg-secondary/50 border-white/10 group-hover:border-purple-500/50 group-hover:rotate-6"
        )}>
            {isSelected ? (
                <Check className="w-5 h-5 text-white stroke-[3]" />
            ) : (
                <Plus className="w-5 h-5 text-secondary/30 group-hover:text-purple-500/50 transition-colors" />
            )}
        </div>
        
        {/* Selection Glow */}
        {isSelected && (
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] -mr-10 -mt-10" />
        )}
    </div>
);

export default Templates;
