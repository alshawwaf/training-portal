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
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Section - Modern and Compact */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-theme/30">
                <div>
                    <div className="flex items-center gap-2.5 mb-1">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                            <BookOpen className="w-5 h-5 text-blue-500" />
                        </div>
                        <h1 className="text-2xl font-black tracking-tight text-primary">Training Classes</h1>
                    </div>
                    <p className="text-xs text-secondary font-medium pl-10 opacity-70">
                        Orchestrate <span className="text-blue-500 font-bold uppercase tracking-tight">Active sessions</span> and monitor fleet health.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group w-full md:w-64 transition-all duration-300">
                        <Search className="w-4 h-4 text-secondary absolute left-3.5 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search classes..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 focus:border-blue-500/50 rounded-xl text-sm text-slate-900 dark:text-white outline-none transition-all placeholder:text-slate-400"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <button
                        onClick={() => setCreateModalOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 active:scale-[0.98] whitespace-nowrap text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        <span>New Class</span>
                    </button>
                </div>
            </div>

            {/* Classes Content */}
            {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-secondary/10 rounded-xl p-4 border border-theme animate-pulse flex items-center gap-4">
                            <div className="h-10 w-10 bg-secondary/20 rounded-lg"></div>
                            <div className="flex-1">
                                <div className="h-4 bg-secondary/20 rounded-full w-1/3 mb-2"></div>
                                <div className="h-3 bg-secondary/20 rounded-full w-1/2"></div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : filteredClasses.length === 0 ? (
                <div className="glass rounded-[2rem] p-20 text-center border border-theme border-dashed bg-secondary/5">
                    <div className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-secondary/10 flex items-center justify-center border border-theme relative">
                        <div className="absolute inset-0 bg-blue-500/5 blur-2xl rounded-full" />
                        <Users className="w-12 h-12 text-secondary opacity-40 relative z-10" />
                    </div>
                    <h3 className="text-2xl font-black text-primary mb-3 tracking-tight">
                        {searchTerm ? "No Matching Records" : "No Classes Active"}
                    </h3>
                    <p className="text-[13px] text-secondary font-medium max-w-sm mx-auto mb-10 leading-relaxed opacity-60">
                        {searchTerm
                            ? "We couldn't find any sessions matching your query. Try adjusting your filters."
                            : "Your training fleet is currently decommissioned. Deploy a new class to begin orchestration."}
                    </p>
                    {!searchTerm && (
                        <button
                            onClick={() => setCreateModalOpen(true)}
                            className="group relative px-8 py-3 bg-blue-600/10 text-blue-500 border border-blue-500/20 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all hover:bg-blue-600 hover:text-white hover:shadow-xl hover:shadow-blue-500/20"
                        >
                            <span className="relative z-10 flex items-center gap-3">
                                <Plus className="w-4 h-4" />
                                Initialize Fleet
                            </span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
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
