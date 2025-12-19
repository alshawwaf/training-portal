import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Search, Users, Trash2, BookOpen } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

// Import Types
import type { ClassModel, Template } from '../types/class';

// Import New Modals
import CreateClassModal from '../components/classes/CreateClassModal';
import EditClassModal from '../components/classes/EditClassModal';
import ClassDetailsModal from '../components/classes/ClassDetailsModal';
import ClassCard from '../components/classes/ClassCard';

const TrainingClasses: React.FC = () => {
    const { showToast } = useToast();
    const [classes, setClasses] = useState<ClassModel[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
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

    // Filter Logic
    const filteredClasses = classes.filter(cls => {
        const matchesSearch = cls.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              cls.description?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section - Templates Style */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                            <BookOpen className="w-5 h-5 text-blue-500" />
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Training Classes</h1>
                    </div>
                    <p className="text-secondary font-medium pl-10">
                        Manage and orchestrate <span className="text-blue-500 font-bold">training sessions</span> for your team.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group max-w-xs transition-all duration-300 focus-within:max-w-md">
                        <Search className="w-5 h-5 text-secondary absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Find classes..."
                            className="input pl-12 bg-secondary/30 border-theme/50 focus:border-blue-500/50 rounded-2xl w-full"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <button
                        onClick={() => setCreateModalOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">New Class</span>
                    </button>
                </div>
            </div>

            {/* Classes Content */}
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
            ) : filteredClasses.length === 0 ? (
                <div className="glass rounded-[3rem] border border-dashed border-theme p-20 text-center shadow-xl">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-[2rem] bg-secondary/20 flex items-center justify-center border border-theme">
                        <Users className="w-12 h-12 text-secondary/50" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-primary mb-3 tracking-tight">
                        {searchTerm ? "No classes match your search" : "Your roster is empty"}
                    </h3>
                    <p className="text-secondary font-medium max-w-sm mx-auto mb-8">
                        {searchTerm
                            ? "Try refining your keywords to find what you're looking for."
                            : "Classes define training sessions with environments for your participants."}
                    </p>
                    {!searchTerm && (
                        <button
                            onClick={() => setCreateModalOpen(true)}
                            className="btn-primary"
                        >
                            <Plus className="w-5 h-5" />
                            Create First Class
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredClasses.map((cls) => (
                        <ClassCard 
                            key={cls.id}
                            cls={cls}
                            onView={openViewModal}
                            onEdit={openEditModal}
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

            <ClassDetailsModal 
                isOpen={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                classData={selectedClass}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title="Decommission"
                maxWidth="sm"
            >
                <div className="space-y-6 text-center">
                    <div className="w-20 h-20 mx-auto rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                        <Trash2 className="w-10 h-10 text-red-500" />
                    </div>
                    <div>
                        <h4 className="text-xl font-extrabold text-primary mb-2">Delete Class?</h4>
                        <p className="text-secondary font-medium">This action cannot be undone. All environments associated with <span className="text-primary font-bold">{classToDelete?.name}</span> will be purged.</p>
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

export default TrainingClasses;
