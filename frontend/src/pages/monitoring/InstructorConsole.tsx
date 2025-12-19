import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { 
    Users, RefreshCw, Monitor, ChevronDown, Eye,
    RotateCcw, Power, PowerOff, AlertCircle, Clock,
    HelpCircle, Zap, Activity, Server
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../../components/Modal';

interface VM {
    id: number;
    name: string;
    status: string;
    ip_address?: string;
}

interface Student {
    id: number;
    email: string;
    name?: string;
    environment_id?: number;
    environment_name?: string;
    status: string;
    joined_at?: string;
    last_active?: string;
    needs_help: boolean;
    vms: VM[];
}

interface ClassInfo {
    id: number;
    name: string;
    status: string;
    student_count: number;
    environment_count: number;
}

interface ClassStudentsData {
    class_id: number;
    class_name: string;
    class_status: string;
    total_students: number;
    active_students: number;
    needs_help_count: number;
    students: Student[];
}

interface StudentDetailData {
    student: {
        id: number;
        email: string;
        name?: string;
        joined_at?: string;
        last_active?: string;
    };
    environment: {
        id: number;
        name: string;
    } | null;
    vms: Array<{
        id: number;
        name: string;
        moid: string;
        status: string;
        ip_address?: string;
        guest_os?: string;
        console_url: string;
    }>;
    class: {
        id: number;
        name: string;
    };
}

const InstructorConsole: React.FC = () => {
    const { showToast } = useToast();
    
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
    const [classData, setClassData] = useState<ClassStudentsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Student detail modal
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [studentDetail, setStudentDetail] = useState<StudentDetailData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    
    // Action loading states
    const [actionLoading, setActionLoading] = useState<{studentId: number, action: string} | null>(null);

    // Fetch available classes
    useEffect(() => {
        fetchClasses();
    }, []);

    // Fetch students when class is selected
    useEffect(() => {
        if (selectedClassId) {
            fetchClassStudents();
            const interval = setInterval(fetchClassStudents, 15000); // Auto-refresh every 15s
            return () => clearInterval(interval);
        }
    }, [selectedClassId]);

    const fetchClasses = async () => {
        try {
            const res = await api.get('/instructor/classes');
            setClasses(res.data);
            // Auto-select first class if available
            if (res.data.length > 0 && !selectedClassId) {
                setSelectedClassId(res.data[0].id);
            }
        } catch (err) {
            showToast('Failed to fetch classes', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchClassStudents = async () => {
        if (!selectedClassId) return;
        
        setRefreshing(true);
        try {
            const res = await api.get(`/instructor/class/${selectedClassId}/students`);
            setClassData(res.data);
        } catch (err) {
            showToast('Failed to fetch students', 'error');
        } finally {
            setRefreshing(false);
        }
    };

    const handleStudentAction = async (studentId: number, action: string) => {
        if (!selectedClassId) return;
        
        setActionLoading({ studentId, action });
        try {
            await api.post(`/instructor/class/${selectedClassId}/student/${studentId}/action`, { action });
            showToast(`Action '${action}' completed`, 'success');
            fetchClassStudents(); // Refresh data
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Action failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const openStudentDetail = async (student: Student) => {
        if (!selectedClassId) return;
        
        setSelectedStudent(student);
        setDetailLoading(true);
        
        try {
            const res = await api.get(`/instructor/class/${selectedClassId}/student/${student.id}/environment`);
            setStudentDetail(res.data);
        } catch (err) {
            showToast('Failed to load student details', 'error');
        } finally {
            setDetailLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-emerald-500';
            case 'idle': return 'bg-amber-500';
            default: return 'bg-slate-500';
        }
    };

    const getStatusBg = (status: string) => {
        switch (status) {
            case 'active': return 'bg-emerald-500/10 border-emerald-500/30';
            case 'idle': return 'bg-amber-500/10 border-amber-500/30';
            default: return 'bg-slate-500/10 border-slate-500/30';
        }
    };

    const getVmStatusColor = (status: string) => {
        return status === 'poweredOn' ? 'text-emerald-500' : 'text-red-500';
    };

    const formatTimeAgo = (dateStr?: string) => {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
        
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    const countOnlineVms = (student: Student) => {
        return student.vms.filter(vm => vm.status === 'poweredOn').length;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-secondary animate-pulse">Loading Instructor Console...</p>
                </div>
            </div>
        );
    }

    if (classes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl mb-6">
                    <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-primary mb-2">No Active Classes</h2>
                    <p className="text-secondary">There are no active or upcoming classes to monitor.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                            <Monitor className="w-5 h-5 text-indigo-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-primary">Instructor Console</h1>
                    </div>
                    <p className="text-secondary pl-10">Monitor and manage student environments in real-time</p>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* Class Selector */}
                    <div className="relative">
                        <select
                            value={selectedClassId || ''}
                            onChange={(e) => setSelectedClassId(Number(e.target.value))}
                            className="appearance-none bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2 pr-10 text-white font-medium focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 cursor-pointer min-w-[200px]"
                        >
                            {classes.map(cls => (
                                <option key={cls.id} value={cls.id} className="bg-slate-800 text-white">
                                    {cls.name} ({cls.student_count} students)
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
                    </div>
                    
                    <button
                        onClick={fetchClassStudents}
                        disabled={refreshing}
                        className="p-2 rounded-xl bg-secondary/30 border border-theme hover:bg-secondary/50 transition-all"
                    >
                        <RefreshCw className={clsx("w-5 h-5 text-secondary", refreshing && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {classData && (
                <div className="grid grid-cols-4 gap-4">
                    <StatCard
                        icon={Users}
                        label="Total Students"
                        value={classData.total_students}
                        color="blue"
                    />
                    <StatCard
                        icon={Activity}
                        label="Active Now"
                        value={classData.active_students}
                        color="emerald"
                    />
                    <StatCard
                        icon={Clock}
                        label="Idle"
                        value={classData.total_students - classData.active_students}
                        color="amber"
                    />
                    <StatCard
                        icon={HelpCircle}
                        label="Need Help"
                        value={classData.needs_help_count}
                        color="red"
                    />
                </div>
            )}

            {/* Student Grid */}
            {classData && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {classData.students.map(student => (
                        <StudentCard
                            key={student.id}
                            student={student}
                            onViewDetails={() => openStudentDetail(student)}
                            onAction={(action) => handleStudentAction(student.id, action)}
                            isLoading={actionLoading?.studentId === student.id}
                            loadingAction={actionLoading?.action}
                            formatTimeAgo={formatTimeAgo}
                            countOnlineVms={countOnlineVms}
                            getStatusColor={getStatusColor}
                            getStatusBg={getStatusBg}
                        />
                    ))}
                    
                    {classData.students.length === 0 && (
                        <div className="col-span-full text-center py-12">
                            <Users className="w-12 h-12 text-secondary/30 mx-auto mb-4" />
                            <p className="text-secondary">No students have joined this class yet.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Student Detail Modal */}
            <Modal
                isOpen={!!selectedStudent}
                onClose={() => { setSelectedStudent(null); setStudentDetail(null); }}
                title={`Student: ${selectedStudent?.name || selectedStudent?.email}`}
                maxWidth="2xl"
            >
                {detailLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : studentDetail ? (
                    <div className="space-y-6">
                        {/* Student Info */}
                        <div className="flex items-center gap-4 p-4 bg-secondary/10 rounded-xl">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                                {(studentDetail.student.name || studentDetail.student.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-primary">{studentDetail.student.name || 'No Name'}</p>
                                <p className="text-sm text-secondary">{studentDetail.student.email}</p>
                            </div>
                            <div className="text-right text-sm">
                                <p className="text-secondary">Joined: {formatTimeAgo(studentDetail.student.joined_at)}</p>
                                <p className="text-secondary">Last Active: {formatTimeAgo(studentDetail.student.last_active)}</p>
                            </div>
                        </div>

                        {/* Environment Info */}
                        {studentDetail.environment ? (
                            <div>
                                <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">
                                    Environment: {studentDetail.environment.name}
                                </h3>
                                <div className="space-y-3">
                                    {studentDetail.vms.map(vm => (
                                        <div key={vm.id} className="flex items-center justify-between p-4 bg-secondary/10 border border-theme rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <Server className={clsx("w-5 h-5", getVmStatusColor(vm.status))} />
                                                <div>
                                                    <p className="font-medium text-primary">{vm.name}</p>
                                                    <p className="text-xs text-secondary">{vm.ip_address || 'No IP'} • {vm.guest_os || 'Unknown OS'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={clsx(
                                                    "px-2 py-1 rounded-full text-xs font-medium",
                                                    vm.status === 'poweredOn' 
                                                        ? "bg-emerald-500/10 text-emerald-500" 
                                                        : "bg-red-500/10 text-red-500"
                                                )}>
                                                    {vm.status}
                                                </span>
                                                <a
                                                    href={vm.console_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg transition-colors"
                                                    title="Open Console"
                                                >
                                                    <Monitor className="w-4 h-4" />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-secondary">
                                <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p>No environment assigned</p>
                            </div>
                        )}

                        {/* Quick Actions */}
                        <div className="flex gap-3 border-t border-theme pt-4">
                            <button
                                onClick={() => { handleStudentAction(selectedStudent!.id, 'revert'); }}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl hover:bg-amber-500/20 transition-colors font-medium"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Revert All
                            </button>
                            <button
                                onClick={() => { handleStudentAction(selectedStudent!.id, 'restart_all'); }}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-xl hover:bg-blue-500/20 transition-colors font-medium"
                            >
                                <Power className="w-4 h-4" />
                                Restart All
                            </button>
                            <button
                                onClick={() => { handleStudentAction(selectedStudent!.id, 'power_off_all'); }}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors font-medium"
                            >
                                <PowerOff className="w-4 h-4" />
                                Power Off All
                            </button>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
};

// ============ Sub-components ============

const StatCard: React.FC<{
    icon: any;
    label: string;
    value: number;
    color: 'blue' | 'emerald' | 'amber' | 'red';
}> = ({ icon: Icon, label, value, color }) => {
    const colorClasses = {
        blue: 'bg-blue-500/10 border-blue-500/20 text-blue-500',
        emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
        amber: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
        red: 'bg-red-500/10 border-red-500/20 text-red-500'
    };
    
    return (
        <div className={clsx("p-4 rounded-2xl border", colorClasses[color])}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs uppercase tracking-wider opacity-70">{label}</p>
                </div>
                <Icon className="w-8 h-8 opacity-50" />
            </div>
        </div>
    );
};

const StudentCard: React.FC<{
    student: Student;
    onViewDetails: () => void;
    onAction: (action: string) => void;
    isLoading: boolean;
    loadingAction?: string;
    formatTimeAgo: (date?: string) => string;
    countOnlineVms: (student: Student) => number;
    getStatusColor: (status: string) => string;
    getStatusBg: (status: string) => string;
}> = ({ student, onViewDetails, onAction, isLoading, loadingAction, formatTimeAgo, countOnlineVms, getStatusColor, getStatusBg }) => {
    const [showActions, setShowActions] = useState(false);
    
    return (
        <div 
            className={clsx(
                "group relative rounded-2xl border transition-all duration-300 overflow-hidden",
                "bg-secondary/10 hover:bg-secondary/20 border-theme hover:border-blue-500/30",
                student.needs_help && "ring-2 ring-red-500 ring-offset-2 ring-offset-transparent"
            )}
        >
            {/* Status indicator bar at top */}
            <div className={clsx("h-1", getStatusColor(student.status))} />
            
            <div className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold",
                            "bg-gradient-to-br from-blue-500 to-indigo-600"
                        )}>
                            {(student.name || student.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <p className="font-bold text-primary truncate">{student.environment_name || `Student ${student.id}`}</p>
                            <p className="text-xs text-secondary truncate">{student.email}</p>
                        </div>
                    </div>
                    
                    {student.needs_help && (
                        <div className="p-1.5 bg-red-500/20 rounded-lg animate-pulse">
                            <HelpCircle className="w-4 h-4 text-red-500" />
                        </div>
                    )}
                </div>

                {/* VM Status */}
                <div className="flex items-center gap-2 mb-3">
                    <Server className="w-4 h-4 text-secondary" />
                    <span className="text-sm text-secondary">
                        {countOnlineVms(student)}/{student.vms.length} VMs online
                    </span>
                    <div className="flex-1 flex justify-end gap-1">
                        {student.vms.slice(0, 3).map(vm => (
                            <div 
                                key={vm.id}
                                className={clsx(
                                    "w-2 h-2 rounded-full",
                                    vm.status === 'poweredOn' ? 'bg-emerald-500' : 'bg-red-500'
                                )}
                                title={`${vm.name}: ${vm.status}`}
                            />
                        ))}
                        {student.vms.length > 3 && (
                            <span className="text-[10px] text-secondary">+{student.vms.length - 3}</span>
                        )}
                    </div>
                </div>

                {/* Status & Time */}
                <div className="flex items-center justify-between text-xs mb-4">
                    <span className={clsx(
                        "px-2 py-1 rounded-full font-medium capitalize",
                        getStatusBg(student.status),
                        student.status === 'active' ? 'text-emerald-500' : 
                        student.status === 'idle' ? 'text-amber-500' : 'text-slate-500'
                    )}>
                        {student.status}
                    </span>
                    <span className="text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(student.last_active)}
                    </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={onViewDetails}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-xl transition-colors text-sm font-medium"
                    >
                        <Eye className="w-4 h-4" />
                        View
                    </button>
                    
                    <div className="relative">
                        <button
                            onClick={() => setShowActions(!showActions)}
                            disabled={isLoading}
                            className="p-2 bg-secondary/30 hover:bg-secondary/50 text-secondary rounded-xl transition-colors"
                        >
                            {isLoading && loadingAction ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <Zap className="w-4 h-4" />
                            )}
                        </button>
                        
                        {showActions && (
                            <>
                                <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={() => setShowActions(false)}
                                />
                                <div className="absolute right-0 bottom-full mb-2 w-40 bg-secondary border border-theme rounded-xl shadow-2xl z-20 overflow-hidden">
                                    <button
                                        onClick={() => { onAction('revert'); setShowActions(false); }}
                                        disabled={isLoading}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-amber-500/10 text-left text-sm"
                                    >
                                        <RotateCcw className="w-4 h-4 text-amber-500" />
                                        <span>Revert All</span>
                                    </button>
                                    <button
                                        onClick={() => { onAction('restart_all'); setShowActions(false); }}
                                        disabled={isLoading}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-blue-500/10 text-left text-sm"
                                    >
                                        <Power className="w-4 h-4 text-blue-500" />
                                        <span>Restart All</span>
                                    </button>
                                    <button
                                        onClick={() => { onAction('power_off_all'); setShowActions(false); }}
                                        disabled={isLoading}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-red-500/10 text-left text-sm"
                                    >
                                        <PowerOff className="w-4 h-4 text-red-500" />
                                        <span>Power Off All</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InstructorConsole;
