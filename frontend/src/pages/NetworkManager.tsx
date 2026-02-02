import React, { useEffect, useState } from 'react';
import api from '../api';
import { 
    Plus, Search, Trash2, Edit, Network as NetworkIcon, 
    Wifi, WifiOff, ShieldCheck, Globe, Info, RefreshCw, Link2
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import clsx from 'clsx';

interface Network {
    id: number;
    connection_id: number;
    name: string;
    description: string | null;
    is_isolated: boolean;
    static_vlan: number | null;
    network_identifier: string | null;
}

interface AvailableNetwork {
    name: string;
    type: string;
    identifier: string;
}

const NetworkManager: React.FC = () => {
    const { showToast } = useToast();
    const [networks, setNetworks] = useState<Network[]>([]);
    const [connections, setConnections] = useState<any[]>([]);
    const [availableNetworks, setAvailableNetworks] = useState<AvailableNetwork[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFetchingAvailable, setIsFetchingAvailable] = useState(false);

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null);

    // Form state
    const [form, setForm] = useState({
        name: '',
        description: '',
        connection_id: '' as string | number,
        is_isolated: false, // Default to shared/static mode for linking
        static_vlan: '' as string | number,
        network_identifier: ''
    });

    useEffect(() => {
        fetchNetworks();
        fetchConnections();
    }, []);

    // When connection changes, fetch available networks
    useEffect(() => {
        if (form.connection_id) {
            fetchAvailableNetworks(parseInt(form.connection_id as string));
        } else {
            setAvailableNetworks([]);
        }
    }, [form.connection_id]);

    const fetchNetworks = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/networks/');
            setNetworks(res.data);
        } catch (e) {
            console.error("Failed to fetch networks", e);
            showToast('Failed to load networks', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchConnections = async () => {
        try {
            const res = await api.get('/infrastructure-connections/');
            setConnections(res.data);
        } catch (e) {
            console.error("Failed to fetch connections", e);
        }
    };

    const fetchAvailableNetworks = async (connectionId: number) => {
        setIsFetchingAvailable(true);
        try {
            const res = await api.get(`/networks/available?connection_id=${connectionId}`);
            setAvailableNetworks(res.data);
        } catch (e) {
            console.error("Failed to fetch available networks", e);
            setAvailableNetworks([]);
        } finally {
            setIsFetchingAvailable(false);
        }
    };

    const resetForm = () => {
        setForm({
            name: '',
            description: '',
            connection_id: '',
            is_isolated: false,
            static_vlan: '',
            network_identifier: ''
        });
        setSelectedNetwork(null);
        setAvailableNetworks([]);
    };

    const handleSubmit = async () => {
        if (!form.name || !form.connection_id) {
            showToast('Please fill in required fields', 'warning');
            return;
        }

        if (!form.is_isolated && !form.network_identifier) {
            showToast('Please select a target network from the infrastructure', 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                ...form,
                connection_id: parseInt(form.connection_id as string),
                static_vlan: form.static_vlan ? parseInt(form.static_vlan as string) : null,
                network_identifier: form.network_identifier || null
            };

            if (selectedNetwork) {
                await api.put(`/networks/${selectedNetwork.id}`, payload);
                showToast('Network updated successfully', 'success');
            } else {
                await api.post('/networks/', payload);
                showToast('Network linked successfully', 'success');
            }
            setModalOpen(false);
            fetchNetworks();
        } catch (e) {
            showToast('Failed to save network', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedNetwork) return;
        try {
            await api.delete(`/networks/${selectedNetwork.id}`);
            showToast('Network deleted successfully', 'success');
            setDeleteModalOpen(false);
            fetchNetworks();
        } catch (e) {
            showToast('Failed to delete network', 'error');
        }
    };

    const openEdit = (net: Network) => {
        setSelectedNetwork(net);
        setForm({
            name: net.name,
            description: net.description || '',
            connection_id: net.connection_id,
            is_isolated: net.is_isolated,
            static_vlan: net.static_vlan || '',
            network_identifier: net.network_identifier || ''
        });
        setModalOpen(true);
    };

    const filteredNetworks = networks.filter(n => 
        n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                            <NetworkIcon className="w-5 h-5 text-blue-500" />
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Network Manager</h1>
                    </div>
                    <p className="text-secondary font-medium pl-10">
                        Link <span className="text-blue-500 font-bold">vSphere Port Groups</span> or <span className="text-purple-500 font-bold">Proxmox Bridges</span> to your lab templates.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group max-w-xs transition-all duration-300 focus-within:max-w-md">
                        <Search className="w-5 h-5 text-secondary absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Find networks..."
                            className="input pl-12 bg-secondary/30 border-theme/50 focus:border-blue-500/50 rounded-2xl w-full"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => { resetForm(); setModalOpen(true); }}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">Link Network</span>
                    </button>
                </div>
            </div>

            {/* Grid of Networks */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="glass rounded-3xl p-6 border border-theme animate-pulse space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-secondary/20 rounded-2xl"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-secondary/20 rounded-full w-2/3"></div>
                                    <div className="h-3 bg-secondary/20 rounded-full w-1/2"></div>
                                </div>
                            </div>
                            <div className="h-20 bg-secondary/10 rounded-2xl"></div>
                        </div>
                    ))}
                </div>
            ) : filteredNetworks.length === 0 ? (
                <div className="glass rounded-[3rem] border border-dashed border-theme p-20 text-center">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-[2rem] bg-secondary/20 flex items-center justify-center border border-theme">
                        <WifiOff className="w-12 h-12 text-secondary/50" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-primary mb-3">No Networks Linked</h3>
                    <p className="text-secondary font-medium max-w-sm mx-auto mb-8">
                        Link existing vSphere Port Groups or Proxmox bridges to use them in your lab templates.
                    </p>
                    <button 
                        onClick={() => setModalOpen(true)}
                        className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-500 transition-all"
                    >
                        Link First Network
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredNetworks.map(net => (
                        <NetworkCard 
                            key={net.id} 
                            net={net} 
                            conn={connections.find(c => c.id === net.connection_id)}
                            onEdit={() => openEdit(net)}
                            onDelete={() => { setSelectedNetwork(net); setDeleteModalOpen(true); }}
                        />
                    ))}
                </div>
            )}

            {/* Creation/Edit Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={selectedNetwork ? "Edit Network Link" : "Link to Infrastructure Network"}
                icon={<Link2 className="w-5 h-5 text-blue-500" />}
                maxWidth="md"
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="text-xs font-bold text-secondary uppercase mb-2 block">Friendly Name</label>
                            <input
                                type="text"
                                className="input bg-secondary/30 border-theme"
                                placeholder="e.g. Internal Lab Network, Public WAN"
                                value={form.name}
                                onChange={e => setForm({...form, name: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-secondary uppercase mb-2 block">Infrastructure Connection</label>
                            <select
                                className="input bg-secondary/30 border-theme"
                                value={form.connection_id}
                                onChange={e => setForm({...form, connection_id: e.target.value, network_identifier: ''})}
                            >
                                <option value="">Select Connection</option>
                                {connections.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.host})</option>
                                ))}
                            </select>
                        </div>

                        {form.connection_id && (
                            <div className="animate-in slide-in-from-top-2 duration-200">
                                <label className="text-xs font-bold text-secondary uppercase mb-2 block flex items-center gap-2">
                                    <Link2 className="w-3 h-3" />
                                    Target Network (Port Group / Bridge)
                                </label>
                                {isFetchingAvailable ? (
                                    <div className="flex items-center gap-2 text-secondary text-sm py-3">
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Fetching available networks...
                                    </div>
                                ) : availableNetworks.length === 0 ? (
                                    <div className="text-orange-500 text-sm py-3 bg-orange-500/10 px-4 rounded-xl border border-orange-500/20">
                                        No networks found. Check the connection or permissions.
                                    </div>
                                ) : (
                                    <select
                                        className="input bg-secondary/30 border-theme"
                                        value={form.network_identifier}
                                        onChange={e => setForm({...form, network_identifier: e.target.value})}
                                    >
                                        <option value="">Select a network...</option>
                                        {availableNetworks.map(n => (
                                            <option key={n.identifier} value={n.identifier}>
                                                {n.name} ({n.type})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-bold text-secondary uppercase mb-2 block">Description</label>
                            <textarea
                                className="input bg-secondary/30 border-theme min-h-[80px]"
                                placeholder="Describe the purpose of this network..."
                                value={form.description}
                                onChange={e => setForm({...form, description: e.target.value})}
                            />
                        </div>

                        <div className="bg-secondary/20 p-4 rounded-2xl border border-theme space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                        Student Isolation
                                    </h4>
                                    <p className="text-[11px] text-secondary">Dynamic VLAN assignment per student</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setForm({...form, is_isolated: !form.is_isolated})}
                                    className={clsx(
                                        "px-4 py-1.5 rounded-xl text-xs font-bold border transition-all",
                                        form.is_isolated 
                                            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-500" 
                                            : "bg-slate-500/10 border-slate-500/40 text-slate-400"
                                    )}
                                >
                                    {form.is_isolated ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                            
                            {form.is_isolated && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 animate-in slide-in-from-top-2 duration-200">
                                    <p className="text-xs text-amber-500 font-medium flex items-start gap-2">
                                        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                        <span>
                                            <strong>Requires Distributed vSwitch (dvSwitch)</strong> – Standard vSwitch does not support per-port VLAN overrides. 
                                            Ensure your vSphere has Enterprise Plus licensing.
                                        </span>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <button 
                        onClick={handleSubmit}
                        disabled={isSubmitting || !form.name || !form.connection_id || (!form.is_isolated && !form.network_identifier)}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/20 transition-all hover:scale-[1.01] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : 
                         <>{selectedNetwork ? 'Update Link' : 'Link Network'}</>}
                    </button>
                </div>
            </Modal>

            {/* Delete Modal */}
            <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Network" maxWidth="sm">
                <div className="space-y-6 text-center">
                    <div className="w-20 h-20 mx-auto rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                        <Trash2 className="w-10 h-10 text-red-500" />
                    </div>
                    <div>
                        <h4 className="text-xl font-extrabold text-primary mb-2">Delete this network link?</h4>
                        <p className="text-secondary font-medium">Any template VM mapped to this network will revert to its default NIC settings.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setDeleteModalOpen(false)} className="px-6 py-3 bg-secondary/50 rounded-2xl font-bold text-secondary hover:bg-secondary transition-all">
                            Cancel
                        </button>
                        <button onClick={handleDelete} className="px-6 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-500 shadow-lg shadow-red-500/20 transition-all">
                            Delete
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const NetworkCard: React.FC<{ net: Network, conn: any, onEdit: () => void, onDelete: () => void }> = ({ net, conn, onEdit, onDelete }) => {
    return (
        <div className="glass rounded-[2rem] p-6 border border-theme hover:border-blue-500/40 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button onClick={onEdit} className="p-2 bg-secondary/50 hover:bg-blue-500 hover:text-white rounded-xl transition-all">
                    <Edit className="w-4 h-4" />
                </button>
                <button onClick={onDelete} className="p-2 bg-secondary/50 hover:bg-red-500 hover:text-white rounded-xl transition-all">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <div className="flex items-center gap-4 mb-6">
                <div className={clsx(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border transition-all shadow-lg",
                    net.is_isolated ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-blue-500/10 border-blue-500/20 text-blue-500"
                )}>
                    {net.is_isolated ? <ShieldCheck className="w-7 h-7" /> : <Globe className="w-7 h-7" />}
                </div>
                <div>
                    <h3 className="text-lg font-bold text-primary group-hover:text-blue-500 transition-colors">{net.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-secondary mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                        <span>{conn?.name || 'Unknown Connection'}</span>
                    </div>
                </div>
            </div>

            {/* Show linked network identifier */}
            {net.network_identifier && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2 mb-4 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-bold text-blue-400 truncate">{net.network_identifier}</span>
                </div>
            )}

            <div className="bg-secondary/20 p-4 rounded-2xl border border-theme mb-4 min-h-[60px]">
                <p className="text-xs text-secondary leading-relaxed font-medium">
                    {net.description || <span className="italic opacity-50">No description provided.</span>}
                </p>
            </div>

            <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                    {net.is_isolated ? (
                        <div className="flex items-center gap-1 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-black uppercase tracking-wider">
                            <Wifi className="w-3 h-3" />
                            Dynamic VLANs
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-[10px] font-black uppercase tracking-wider">
                            <Globe className="w-3 h-3" />
                            Linked
                        </div>
                    )}
                </div>
                <div className="text-[10px] font-bold text-secondary flex items-center gap-1.5">
                    <Info className="w-3 h-3" />
                    ID: {net.id}
                </div>
            </div>
        </div>
    );
};

export default NetworkManager;
