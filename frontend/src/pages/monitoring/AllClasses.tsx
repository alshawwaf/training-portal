import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { Link } from 'react-router-dom';
import { 
    BookOpen, Users, Calendar, Eye, Edit, Trash2, Server, 
    RefreshCw, Download
} from 'lucide-react';

interface ClassModel {
    id: number;
    name: string;
    blueprint_id: string;
    template_id?: number;
    max_users: number;
    passcode: string;
    start_date: string;
    end_date: string;
    instructor_id: number;
    status: string;
    description?: string;
    created_at?: string;
}

const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const AllClasses: React.FC = () => {
    const { showToast } = useToast();
    const [classes, setClasses] = useState<ClassModel[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchClasses = async () => {
        setLoading(true);
        try {
            const res = await api.get('/classes/');
            setClasses(res.data);
        } catch (err) {
            showToast('Failed to fetch classes', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClasses();
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const handleExportCSV = () => {
        const headers = ['ID', 'Name', 'Status', 'Max Users', 'Start Date', 'End Date'];
        const rows = classes.map(cls => [
            cls.id, cls.name, cls.status, cls.max_users, cls.start_date, cls.end_date
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'all_classes.csv';
        a.click();
    };

    const activeCount = classes.filter(c => c.status === 'active').length;
    const totalCapacity = classes.reduce((sum, c) => sum + c.max_users, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        All Classes
                    </h1>
                    <p className="text-secondary mt-1">Admin view - all classes in the system</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                    <button
                        onClick={() => fetchClasses()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
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
                    <div className="p-3 bg-green-500/10 rounded-xl">
                        <Server className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{activeCount}</p>
                        <p className="text-xs text-secondary">Active</p>
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
            </div>

            {/* Table */}
            <div className="card-elevated overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    </div>
                ) : classes.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary">No classes found</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-secondary/50 border-b border-theme">
                            <tr>
                                <th className="p-4 text-xs text-secondary font-medium uppercase">Class</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase">Status</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase">Capacity</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase">Schedule</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y border-theme">
                            {classes.map(cls => (
                                <tr key={cls.id} className="hover:bg-secondary/30 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-sm">
                                                {cls.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-medium text-primary">{cls.name}</p>
                                                <p className="text-xs text-secondary">Passcode: {cls.passcode}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium border ${statusColors[cls.status] || statusColors.draft}`}>
                                            {cls.status.charAt(0).toUpperCase() + cls.status.slice(1)}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className="text-primary font-medium">{cls.max_users}</span>
                                        <span className="text-secondary ml-1">students</span>
                                    </td>
                                    <td className="p-4">
                                        <p className="text-sm text-primary">{formatDate(cls.start_date)}</p>
                                        <p className="text-xs text-secondary">to {formatDate(cls.end_date)}</p>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Link
                                                to="/classes"
                                                className="p-2 text-secondary hover:text-blue-500 hover:bg-blue-500/10 rounded-lg"
                                                title="View"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Link>
                                            <Link
                                                to={`/classes/edit/${cls.id}`}
                                                className="p-2 text-secondary hover:text-amber-500 hover:bg-amber-500/10 rounded-lg"
                                                title="Edit"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default AllClasses;
