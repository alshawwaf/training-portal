import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Search, Calendar, Users, Trash2, Edit, Eye, MoreVertical, XCircle, Layers } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import { getProviderIcon, ProviderIcon } from '../components/ProviderIcons';

// Import Types
import type { ClassModel, Template } from '../types/class';
import { statusConfig } from '../types/class';

// Import New Modals
import CreateClassModal from '../components/classes/CreateClassModal';
import EditClassModal from '../components/classes/EditClassModal';
import ViewClassModal from '../components/classes/ViewClassModal';

const Classes: React.FC = () => {
    const { showToast } = useToast();
    const [classes, setClasses] = useState<ClassModel[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [isLoading, setIsLoading] = useState(true);
    
    // Modal states
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    
    const [selectedClass, setSelectedClass] = useState<ClassModel | null>(null);
    const [classToDelete, setClassToDelete] = useState<ClassModel | null>(null);

    // Action menu state
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);

    // Templates from API
    const [templates, setTemplates] = useState<Template[]>([]);

    useEffect(() => {
        fetchClasses();
        fetchTemplates();
    }, []);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (openMenuId !== null && !(event.target as Element).closest('.action-menu-container')) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenuId]);

    useEffect(() => {
        if (selectedClass) {
            const updated = classes.find(c => c.id === selectedClass.id);
            if (updated && updated !== selectedClass) {
                setSelectedClass(updated);
            }
        }
    }, [classes]);

    const fetchTemplates = async () => {
        try {
            const response = await api.get('/templates/');
            setTemplates(response.data);
        } catch (error) {
            console.error('Failed to fetch templates:', error);
        }
    };

    const fetchClasses = async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/classes/');
            setClasses(response.data);
        } catch (error) {
            console.error('Failed to fetch classes:', error);
            showToast('Failed to load classes', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!classToDelete) return;
        
        try {
            await api.delete(`/classes/${classToDelete.id}`);
            setClasses(classes.filter(c => c.id !== classToDelete.id));
            showToast('Class deleted successfully', 'success');
            setDeleteModalOpen(false);
            setClassToDelete(null);
        } catch (error) {
            console.error('Failed to delete class:', error);
            showToast('Failed to delete class', 'error');
        }
    };

    const handleProvision = async (classId: number) => {
        try {
            showToast('Provisioning started...', 'success');
            await api.post(`/classes/${classId}/provision`);
            showToast('Provisioning task queued successfully', 'success');
            fetchClasses(); // Refresh status
            setOpenMenuId(null);
        } catch (error) {
            console.error('Failed to provision class:', error);
            showToast('Failed to start provisioning', 'error');
        }
    };

    const openEditModal = (cls: ClassModel) => {
        setSelectedClass(cls);
        setEditModalOpen(true);
        setOpenMenuId(null);
    };

    const openViewModal = (cls: ClassModel) => {
        setSelectedClass(cls);
        setViewModalOpen(true);
        setOpenMenuId(null);
    };

    const openDeleteModal = (cls: ClassModel) => {
        setClassToDelete(cls);
        setDeleteModalOpen(true);
        setOpenMenuId(null);
    };

    // --- Helpers ---
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
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const getStatusBadge = (status: string) => {
        const config = statusConfig[status] || { label: status, color: 'text-gray-400', bgColor: 'bg-gray-800' };
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.color}`}>
                {config.label}
            </span>
        );
    };

    // Filter Logic
    const filteredClasses = classes.filter(cls => {
        const matchesSearch = cls.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              cls.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || cls.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Classes</h1>
                <p className="text-gray-400">Manage training classes and student environments</p>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-900/50 p-4 rounded-xl border border-gray-800 backdrop-blur-sm">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search classes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-gray-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-gray-600"
                        />
                    </div>
                    
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 focus:ring-2 focus:ring-blue-500/50 outline-none cursor-pointer"
                    >
                        <option value="all">All Status</option>
                        {Object.entries(statusConfig).map(([key, conf]) => (
                            <option key={key} value={key}>{conf.label}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={() => setCreateModalOpen(true)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-500/20 group"
                >
                    <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    New Class
                </button>
            </div>

            {/* Classes List */}
            {isLoading ? (
                <div className="text-center py-20">
                    <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-400 animate-pulse">Loading classes...</p>
                </div>
            ) : filteredClasses.length === 0 ? (
                <div className="text-center py-20 bg-gray-900/30 rounded-2xl border border-gray-800 border-dashed">
                    <div className="bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-gray-500" />
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">No classes found</h3>
                    <p className="text-gray-400 max-w-sm mx-auto mb-6">
                        {searchTerm || statusFilter !== 'all' 
                            ? "Try adjusting your search or filters" 
                            : "Get started by creating your first training class"}
                    </p>
                    {(searchTerm || statusFilter !== 'all') && (
                        <button 
                            onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
                            className="text-blue-400 hover:text-blue-300 font-medium"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredClasses.map((cls) => (
                        <div key={cls.id} className="bg-gray-900/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all hover:shadow-xl hover:shadow-black/20 group backdrop-blur-sm overflow-hidden flex flex-col">
                            {/* Card Header & Status */}
                            <div className="p-5 pb-0 flex items-start justify-between">
                                <div className="flex gap-3">
                                    <div className={`p-2.5 rounded-lg ${cls.template ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-800 text-gray-500'}`}>
                                        {cls.template ? <ProviderIcon provider={cls.template.provider} className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-lg text-white group-hover:text-blue-400 transition-colors line-clamp-1" title={cls.name}>
                                            {cls.name}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            {getStatusBadge(cls.status)}
                                            {cls.template && (
                                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                                    <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                                    {cls.template.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Action Menu */}
                                <div className="relative action-menu-container">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === cls.id ? null : cls.id); }}
                                        className={`p-1.5 rounded-lg transition-colors ${openMenuId === cls.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                                    >
                                        <MoreVertical className="w-5 h-5" />
                                    </button>

                                    {openMenuId === cls.id && (
                                        <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-20 py-1 overflow-hidden scale-in-center origin-top-right">
                                            <button 
                                                onClick={() => openViewModal(cls)}
                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2 transition-colors"
                                            >
                                                <Eye className="w-4 h-4 text-blue-400" /> View Details
                                            </button>
                                            <button 
                                                onClick={() => openEditModal(cls)}
                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2 transition-colors"
                                            >
                                                <Edit className="w-4 h-4 text-amber-400" /> Edit Class
                                            </button>
                                            
                                            <div className="border-t border-gray-800 my-1"></div>
                                            
                                            <button 
                                                onClick={() => handleProvision(cls.id)}
                                                disabled={cls.status !== 'active'}
                                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                                                    cls.status !== 'active' 
                                                        ? 'text-gray-600 cursor-not-allowed' 
                                                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                                                }`}
                                                title={cls.status !== 'active' ? "Class must be active to provision" : "Provision environments"}
                                            >
                                                <Layers className={`w-4 h-4 ${cls.status === 'active' ? 'text-emerald-400' : ''}`} /> Provision
                                            </button>
                                            
                                            <div className="border-t border-gray-800 my-1"></div>
                                            
                                            <button 
                                                onClick={() => openDeleteModal(cls)}
                                                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" /> Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Card Body */}
                            <div className="p-5 space-y-3 flex-1">
                                <p className="text-gray-400 text-sm line-clamp-2 h-10">
                                    {cls.description || "No description provided."}
                                </p>
                                
                                <div className="space-y-2 pt-2">
                                    <div className="flex items-center text-sm text-gray-400">
                                        <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                                        <span>{formatDate(cls.start_date)} - {formatDate(cls.end_date)}</span>
                                    </div>
                                    <div className="flex items-center text-sm text-gray-400">
                                        <Users className="w-4 h-4 mr-2 text-gray-500" />
                                        <span>Capacity: {cls.max_users} Students</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card Footer */}
                            <div className="px-5 py-4 bg-gray-900/80 border-t border-gray-800 flex justify-between items-center text-xs text-gray-500">
                                <span>Updated {new Date(cls.updated_at || cls.created_at || '').toLocaleDateString()}</span>
                                <button 
                                    onClick={() => openViewModal(cls)}
                                    className="text-blue-400 hover:text-blue-300 font-medium"
                                >
                                    Manage &rarr;
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* --- Modals --- */}
            
            <CreateClassModal 
                isOpen={createModalOpen} 
                onClose={() => setCreateModalOpen(false)}
                onSuccess={fetchClasses}
                templates={templates}
            />

            <EditClassModal 
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                onSuccess={fetchClasses}
                classData={selectedClass}
                templates={templates}
            />

            <ViewClassModal 
                isOpen={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                classData={selectedClass}
                onEdit={openEditModal}
                onDelete={openDeleteModal}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title="Delete Class"
                icon={<Trash2 className="w-6 h-6 text-red-500" />}
            >
                <div>
                    <p className="text-gray-300 mb-6">
                        Are you sure you want to delete <span className="text-white font-semibold">{classToDelete?.name}</span>? 
                        This action cannot be undone and will remove all associated student environments.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setDeleteModalOpen(false)}
                            className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-shadow shadow-lg shadow-red-500/20"
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
