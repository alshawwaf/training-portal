import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { 
    BookOpen, Users, Eye, Edit, Server, 
    RefreshCw, Download, Search, Filter, Calendar,
    TrendingUp
} from 'lucide-react';
import clsx from 'clsx';

// Import Shared Components
import ClassDetailsModal from '../../components/classes/ClassDetailsModal';
import EditClassModal from '../../components/classes/EditClassModal';

// Import Types
import type { ClassModel, Template } from '../../types/class';
import { statusConfig } from '../../types/class';

const AllClasses: React.FC = () => {
    const { showToast } = useToast();
    const [classes, setClasses] = useState<ClassModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState<Template[]>([]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Modal State
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState<ClassModel | null>(null);

    const fetchClasses = async () => {
        setLoading(true);
        try {
            const res = await api.get('/classes/');
            setClasses(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            showToast('Failed to fetch classes', 'error');
            setClasses([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchTemplates = async () => {
        try {
            const response = await api.get('/templates/');
            setTemplates(response.data);
        } catch (error) {
            console.error('Failed to fetch templates:', error);
        }
    };

    useEffect(() => {
        fetchClasses();
        fetchTemplates();
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const handleExportCSV = () => {
        const headers = ['ID', 'Name', 'Status', 'Max Users', 'Start Date', 'End Date'];
        const rows = filteredClasses.map(cls => [
            cls.id, cls.name, cls.status, cls.max_users, cls.start_date, cls.end_date
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'all_classes.csv';
        a.click();
        showToast('CSV exported successfully', 'success');
    };

    // Modal Handlers
    const openViewModal = (cls: ClassModel) => {
        setSelectedClass(cls);
        setViewModalOpen(true);
    };

    const openEditModal = (cls: ClassModel) => {
        setSelectedClass(cls);
        setEditModalOpen(true);
    };

    // Filter Logic
    const filteredClasses = classes.filter(cls => {
        const matchesSearch = cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              cls.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || cls.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const activeCount = classes.filter(c => c.status === 'active').length;
    const totalCapacity = classes.reduce((sum, c) => sum + c.max_users, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        All Classes
                    </h1>
                    <p className="text-secondary mt-1">Admin view - manage all training classes</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button
                        onClick={() => fetchClasses()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors shadow-lg shadow-blue-500/20"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4">
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-xl">
                        <BookOpen className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{classes.length}</p>
                        <p className="text-xs text-secondary">Total Classes</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl">
                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{activeCount}</p>
                        <p className="text-xs text-secondary">Active Now</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                        <Users className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{totalCapacity}</p>
                        <p className="text-xs text-secondary">Total Capacity</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-xl">
                        <Server className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{filteredClasses.length}</p>
                        <p className="text-xs text-secondary">Showing</p>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex items-center gap-4 p-4 bg-secondary/30 rounded-xl border border-theme">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-secondary" />
                    <input
                        type="text"
                        placeholder="Search classes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="input pl-10 w-full"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-secondary" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="input cursor-pointer"
                    >
                        <option value="all">All Status</option>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
                {(searchTerm || statusFilter !== 'all') && (
                    <button
                        onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
                        className="text-sm text-blue-400 hover:text-blue-300"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="card-elevated overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    </div>
                ) : filteredClasses.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary mb-2">No classes match your filters</p>
                        <button
                            onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                            Clear filters
                        </button>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-secondary/50 border-b border-theme">
                            <tr>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Class</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Status</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Capacity</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Schedule</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y border-theme">
                            {filteredClasses.map(cls => {
                                const config = statusConfig[cls.status] || statusConfig.draft;
                                return (
                                    <tr key={cls.id} className="hover:bg-secondary/30 transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                                    {cls.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-primary group-hover:text-blue-400 transition-colors cursor-pointer" onClick={() => openViewModal(cls)}>
                                                        {cls.name}
                                                    </p>
                                                    <p className="text-xs text-secondary font-mono">Passcode: {cls.passcode}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={clsx(
                                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border",
                                                config.bgColor,
                                                config.color
                                            )}>
                                                <span className={clsx("w-1.5 h-1.5 rounded-full", config.color.replace('text-', 'bg-'))} />
                                                {config.label}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <Users className="w-4 h-4 text-secondary" />
                                                <span className="text-primary font-medium">{cls.max_users}</span>
                                                <span className="text-secondary text-xs">seats</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-secondary" />
                                                <div>
                                                    <p className="text-sm text-primary">{formatDate(cls.start_date)}</p>
                                                    <p className="text-xs text-secondary">to {formatDate(cls.end_date)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openViewModal(cls)}
                                                    className="p-2 text-secondary hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                    title="View Details"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => openEditModal(cls)}
                                                    className="p-2 text-secondary hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                                                    title="Edit Class"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modals */}
            <ClassDetailsModal 
                isOpen={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                classData={selectedClass}
            />

            <EditClassModal 
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                onSuccess={fetchClasses}
                classData={selectedClass}
                templates={templates}
            />
        </div>
    );
};

export default AllClasses;
