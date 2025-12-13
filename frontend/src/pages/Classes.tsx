import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Search, Calendar, Users, Trash2, Edit, Eye, Server, Key, Layers, Save, ChevronDown } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import { getProviderIcon } from '../components/ProviderIcons';

interface ClassModel {
    id: number;
    name: string;
    blueprint_id: string;
    max_users: number;
    passcode: string;
    start_date: string;
    end_date: string;
    instructor_id: number;
    status: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    draft: { label: 'Draft', color: 'text-gray-400', bgColor: 'bg-gray-500/10 border-gray-500/20' },
    upcoming: { label: 'Upcoming', color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20' },
    active: { label: 'Active', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20' },
    completed: { label: 'Completed', color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20' },
    cancelled: { label: 'Cancelled', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20' },
    postponed: { label: 'Postponed', color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20' },
};

const Classes: React.FC = () => {
    const { showToast } = useToast();
    const [classes, setClasses] = useState<ClassModel[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [isLoading, setIsLoading] = useState(true);
    
    // Modal states
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState<ClassModel | null>(null);
    const [editForm, setEditForm] = useState<Partial<ClassModel>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Templates from API
    const [templates, setTemplates] = useState<{id: number; name: string; description: string; icon: string; provider: string}[]>([]);

    // Create form state
    const [createForm, setCreateForm] = useState({
        name: '',
        blueprint_id: '1',
        max_users: 10,
        passcode: 'class123',
        start_date: new Date().toISOString().slice(0, 16),
        end_date: new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0, 16),
        status: 'draft',
        description: '',
    });



    useEffect(() => {
        fetchClasses();
        fetchTemplates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchTemplates = async () => {
        try {
            const res = await api.get('/templates/');
            setTemplates(res.data.map((t: any) => ({ id: t.id, name: t.name, description: t.description || '', icon: t.icon, provider: t.provider || 'vSphere' })));
        } catch (e) {
            console.error("Failed to fetch templates", e);
        }
    };

    const fetchClasses = async () => {
        try {
            const res = await api.get('/classes/');
            setClasses(res.data);
        } catch (e) {
            console.error("Failed to fetch classes", e);
            showToast('Failed to load classes', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!createForm.name.trim()) {
            showToast('Please enter a class name', 'warning');
            return;
        }
        setIsSubmitting(true);
        try {
            await api.post('/classes/', createForm);
            showToast('Class created successfully', 'success');
            setCreateModalOpen(false);
            resetCreateForm();
            fetchClasses();
        } catch {
            showToast('Failed to create class', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetCreateForm = () => {
        setCreateForm({
            name: '',
            blueprint_id: '1',
            max_users: 10,
            passcode: 'class123',
            start_date: new Date().toISOString().slice(0, 16),
            end_date: new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0, 16),
            status: 'draft',
            description: '',
        });
    };

    const handleDelete = async () => {
        if (!selectedClass) return;
        try {
            await api.delete(`/classes/${selectedClass.id}`);
            showToast('Class deleted successfully', 'success');
            setDeleteModalOpen(false);
            setSelectedClass(null);
            fetchClasses();
        } catch {
            showToast('Failed to delete class', 'error');
        }
    };

    const handleEdit = async () => {
        if (!selectedClass) return;
        setIsSubmitting(true);
        try {
            await api.put(`/classes/${selectedClass.id}`, editForm);
            showToast('Class updated successfully', 'success');
            setEditModalOpen(false);
            setSelectedClass(null);
            fetchClasses();
        } catch {
            showToast('Failed to update class', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openDeleteModal = (cls: ClassModel) => {
        setSelectedClass(cls);
        setDeleteModalOpen(true);
    };

    const openViewModal = (cls: ClassModel) => {
        setSelectedClass(cls);
        setViewModalOpen(true);
    };

    const openEditModal = (cls: ClassModel) => {
        setSelectedClass(cls);
        setEditForm({
            name: cls.name,
            blueprint_id: cls.blueprint_id,
            max_users: cls.max_users,
            passcode: cls.passcode,
            start_date: cls.start_date.slice(0, 16),
            end_date: cls.end_date.slice(0, 16),
            status: cls.status,
            description: cls.description || '',
        });
        setEditModalOpen(true);
    };

    const filteredClasses = classes.filter(cls => {
        const matchesSearch = cls.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || cls.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusBadge = (status: string) => {
        const config = statusConfig[status] || statusConfig.draft;
        return (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${config.bgColor} ${config.color}`}>
                {config.label}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-primary">Classes</h1>
                    <p className="text-secondary mt-1">Manage your training classes and environments</p>
                </div>
                <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
                    <Plus className="w-5 h-5" />
                    New Class
                </button>
            </div>

            {/* Search and Filters */}
            <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text"
                        placeholder="Search classes..."
                        className="input pl-10"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="input pr-10 appearance-none cursor-pointer"
                    >
                        <option value="all">All Status</option>
                        <option value="draft">Draft</option>
                        <option value="upcoming">Upcoming</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="postponed">Postponed</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
            </div>

            {/* Classes Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="card p-6 animate-pulse">
                            <div className="h-4 bg-secondary/20 rounded w-3/4 mb-4"></div>
                            <div className="h-3 bg-secondary/20 rounded w-1/2"></div>
                        </div>
                    ))}
                </div>
            ) : filteredClasses.length === 0 ? (
                <div className="card-elevated p-12 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-secondary/20 flex items-center justify-center">
                        <Calendar className="w-10 h-10 text-secondary" />
                    </div>
                    <h3 className="text-xl font-semibold text-primary mb-2">No classes found</h3>
                    <p className="text-secondary mb-6">
                        {searchTerm || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first class to get started'}
                    </p>
                    {!searchTerm && statusFilter === 'all' && (
                        <button onClick={() => setCreateModalOpen(true)} className="btn-primary inline-flex">
                            <Plus className="w-5 h-5" />
                            Create Class
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredClasses.map(cls => (
                        <div key={cls.id} className="card-elevated p-6 hover:border-theme transition-all group">
                            <div className="flex items-start justify-between mb-4">
                                {(() => {
                                    const tpl = templates.find(t => String(t.id) === cls.blueprint_id);
                                    if (tpl) {
                                        const ProviderIcon = getProviderIcon(tpl.provider);
                                        return (
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center shadow-lg border border-theme">
                                                <ProviderIcon className="w-7 h-7" />
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                            {cls.name.charAt(0)}
                                        </div>
                                    );
                                })()}
                                {getStatusBadge(cls.status)}
                            </div>
                            
                            <h3 className="text-lg font-semibold text-primary mb-2 group-hover:text-blue-500 transition-colors cursor-pointer"
                                onClick={() => openViewModal(cls)}>
                                {cls.name}
                            </h3>
                            
                            <div className="space-y-2 mb-4">
                                <div className="flex items-center gap-2 text-sm text-secondary">
                                    <Calendar className="w-4 h-4" />
                                    <span>{formatDate(cls.start_date)} - {formatDate(cls.end_date)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-secondary">
                                    <Users className="w-4 h-4" />
                                    <span>0 / {cls.max_users} students</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-1 pt-4 border-t border-theme">
                                <button 
                                    onClick={() => openViewModal(cls)}
                                    className="p-2 text-secondary hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors" 
                                    title="View"
                                >
                                    <Eye className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => openEditModal(cls)}
                                    className="p-2 text-secondary hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors" 
                                    title="Edit"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => openDeleteModal(cls)}
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

            {/* Create Class Modal */}
            <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create New Class" maxWidth="2xl">
                <div className="space-y-6">
                    {/* Basic Information Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 pb-3 border-b border-theme">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Server className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-primary font-medium">Basic Information</h3>
                                <p className="text-sm text-secondary">General class details</p>
                            </div>
                        </div>

                        <div>
                            <label className="input-label">Class Name</label>
                            <input 
                                type="text"
                                className="input"
                                placeholder="e.g., Security Fundamentals Q1 2025"
                                value={createForm.name}
                                onChange={e => setCreateForm({...createForm, name: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="input-label">Description (optional)</label>
                            <textarea 
                                className="input min-h-[80px]"
                                placeholder="Brief description of the class..."
                                value={createForm.description}
                                onChange={e => setCreateForm({...createForm, description: e.target.value})}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="input-label flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Max Students
                                </label>
                                <input 
                                    type="number"
                                    min={1}
                                    max={200}
                                    className="input"
                                    value={createForm.max_users}
                                    onChange={e => setCreateForm({...createForm, max_users: parseInt(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="input-label flex items-center gap-2">
                                    <Key className="w-4 h-4" />
                                    Access Passcode
                                </label>
                                <input 
                                    type="text"
                                    className="input font-mono"
                                    value={createForm.passcode}
                                    onChange={e => setCreateForm({...createForm, passcode: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="input-label">Initial Status</label>
                                <select 
                                    className="input"
                                    value={createForm.status}
                                    onChange={e => setCreateForm({...createForm, status: e.target.value})}
                                >
                                    <option value="draft">Draft</option>
                                    <option value="upcoming">Upcoming</option>
                                    <option value="active">Active</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Blueprint Selection Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 pb-3 border-b border-theme">
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                <Layers className="w-5 h-5 text-purple-500" />
                            </div>
                            <div>
                                <h3 className="text-primary font-medium">Environment Blueprint</h3>
                                <p className="text-sm text-secondary">Choose template for student environments</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Dynamic Provider Icon */}
                            {(() => {
                                const selectedTpl = templates.find(t => String(t.id) === createForm.blueprint_id);
                                if (selectedTpl) {
                                    const ProviderIcon = getProviderIcon(selectedTpl.provider);
                                    return (
                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                                            <ProviderIcon className="w-5 h-5 text-blue-500" />
                                        </div>
                                    );
                                }
                                return (
                                    <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center flex-shrink-0">
                                        <Layers className="w-5 h-5 text-secondary" />
                                    </div>
                                );
                            })()}
                            <div className="relative flex-1">
                                <select
                                    className="input appearance-none pr-10"
                                    value={createForm.blueprint_id}
                                    onChange={e => setCreateForm({...createForm, blueprint_id: e.target.value})}
                                >
                                    <option value="">Select a template...</option>
                                    {templates.map((tpl) => (
                                        <option key={tpl.id} value={String(tpl.id)}>
                                            {tpl.name} ({tpl.provider}) {tpl.description ? `- ${tpl.description}` : ''}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Schedule Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 pb-3 border-b border-theme">
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <Calendar className="w-5 h-5 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-primary font-medium">Schedule</h3>
                                <p className="text-sm text-secondary">When should the class be active?</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="input-label">Start Date & Time</label>
                                <input 
                                    type="datetime-local"
                                    className="input"
                                    value={createForm.start_date}
                                    onChange={e => setCreateForm({...createForm, start_date: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="input-label">End Date & Time</label>
                                <input 
                                    type="datetime-local"
                                    className="input"
                                    value={createForm.end_date}
                                    onChange={e => setCreateForm({...createForm, end_date: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-theme">
                        <button onClick={() => setCreateModalOpen(false)} className="btn-secondary">
                            Cancel
                        </button>
                        <button onClick={handleCreate} disabled={isSubmitting} className="btn-primary">
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Create Class
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* View Modal */}
            <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title="Class Details" maxWidth="lg">
                {selectedClass && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 pb-4 border-b border-theme">
                            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                                {selectedClass.name.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-primary">{selectedClass.name}</h3>
                                <p className="text-secondary">Template {selectedClass.blueprint_id}</p>
                            </div>
                            {getStatusBadge(selectedClass.status)}
                        </div>

                        {selectedClass.description && (
                            <div className="bg-secondary/50 p-4 rounded-lg">
                                <p className="text-sm text-secondary mb-1">Description</p>
                                <p className="text-primary">{selectedClass.description}</p>
                            </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-secondary/50 p-4 rounded-lg">
                                <p className="text-sm text-secondary">Max Students</p>
                                <p className="text-lg font-semibold text-primary">{selectedClass.max_users}</p>
                            </div>
                            <div className="bg-secondary/50 p-4 rounded-lg">
                                <p className="text-sm text-secondary">Passcode</p>
                                <p className="text-lg font-semibold text-primary font-mono">{selectedClass.passcode}</p>
                            </div>
                            <div className="bg-secondary/50 p-4 rounded-lg">
                                <p className="text-sm text-secondary">Start Date</p>
                                <p className="text-lg font-semibold text-primary">{formatDateTime(selectedClass.start_date)}</p>
                            </div>
                            <div className="bg-secondary/50 p-4 rounded-lg">
                                <p className="text-sm text-secondary">End Date</p>
                                <p className="text-lg font-semibold text-primary">{formatDateTime(selectedClass.end_date)}</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setViewModalOpen(false)} className="btn-secondary">
                                Close
                            </button>
                            <button 
                                onClick={() => { setViewModalOpen(false); openEditModal(selectedClass); }}
                                className="btn-primary"
                            >
                                <Edit className="w-4 h-4" />
                                Edit
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Class" maxWidth="lg">
                <div className="space-y-4">
                    <div>
                        <label className="input-label">Class Name</label>
                        <input 
                            type="text"
                            className="input"
                            value={editForm.name || ''}
                            onChange={e => setEditForm({...editForm, name: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="input-label">Description</label>
                        <textarea 
                            className="input min-h-[80px]"
                            value={editForm.description || ''}
                            onChange={e => setEditForm({...editForm, description: e.target.value})}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="input-label">Blueprint / Template</label>
                            <div className="flex items-center gap-3 mt-1">
                                {/* Dynamic Provider Icon */}
                                {(() => {
                                    const selectedTpl = templates.find(t => String(t.id) === editForm.blueprint_id);
                                    if (selectedTpl) {
                                        const ProviderIcon = getProviderIcon(selectedTpl.provider);
                                        return (
                                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                                                <ProviderIcon className="w-4 h-4 text-blue-500" />
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="w-9 h-9 rounded-lg bg-secondary/20 flex items-center justify-center flex-shrink-0">
                                            <Layers className="w-4 h-4 text-secondary" />
                                        </div>
                                    );
                                })()}
                                <div className="relative flex-1">
                                    <select 
                                        className="input appearance-none pr-10"
                                        value={editForm.blueprint_id || ''}
                                        onChange={e => setEditForm({...editForm, blueprint_id: e.target.value})}
                                    >
                                        <option value="">Select a template...</option>
                                        {templates.map((tpl) => (
                                            <option key={tpl.id} value={String(tpl.id)}>
                                                {tpl.name} ({tpl.provider}) {tpl.description ? `- ${tpl.description}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="input-label">Status</label>
                            <select 
                                className="input"
                                value={editForm.status || 'draft'}
                                onChange={e => setEditForm({...editForm, status: e.target.value})}
                            >
                                <option value="draft">Draft</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="postponed">Postponed</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="input-label">Max Students</label>
                            <input 
                                type="number"
                                className="input"
                                value={editForm.max_users || ''}
                                onChange={e => setEditForm({...editForm, max_users: parseInt(e.target.value)})}
                            />
                        </div>
                        <div>
                            <label className="input-label">Passcode</label>
                            <input 
                                type="text"
                                className="input font-mono"
                                value={editForm.passcode || ''}
                                onChange={e => setEditForm({...editForm, passcode: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="input-label">Start Date</label>
                            <input 
                                type="datetime-local"
                                className="input"
                                value={editForm.start_date || ''}
                                onChange={e => setEditForm({...editForm, start_date: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="input-label">End Date</label>
                            <input 
                                type="datetime-local"
                                className="input"
                                value={editForm.end_date || ''}
                                onChange={e => setEditForm({...editForm, end_date: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={() => setEditModalOpen(false)} className="btn-secondary">
                            Cancel
                        </button>
                        <button onClick={handleEdit} disabled={isSubmitting} className="btn-primary">
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Class" maxWidth="sm">
                <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="p-3 bg-red-500/20 rounded-full">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <p className="text-primary font-medium">Are you sure?</p>
                            <p className="text-sm text-secondary">
                                This will permanently delete <span className="text-primary font-medium">{selectedClass?.name}</span>
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
                            Delete Class
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Classes;
