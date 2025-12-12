import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Search, Edit, Trash2, Layers, Save } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

interface TemplateModel {
    id: number;
    name: string;
    description: string | null;
    icon: string;
    vm_config: string | null;
    is_active: boolean;
    created_at: string | null;
    updated_at: string | null;
}

const iconOptions = ['🖥️', '🔒', '🌐', '🛡️', '⚙️', '📊', '🔧', '💻', '🖧', '📡'];

const Templates: React.FC = () => {
    const { showToast } = useToast();
    const [templates, setTemplates] = useState<TemplateModel[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    
    // Modal states
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateModel | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [form, setForm] = useState({
        name: '',
        description: '',
        icon: '🖥️',
        vm_config: '',
        is_active: true,
    });

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

    const resetForm = () => {
        setForm({
            name: '',
            description: '',
            icon: '🖥️',
            vm_config: '',
            is_active: true,
        });
    };

    const handleCreate = async () => {
        if (!form.name.trim()) {
            showToast('Please enter a template name', 'warning');
            return;
        }
        setIsSubmitting(true);
        try {
            await api.post('/templates/', form);
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
            icon: tpl.icon,
            vm_config: tpl.vm_config || '',
            is_active: tpl.is_active,
        });
        setEditModalOpen(true);
    };

    const openDeleteModal = (tpl: TemplateModel) => {
        setSelectedTemplate(tpl);
        setDeleteModalOpen(true);
    };

    const filteredTemplates = templates.filter(tpl =>
        tpl.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tpl.description && tpl.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-primary">Templates</h1>
                    <p className="text-secondary mt-1">Manage environment templates for classes</p>
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
                    {filteredTemplates.map(tpl => (
                        <div key={tpl.id} className="card-elevated p-6 hover:border-theme transition-all group">
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-2xl">
                                    {tpl.icon}
                                </div>
                                <span className={`badge ${tpl.is_active ? 'badge-success' : 'badge-warning'}`}>
                                    {tpl.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            
                            <h3 className="text-lg font-semibold text-primary mb-2">{tpl.name}</h3>
                            <p className="text-sm text-secondary mb-4 line-clamp-2">
                                {tpl.description || 'No description'}
                            </p>

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
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            <Modal 
                isOpen={createModalOpen || editModalOpen} 
                onClose={() => { setCreateModalOpen(false); setEditModalOpen(false); }} 
                title={createModalOpen ? "Create Template" : "Edit Template"}
                maxWidth="lg"
            >
                <div className="space-y-4">
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
                        <label className="input-label">Description</label>
                        <textarea 
                            className="input min-h-[80px]"
                            placeholder="Brief description of this template..."
                            value={form.description}
                            onChange={e => setForm({...form, description: e.target.value})}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="input-label">Icon</label>
                            <div className="flex flex-wrap gap-2">
                                {iconOptions.map(icon => (
                                    <button
                                        key={icon}
                                        type="button"
                                        onClick={() => setForm({...form, icon})}
                                        className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                                            form.icon === icon
                                                ? 'bg-blue-500/20 border-2 border-blue-500'
                                                : 'bg-secondary/30 border border-theme hover:border-blue-500/50'
                                        }`}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="input-label">Status</label>
                            <div className="flex items-center gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setForm({...form, is_active: !form.is_active})}
                                    className={`relative w-14 h-8 rounded-full p-1 transition-colors ${form.is_active ? 'bg-blue-600' : 'bg-secondary'}`}
                                >
                                    <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                                <span className="text-primary">{form.is_active ? 'Active' : 'Inactive'}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="input-label">VM Configuration (JSON, optional)</label>
                        <textarea 
                            className="input min-h-[100px] font-mono text-sm"
                            placeholder='{"cpu": 2, "memory": 4096, "disk": 50}'
                            value={form.vm_config}
                            onChange={e => setForm({...form, vm_config: e.target.value})}
                        />
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
                                    {createModalOpen ? 'Create' : 'Save Changes'}
                                </>
                            )}
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
