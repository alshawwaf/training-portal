import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Users, Monitor, Clock, ArrowUpRight, Sparkles, Eye, Edit, Trash2, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

interface ClassModel {
    id: number;
    name: string;
    blueprint_id: string;
    max_users: number;
    passcode: string;
    start_date: string;
    end_date: string;
    instructor_id: number;
    status?: string;
    description?: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [classes, setClasses] = useState<ClassModel[]>([]);
  
  // Modal states
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassModel | null>(null);
  const [editForm, setEditForm] = useState<Partial<ClassModel>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchClasses = async () => {
    try {
        const res = await api.get('/classes/');
        setClasses(res.data);
    } catch {
        console.error("Failed to fetch classes");
    }
  };

  useEffect(() => {
    fetchClasses();
    // eslint-disable-next-line
  }, []);

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

  const openViewModal = (cls: ClassModel) => {
    setSelectedClass(cls);
    setViewModalOpen(true);
  };

  const openDeleteModal = (cls: ClassModel) => {
    setSelectedClass(cls);
    setDeleteModalOpen(true);
  };

  const openEditModal = (cls: ClassModel) => {
    setSelectedClass(cls);
    setEditForm({
      name: cls.name,
      blueprint_id: cls.blueprint_id,
      max_users: cls.max_users,
      passcode: cls.passcode,
      start_date: cls.start_date?.slice(0, 16) || '',
      end_date: cls.end_date?.slice(0, 16) || '',
      status: cls.status || 'draft',
      description: cls.description || '',
    });
    setEditModalOpen(true);
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

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
  };

  const stats = [
    { 
      label: 'Active Environments', 
      value: '12', 
      icon: Monitor, 
      color: 'purple',
      gradient: 'from-purple-600 to-pink-600',
      bgGradient: 'from-purple-500/10 to-pink-500/5'
    },
    { 
      label: 'Total Students', 
      value: '45', 
      icon: Users, 
      color: 'emerald',
      gradient: 'from-emerald-600 to-teal-600',
      bgGradient: 'from-emerald-500/10 to-teal-500/5'
    },
    { 
      label: 'Upcoming Classes', 
      value: classes.length.toString(), 
      icon: Clock, 
      color: 'blue',
      gradient: 'from-blue-600 to-cyan-600',
      bgGradient: 'from-blue-500/10 to-cyan-500/5'
    },
  ];

  return (
    <div className="space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between">
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-primary">Dashboard</h1>
                    <span className="badge badge-info flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Live
                    </span>
                </div>
                <p className="text-secondary">Welcome back, <span className="text-primary font-medium">{user?.name}</span>. Here's what's happening.</p>
            </div>
            
            {/* Button Removed */}
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stats.map((stat) => (
                <div 
                    key={stat.label} 
                    className={`relative overflow-hidden card p-6 bg-gradient-to-br ${stat.bgGradient} hover:border-gray-600/50 transition-all duration-300 group`}
                >
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-secondary mb-1">{stat.label}</p>
                            <p className="text-4xl font-bold text-primary tracking-tight">{stat.value}</p>
                        </div>
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg`}>
                            <stat.icon className="w-6 h-6 text-white" />
                        </div>
                    </div>
                    {/* Decorative element */}
                    <div className={`absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br ${stat.gradient} opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity`} />
                </div>
            ))}
        </div>

        {/* Classes Section */}
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-primary">Your Classes</h2>
                <Link to="/classes" className="text-sm text-secondary hover:text-primary flex items-center gap-1 transition-colors">
                    View all
                    <ArrowUpRight className="w-4 h-4" />
                </Link>
            </div>
            
            <div className="card-elevated overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-secondary/50 border-b border-theme">
                        <tr>
                            <th className="p-4 text-secondary font-medium text-sm">Class Name</th>
                            <th className="p-4 text-secondary font-medium text-sm">Blueprint</th>
                            <th className="p-4 text-secondary font-medium text-sm">Students</th>
                            <th className="p-4 text-secondary font-medium text-sm">Status</th>
                            <th className="p-4 text-secondary font-medium text-sm text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y border-theme">
                        {classes.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-12 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                                            <Monitor className="w-8 h-8 text-secondary" />
                                        </div>
                                        <p className="text-secondary">No classes found</p>
                                        <Link to="/classes/new" className="text-blue-500 hover:text-blue-400 text-sm font-medium">
                                            Create your first class →
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            classes.map((cls) => (
                                <tr key={cls.id} className="hover:bg-secondary/30 transition-colors group">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                                {cls.name.charAt(0)}
                                            </div>
                                            <span 
                                                className="text-primary font-medium group-hover:text-blue-500 transition-colors cursor-pointer"
                                                onClick={() => openViewModal(cls)}
                                            >
                                                {cls.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className="bg-secondary px-3 py-1.5 rounded-lg text-xs text-secondary font-mono">
                                            Template {cls.blueprint_id}
                                        </span>
                                    </td>
                                    <td className="p-4 text-secondary">
                                        <span className="font-medium text-primary">0</span>
                                        <span className="text-secondary"> / {cls.max_users}</span>
                                    </td>
                                    <td className="p-4">
                                        <span className="badge badge-success">Active</span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
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
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* View Modal */}
        <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title="Class Details" maxWidth="lg">
            {selectedClass && (
                <div className="space-y-4">
                    <div className="flex items-center gap-4 pb-4 border-b border-theme">
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                            {selectedClass.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-primary">{selectedClass.name}</h3>
                            <p className="text-secondary">Template {selectedClass.blueprint_id}</p>
                        </div>
                    </div>
                    
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
                    </div>
                </div>
            )}
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

        {/* Edit Class Modal */}
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
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default Dashboard;
