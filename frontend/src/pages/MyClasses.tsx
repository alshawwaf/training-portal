import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Link } from 'react-router-dom';
import { 
    BookOpen, Users, Calendar, Eye, Edit, Server, 
    ChevronLeft, ChevronRight, RefreshCw, Plus
} from 'lucide-react';
import FilterBar from '../components/FilterBar';
import { DateRange } from '../components/DateRangePicker';

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

const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
];

const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const MyClasses: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [classes, setClasses] = useState<ClassModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filter states
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
    const [statusFilter, setStatusFilter] = useState('all');

    // Pagination
    const [page, setPage] = useState(1);
    const perPage = 10;

    const fetchClasses = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const res = await api.get('/classes/');
            // Filter to only user's classes (instructor_id matches)
            const myClasses = res.data.filter((cls: ClassModel) => 
                cls.instructor_id === user?.id
            );
            setClasses(myClasses);
        } catch (err) {
            showToast('Failed to fetch your classes', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchClasses();
        // eslint-disable-next-line
    }, []);

    // Filter logic
    const filteredClasses = classes.filter(cls => {
        const matchesSearch = !search || 
            cls.name.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || cls.status === statusFilter;
        
        let matchesDate = true;
        if (dateRange.start || dateRange.end) {
            const classDate = new Date(cls.start_date);
            if (dateRange.start) matchesDate = matchesDate && classDate >= new Date(dateRange.start);
            if (dateRange.end) matchesDate = matchesDate && classDate <= new Date(dateRange.end + 'T23:59:59');
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    // Pagination
    const totalPages = Math.ceil(filteredClasses.length / perPage);
    const paginatedClasses = filteredClasses.slice((page - 1) * perPage, page * perPage);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const handleClearFilters = () => {
        setSearch('');
        setDateRange({ start: null, end: null });
        setStatusFilter('all');
        setPage(1);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        My Classes
                    </h1>
                    <p className="text-secondary mt-1">
                        Classes you've created and are instructing
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchClasses(true)}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <Link
                        to="/classes/new"
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Class
                    </Link>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="card p-4">
                <FilterBar
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Search your classes..."
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                    filters={[
                        { key: 'status', label: 'Status', options: statusOptions, value: statusFilter }
                    ]}
                    onFilterChange={(key, value) => { if (key === 'status') setStatusFilter(value); setPage(1); }}
                    onClearFilters={handleClearFilters}
                />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/10 rounded-xl">
                        <BookOpen className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{classes.length}</p>
                        <p className="text-xs text-secondary">My Classes</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-green-500/10 rounded-xl">
                        <Server className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">
                            {classes.filter(c => c.status === 'active').length}
                        </p>
                        <p className="text-xs text-secondary">Active</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-xl">
                        <Users className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">
                            {classes.reduce((acc, c) => acc + c.max_users, 0)}
                        </p>
                        <p className="text-xs text-secondary">Total Capacity</p>
                    </div>
                </div>
            </div>

            {/* Classes List */}
            <div className="card-elevated overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                ) : paginatedClasses.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary mb-4">
                            {classes.length === 0 
                                ? "You haven't created any classes yet" 
                                : "No classes match your filters"}
                        </p>
                        {classes.length === 0 && (
                            <Link to="/classes/new" className="text-blue-500 hover:text-blue-400 font-medium">
                                Create your first class →
                            </Link>
                        )}
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
                            {paginatedClasses.map(cls => (
                                <tr key={cls.id} className="hover:bg-secondary/30 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
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
                                                className="p-2 text-secondary hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                title="View"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Link>
                                            <Link
                                                to={`/classes/edit/${cls.id}`}
                                                className="p-2 text-secondary hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
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

                {/* Pagination */}
                {!loading && filteredClasses.length > perPage && (
                    <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-t border-theme">
                        <p className="text-sm text-secondary">
                            Showing {((page - 1) * perPage) + 1} - {Math.min(page * perPage, filteredClasses.length)} of {filteredClasses.length}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 text-secondary hover:text-primary hover:bg-secondary rounded-lg disabled:opacity-50"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-3 py-1 text-sm text-primary">Page {page} of {totalPages}</span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-2 text-secondary hover:text-primary hover:bg-secondary rounded-lg disabled:opacity-50"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyClasses;
