import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { 
    Monitor, Server, RefreshCw, Play, Square, RotateCcw,
    Wifi, WifiOff, ExternalLink
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

const MyEnvironments: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [environments, setEnvironments] = useState<Environment[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchEnvironments = async () => {
        setLoading(true);
        try {
            const classRes = await api.get('/classes/');
            const classes = classRes.data;

            const envPromises = classes.map(async (cls: any) => {
                try {
                    const res = await api.get(`/classes/${cls.id}/environments`);
                    return res.data
                        .filter((env: any) => !env.user_id || env.user_id === user?.id)
                        .map((env: any) => ({
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
        fetchEnvironments();
    }, []);

    const handlePowerControl = async (envId: number, vmId: number, action: string) => {
        try {
            const res = await api.post(`/environments/${envId}/vms/${vmId}/power`, { action });
            if (res.data.success) {
                showToast(`VM ${action} command sent`, 'success');
                fetchEnvironments();
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
                        <div className="p-2 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl">
                            <Monitor className="w-6 h-6 text-white" />
                        </div>
                        My Environments
                    </h1>
                    <p className="text-secondary mt-1">Your lab environments and VMs</p>
                </div>
                <button
                    onClick={() => fetchEnvironments()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl">
                        <Server className="w-5 h-5 text-emerald-500" />
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
                        <p className="text-xs text-secondary">Running</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="p-3 bg-red-500/10 rounded-xl">
                        <WifiOff className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-primary">{totalVMs - poweredOnVMs}</p>
                        <p className="text-xs text-secondary">Stopped</p>
                    </div>
                </div>
            </div>

            {/* Environments Grid */}
            <div className="card-elevated p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                    </div>
                ) : environments.length === 0 ? (
                    <div className="text-center py-16">
                        <Monitor className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary">No environments assigned to you yet</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {environments.map(env => (
                            <div key={env.id} className="bg-secondary/50 rounded-xl p-5 border border-theme hover:border-emerald-500/30 transition-all">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h4 className="font-semibold text-primary text-lg">{env.name}</h4>
                                        <p className="text-sm text-secondary">{env.class_name}</p>
                                    </div>
                                    <span className="text-xs text-secondary">{env.vms.length} VMs</span>
                                </div>
                                
                                <div className="space-y-2">
                                    {env.vms.map(vm => (
                                        <div key={vm.id} className="flex items-center justify-between bg-background/70 p-3 rounded-lg border border-theme/50">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className={`w-3 h-3 rounded-full ${vm.power_state === 'poweredOn' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                                <div className="min-w-0">
                                                    <p className="text-sm text-primary font-medium truncate">
                                                        {vm.name.split('-').pop() || vm.name}
                                                    </p>
                                                    <p className="text-xs font-mono text-secondary">
                                                        {vm.ip_address || 'Waiting for IP...'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {vm.access_url && (
                                                    <a 
                                                        href={vm.access_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg"
                                                        title="Open Console"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                )}
                                                {vm.power_state === 'poweredOn' ? (
                                                    <button 
                                                        onClick={() => handlePowerControl(env.id, vm.id, 'stop')}
                                                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                                                        title="Stop VM"
                                                    >
                                                        <Square className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => handlePowerControl(env.id, vm.id, 'start')}
                                                        className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg"
                                                        title="Start VM"
                                                    >
                                                        <Play className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => handlePowerControl(env.id, vm.id, 'reset')}
                                                    className="p-2 text-amber-400 hover:bg-amber-500/10 rounded-lg"
                                                    title="Reset VM"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
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

export default MyEnvironments;
