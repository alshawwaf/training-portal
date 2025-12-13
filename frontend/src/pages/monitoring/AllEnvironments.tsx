import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { 
    Monitor, Server, RefreshCw, Download, Play, Square, RotateCcw,
    ChevronLeft, ChevronRight, Wifi, WifiOff
} from 'lucide-react';
import FilterBar from '../../components/FilterBar';
import { DateRange } from '../../components/DateRangePicker';

interface EnvironmentVM {
    id: number;
    name: string;
    moid: string;
    ip_address?: string;
    power_state: string;
    access_url?: string;
}

interface Environment {
    id: number;
    name: string;
    class_id: number;
    class_name: string;
    user_id?: number;
    created_at: string;
    vms: EnvironmentVM[];
}

interface ClassModel {
    id: number;
    name: string;
}

const powerStateOptions = [
    { value: 'all', label: 'All States' },
    { value: 'poweredOn', label: 'Powered On' },
    { value: 'poweredOff', label: 'Powered Off' },
];

const perPageOptions = [10, 25, 50];

const AllEnvironments: React.FC = () => {
    const { showToast } = useToast();
    const [environments, setEnvironments] = useState<Environment[]>([]);
    const [classes, setClasses] = useState<ClassModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filter states
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
    const [powerStateFilter, setPowerStateFilter] = useState('all');
    const [classFilter, setClassFilter] = useState('all');

    // Pagination
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);

    const fetchData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            // Fetch classes first
            const classRes = await api.get('/classes/');
            const fetchedClasses = classRes.data;
            setClasses(fetchedClasses);

            // Fetch environments for each class
            const envPromises = fetchedClasses.map(async (cls: ClassModel) => {
                try {
                    const res = await api.get(`/classes/${cls.id}/environments`);
                    return res.data.map((env: any) => ({
                        ...env,
                        class_id: cls.id,
                        class_name: cls.name
                    }));
                } catch {
                    return [];
                }
            });

            const allEnvs = await Promise.all(envPromises);
            setEnvironments(allEnvs.flat());
        } catch (err) {
            showToast('Failed to fetch environments', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line
    }, []);

    const handlePowerControl = async (envId: number, vmId: number, action: string) => {
        try {
            const res = await api.post(`/environments/${envId}/vms/${vmId}/power`, { action });
            if (res.data.success) {
                showToast(`VM ${action} command sent`, 'success');
                fetchData(true);
            }
        } catch (e: any) {
            showToast(`Power action failed: ${e.response?.data?.detail || e.message}`, 'error');
        }
    };

    // Filter logic
    const filteredEnvironments = environments.filter(env => {
        // Search filter (environment name or VM names)
        const matchesSearch = !search || 
            env.name.toLowerCase().includes(search.toLowerCase()) ||
            env.vms.some(vm => vm.name.toLowerCase().includes(search.toLowerCase()));

        // Class filter
        const matchesClass = classFilter === 'all' || env.class_id.toString() === classFilter;

        // Power state filter (any VM matches)
        const matchesPower = powerStateFilter === 'all' || 
            env.vms.some(vm => vm.power_state === powerStateFilter);

        // Date filter
        let matchesDate = true;
        if (dateRange.start || dateRange.end) {
            const envDate = new Date(env.created_at);
            if (dateRange.start) {
                matchesDate = matchesDate && envDate >= new Date(dateRange.start);
            }
            if (dateRange.end) {
                matchesDate = matchesDate && envDate <= new Date(dateRange.end + 'T23:59:59');
            }
        }

        return matchesSearch && matchesClass && matchesPower && matchesDate;
    });

    // Pagination
    const totalPages = Math.ceil(filteredEnvironments.length / perPage);
    const paginatedEnvironments = filteredEnvironments.slice((page - 1) * perPage, page * perPage);

    const handleClearFilters = () => {
        setSearch('');
        setDateRange({ start: null, end: null });
        setPowerStateFilter('all');
        setClassFilter('all');
        setPage(1);
    };

    const handleFilterChange = (key: string, value: string) => {
        if (key === 'power') setPowerStateFilter(value);
        if (key === 'class') setClassFilter(value);
        setPage(1);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Stats
    const totalVMs = environments.reduce((acc, env) => acc + env.vms.length, 0);
    const poweredOnVMs = environments.reduce((acc, env) => 
        acc + env.vms.filter(vm => vm.power_state === 'poweredOn').length, 0);

    const classFilterOptions = [
        { value: 'all', label: 'All Classes' },
        ...classes.map(c => ({ value: c.id.toString(), label: c.name }))
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl">
                            <Monitor className="w-6 h-6 text-white" />
                        </div>
                        All Environments
                    </h1>
                    <p className="text-secondary mt-1">
                        Monitor all student environments and VM power states
                    </p>
                </div>
                <button
                    onClick={() => fetchData(true)}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Filter Bar */}
            <div className="card p-4">
                <FilterBar
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Search environments or VMs..."
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                    filters={[
                        { key: 'class', label: 'Class', options: classFilterOptions, value: classFilter },
                        { key: 'power', label: 'Power State', options: powerStateOptions, value: powerStateFilter }
                    ]}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                />
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-4 gap-4">
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-xl">
                        <Server className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{environments.length}</p>
                        <p className="text-xs text-secondary">Total Environments</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                        <Monitor className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{totalVMs}</p>
                        <p className="text-xs text-secondary">Total VMs</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-green-500/10 rounded-xl">
                        <Wifi className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{poweredOnVMs}</p>
                        <p className="text-xs text-secondary">Powered On</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-red-500/10 rounded-xl">
                        <WifiOff className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{totalVMs - poweredOnVMs}</p>
                        <p className="text-xs text-secondary">Powered Off</p>
                    </div>
                </div>
            </div>

            {/* Environments Grid */}
            <div className="card-elevated p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    </div>
                ) : paginatedEnvironments.length === 0 ? (
                    <div className="text-center py-16">
                        <Monitor className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary">No environments found matching your filters</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginatedEnvironments.map(env => (
                            <div key={env.id} className="bg-secondary/50 rounded-xl p-4 border border-theme hover:border-purple-500/30 transition-colors">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h4 className="font-semibold text-primary">{env.name}</h4>
                                        <p className="text-xs text-secondary">{env.class_name}</p>
                                    </div>
                                    <span className="text-xs text-secondary bg-background px-2 py-1 rounded-full border border-theme">
                                        {env.vms.length} VMs
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {env.vms.map(vm => (
                                        <div key={vm.id} className="flex items-center justify-between bg-background/50 p-2 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${vm.power_state === 'poweredOn' ? 'bg-green-500' : 'bg-red-500'}`} />
                                                <span className="text-sm text-primary truncate max-w-[100px]" title={vm.name}>
                                                    {vm.name.split('-').pop() || vm.name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs font-mono text-secondary mr-1">
                                                    {vm.ip_address || 'No IP'}
                                                </span>
                                                {vm.power_state === 'poweredOn' ? (
                                                    <button 
                                                        onClick={() => handlePowerControl(env.id, vm.id, 'stop')}
                                                        className="p-1 text-red-400 hover:bg-red-500/10 rounded"
                                                        title="Stop VM"
                                                    >
                                                        <Square className="w-3 h-3" />
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => handlePowerControl(env.id, vm.id, 'start')}
                                                        className="p-1 text-green-400 hover:bg-green-500/10 rounded"
                                                        title="Start VM"
                                                    >
                                                        <Play className="w-3 h-3" />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => handlePowerControl(env.id, vm.id, 'reset')}
                                                    className="p-1 text-amber-400 hover:bg-amber-500/10 rounded"
                                                    title="Reset VM"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 pt-3 border-t border-theme">
                                    <p className="text-xs text-secondary">Created: {formatDate(env.created_at)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {!loading && filteredEnvironments.length > 0 && (
                    <div className="flex items-center justify-between pt-6 mt-6 border-t border-theme">
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
                            <span>of {filteredEnvironments.length} environments</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 text-secondary hover:text-primary hover:bg-secondary rounded-lg disabled:opacity-50"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-3 py-1 text-sm text-primary">
                                Page {page} of {totalPages}
                            </span>
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

export default AllEnvironments;
