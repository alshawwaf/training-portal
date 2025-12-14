import React, { useEffect, useState } from 'react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { 
    Monitor, Server, RefreshCw, Play, Square, RotateCcw,
    Wifi, WifiOff
} from 'lucide-react';

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

const AllEnvironments: React.FC = () => {
    const { showToast } = useToast();
    const [environments, setEnvironments] = useState<Environment[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const classRes = await api.get('/classes/');
            const fetchedClasses = classRes.data;

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
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handlePowerControl = async (envId: number, vmId: number, action: string) => {
        try {
            const res = await api.post(`/environments/${envId}/vms/${vmId}/power`, { action });
            if (res.data.success) {
                showToast(`VM ${action} command sent`, 'success');
                fetchData();
            }
        } catch (e: any) {
            showToast(`Power action failed: ${e.response?.data?.detail || e.message}`, 'error');
        }
    };

    const totalVMs = environments.reduce((acc, env) => acc + env.vms.length, 0);
    const poweredOnVMs = environments.reduce((acc, env) => 
        acc + env.vms.filter(vm => vm.power_state === 'poweredOn').length, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl">
                            <Monitor className="w-6 h-6 text-white" />
                        </div>
                        All Environments
                    </h1>
                    <p className="text-secondary mt-1">Admin view - all student environments</p>
                </div>
                <button
                    onClick={() => fetchData()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-xl">
                        <Server className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{environments.length}</p>
                        <p className="text-xs text-secondary">Environments</p>
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
                ) : environments.length === 0 ? (
                    <div className="text-center py-16">
                        <Monitor className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary">No environments found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {environments.map(env => (
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
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AllEnvironments;
