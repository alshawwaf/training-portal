import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Search, Users, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

// Import Types
import type { ClassModel, Template } from '../types/class';
import { statusConfig } from '../types/class';

// Import New Modals
import CreateClassModal from '../components/classes/CreateClassModal';
import EditClassModal from '../components/classes/EditClassModal';
import ClassInfoModal from '../components/classes/ClassInfoModal';
import ClassCard from '../components/classes/ClassCard';

const TrainingClasses: React.FC = () => {
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




    // getStatusBadge removed as it is now handled by ClassCard

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
                <h1 className="text-3xl font-bold text-primary mb-2">Training Classes</h1>
                <p className="text-secondary">Manage training classes and student environments</p>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-secondary/50 p-4 rounded-xl border border-theme backdrop-blur-sm">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search classes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input pl-10"
                        />
                    </div>
                    
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="input cursor-pointer"
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
                    <p className="text-secondary animate-pulse">Loading classes...</p>
                </div>
            ) : filteredClasses.length === 0 ? (
                <div className="text-center py-20 bg-secondary/30 rounded-2xl border border-theme border-dashed">
                    <div className="bg-secondary w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-gray-500" />
                    </div>
                    <h3 className="text-xl font-medium text-primary mb-2">No classes found</h3>
                    <p className="text-secondary max-w-sm mx-auto mb-6">
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
                        <ClassCard 
                            key={cls.id}
                            cls={cls}
                            onView={openViewModal}
                            onEdit={openEditModal}
                            onDelete={openDeleteModal}
                            onRefresh={fetchClasses}
                        />
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

            <ClassInfoModal 
                isOpen={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                classData={selectedClass}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title="Delete Class"
                icon={<Trash2 className="w-6 h-6 text-red-500" />}
            >
                <div>
                    <p className="text-secondary mb-6">
                        Are you sure you want to delete <span className="text-primary font-semibold">{classToDelete?.name}</span>? 
                        This action cannot be undone and will remove all associated student environments.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setDeleteModalOpen(false)}
                            className="btn-secondary"
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

export default TrainingClasses;
