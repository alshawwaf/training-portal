import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { Link } from 'react-router-dom';
import { 
    BookOpen, Users, Calendar, Eye, Edit, Trash2, Server, 
    ChevronLeft, ChevronRight, Download, RefreshCw 
} from 'lucide-react';
import FilterBar from '../../components/FilterBar';
import { DateRange } from '../../components/DateRangePicker';

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
    updated_at?: string;
}

const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'postponed', label: 'Postponed' },
];

const perPageOptions = [10, 25, 50];

const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
    postponed: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const AllClasses: React.FC = () => {
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
    const [perPage, setPerPage] = useState(10);

    const fetchClasses = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const res = await api.get('/classes/');
            setClasses(res.data);
        } catch (err) {
            showToast('Failed to fetch classes', 'error');
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
        // Search filter
        const matchesSearch = !search || 
            cls.name.toLowerCase().includes(search.toLowerCase()) ||
            cls.description?.toLowerCase().includes(search.toLowerCase());

        // Status filter
        const matchesStatus = statusFilter === 'all' || cls.status === statusFilter;

        // Date filter
        let matchesDate = true;
        if (dateRange.start || dateRange.end) {
            const classDate = new Date(cls.created_at || cls.start_date);
            if (dateRange.start) {
                matchesDate = matchesDate && classDate >= new Date(dateRange.start);
            }
            if (dateRange.end) {
                matchesDate = matchesDate && classDate <= new Date(dateRange.end + 'T23:59:59');
            }
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    // Pagination
    const totalPages = Math.ceil(filteredClasses.length / perPage);
    const paginatedClasses = filteredClasses.slice((page - 1) * perPage, page * perPage);

    const handleClearFilters = () => {
        setSearch('');
        setDateRange({ start: null, end: null });
        setStatusFilter('all');
        setPage(1);
    };

    const handleFilterChange = (key: string, value: string) => {
        if (key === 'status') setStatusFilter(value);
        setPage(1);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const handleExport = () => {
        const csv = [
            ['ID', 'Name', 'Status', 'Max Users', 'Start Date', 'End Date', 'Created'].join(','),
            ...filteredClasses.map(cls => [
                cls.id,
                `"${cls.name}"`,
                cls.status,
                cls.max_users,
                cls.start_date,
                cls.end_date,
                cls.created_at
            ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `all-classes-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Classes exported successfully', 'success');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        All Classes
                    </h1>
                    <p className="text-secondary mt-1">
                        Manage and monitor all training classes across the platform
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
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="card p-4">
                <FilterBar
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Search by class name..."
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                    filters={[
                        { key: 'status', label: 'Status', options: statusOptions, value: statusFilter }
                    ]}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                />
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-4 gap-4">
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                        <BookOpen className="w-5 h-5 text-blue-500" />
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
                        <p className="text-2xl font-bold text-primary">
                            {classes.filter(c => c.status === 'active').length}
                        </p>
                        <p className="text-xs text-secondary">Active</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-xl">
                        <Calendar className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">
                            {classes.filter(c => c.status === 'draft').length}
                        </p>
                        <p className="text-xs text-secondary">Draft</p>
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

            {/* Classes Table */}
            <div className="card-elevated overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : paginatedClasses.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary">No classes found matching your filters</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-secondary/50 border-b border-theme">
                            <tr>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Class</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Status</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Capacity</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Schedule</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider">Created</th>
                                <th className="p-4 text-xs text-secondary font-medium uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y border-theme">
                            {paginatedClasses.map(cls => (
                                <tr key={cls.id} className="hover:bg-secondary/30 transition-colors group">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                                {cls.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-medium text-primary">{cls.name}</p>
                                                <p className="text-xs text-secondary">ID: {cls.id}</p>
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
                                    <td className="p-4 text-sm text-secondary">
                                        {cls.created_at ? formatDate(cls.created_at) : '-'}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-end gap-1">
                                            <Link
                                                to={`/classes`}
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
                {!loading && filteredClasses.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-t border-theme">
                        <div className="flex items-center gap-2 text-sm text-secondary">
                            <span>Showing</span>
                            <select
                                value={perPage}
                                onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                                className="px-2 py-1 bg-secondary/50 border border-theme rounded text-primary"
                            >
                                {perPageOptions.map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                            <span>of {filteredClasses.length} results</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 text-secondary hover:text-primary hover:bg-secondary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-3 py-1 text-sm text-primary">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-2 text-secondary hover:text-primary hover:bg-secondary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
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

export default AllClasses;
