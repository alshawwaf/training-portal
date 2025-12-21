import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { 
    Shield, 
    Bell, 
    ChevronRight,
    ChevronDown, 
    Check, 
    Server, 
    Mail, 
    Send, 
    Cloud, 
    Globe, 
    RefreshCw, 
    Eye, 
    EyeOff, 
    Settings as SettingsIcon,
    Plus,
    Users,
    ExternalLink,
    ShieldCheck,
    Lock,
    UserPlus,
    Zap,
    Hash,
    User,
    Key
} from 'lucide-react';
import Modal from '../components/Modal';
import { AwsIcon, AzureIcon, GcpIcon, ProxmoxIcon, VMwareIcon } from '../components/ProviderIcons';
import clsx from 'clsx';

interface SystemSetting {
    key: string;
    value: string;
    category: string;
    description: string;
    is_secret: boolean;
}

const Settings: React.FC = () => {
    const { user, isLoading } = useAuth();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'notifications' | 'cloud' | 'onprem' | 'system'>('notifications');
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [browserNotifications, setBrowserNotifications] = useState(false);
    
    const [viewMode] = useState<'list' | 'grid'>('grid');
    
    // System Settings State
    const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
    const [testEmailLoading, setTestEmailLoading] = useState(false);
    const [testRecipient, setTestRecipient] = useState('');
    
    const [smtpModalOpen, setSmtpModalOpen] = useState(false);
    

    // Infrastructure Connections State
    const [connections, setConnections] = useState<any[]>([]);
    const [addConnectionOpen, setAddConnectionOpen] = useState(false);
    const [editingConnection, setEditingConnection] = useState<any>(null);
    const [connectionForm, setConnectionForm] = useState({
        name: '',
        provider: 'vSphere' as 'vSphere' | 'Proxmox',
        host: '',
        port: 443,
        user: '',
        password: '',
        token_id: '',
        token_secret: '',
        node: 'pve',
        verify_ssl: false
    });
    const [connectionLoading, setConnectionLoading] = useState(false);


    // Cloud Provider State
    interface CloudProvider {
        id: string;
        name: string;
        icon: any;
        color: string;
        description: string;
    }

    const cloudProviders: CloudProvider[] = [
        { id: 'aws', name: 'Amazon Web Services', icon: AwsIcon, color: 'orange', description: 'Configure AWS credentials for EC2 and other services.' },
        { id: 'azure', name: 'Microsoft Azure', icon: AzureIcon, color: 'blue', description: 'Connect to Azure subscription for VM management.' },
        { id: 'gcp', name: 'Google Cloud Platform', icon: GcpIcon, color: 'red', description: 'Manage Google Compute Engine resources.' },
    ];

    const [selectedProvider, setSelectedProvider] = useState<CloudProvider | null>(null);
    const [providerForm, setProviderForm] = useState<Record<string, string>>({});
    const [providerSaving, setProviderSaving] = useState(false);

    useEffect(() => {
        if (user?.role === 'admin') {
            fetchSettings();
            if (user?.email) setTestRecipient(user.email);
        }
        fetchPreferences();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const fetchSettings = async () => {
        try {
            const res = await api.get('/settings/');
            const data = Array.isArray(res.data) ? res.data : [];
            setSystemSettings(data);
            
            await fetchConnections();
        } catch (e) {
            console.error(e);
            showToast('Failed to load settings', 'error');
        }
    };

    const fetchConnections = async () => {
        try {
            const res = await api.get('/infrastructure-connections/');
            setConnections(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error('Failed to fetch connections:', e);
        }
    };

    const fetchPreferences = async () => {
        try {
            const res = await api.get('/preferences/');
            setEmailNotifications(res.data.email_notifications);
            setBrowserNotifications(res.data.browser_notifications);
        } catch (e) {
            console.error(e);
        }
    };

    const handleOpenProviderModal = (provider: CloudProvider) => {
        setSelectedProvider(provider);
        const form: Record<string, string> = {};
        systemSettings
            .filter(s => s.category === provider.id)
            .forEach(s => { form[s.key] = s.value; });
        setProviderForm(form);
    };

    const handleSaveProvider = async () => {
        setProviderSaving(true);
        try {
            const promises = Object.entries(providerForm).map(([key, value]) => {
                const current = systemSettings.find(s => s.key === key);
                if (current && current.value !== value) {
                    return api.put(`/settings/${key}`, { value });
                }
                return Promise.resolve();
            });
            await Promise.all(promises);
            await fetchSettings();
            showToast(`${selectedProvider?.name} settings saved`, 'success');
            setSelectedProvider(null);
        } catch {
            showToast('Failed to save provider settings', 'error');
        } finally {
            setProviderSaving(false);
        }
    };


    const handleUpdatePreferences = async (email?: boolean, browser?: boolean) => {
        try {
            const payload: any = {};
            if (email !== undefined) payload.email_notifications = email;
            if (browser !== undefined) payload.browser_notifications = browser;
            await api.put('/preferences/', payload);
            showToast('Preferences updated', 'success');
        } catch {
            showToast('Failed to sync preferences', 'error');
        }
    };

    const handleUpdateSetting = async (key: string, value: string) => {
        try {
            await api.put(`/settings/${key}`, { value });
            setSystemSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
        } catch {
            showToast(`Failed to update ${key}`, 'error');
        }
    };

    const handleTestEmail = async () => {
        setTestEmailLoading(true);
        try {
            const res = await api.post('/email/test', { recipient: testRecipient });
            if (res.data.success) {
                showToast(`Transmission Successful: ${res.data.message}`, 'success');
                setSmtpModalOpen(false);
            } else {
                showToast(res.data.message || 'Transmission failed', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Audit sequence failed', 'error');
        } finally {
            setTestEmailLoading(false);
        }
    };

    const handleAddConnection = async () => {
        setConnectionLoading(true);
        try {
            if (editingConnection) {
                await api.put(`/infrastructure-connections/${editingConnection.id}`, connectionForm);
                showToast('Connection updated', 'success');
            } else {
                await api.post('/infrastructure-connections/', connectionForm);
                showToast('Connection added', 'success');
            }
            setAddConnectionOpen(false);
            setEditingConnection(null);
            resetConnectionForm();
            await fetchConnections();
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to save connection', 'error');
        } finally {
            setConnectionLoading(false);
        }
    };

    const handleDeleteConnection = async (id: number) => {
        if (!window.confirm('Are you sure you want to remove this connection? Templates using it might break.')) return;
        try {
            await api.delete(`/infrastructure-connections/${id}`);
            showToast('Connection removed', 'success');
            await fetchConnections();
        } catch {
            showToast('Failed to remove connection', 'error');
        }
    };

    const handleSyncConnection = async (id: number) => {
        try {
            showToast('Starting inventory sync...', 'info');
            await api.post(`/infrastructure-connections/${id}/sync`);
            showToast('Sync completed', 'success');
        } catch {
            showToast('Sync failed', 'error');
        }
    };

    const handleTestConnectionItem = async (conn: any) => {
        try {
            const res = await api.post(`/infrastructure-connections/${conn.id}/test`);
            if (res.data.success) {
                showToast(`Connected: ${res.data.message}`, 'success');
            } else {
                showToast(res.data.message || 'Connection failed', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Test failed', 'error');
        }
    };

    const resetConnectionForm = () => {
        setConnectionForm({
            name: '',
            provider: 'vSphere',
            host: '',
            port: 443,
            user: '',
            password: '',
            token_id: '',
            token_secret: '',
            node: 'pve',
            verify_ssl: false
        });
    };

    const editConnection = (conn: any) => {
        setEditingConnection(conn);
        setConnectionForm({
            name: conn.name,
            provider: conn.provider,
            host: conn.host,
            port: conn.port,
            user: conn.user,
            password: '', // Don't pre-fill password
            token_id: conn.token_id || '',
            token_secret: '',
            node: conn.node || 'pve',
            verify_ssl: conn.verify_ssl
        });
        setAddConnectionOpen(true);
    };

    const tabs = [
        { id: 'notifications', label: 'Alerts', icon: Bell, color: 'amber' },
        { id: 'cloud', label: 'Cloud Vendors', icon: Cloud, color: 'sky' },
        { id: 'onprem', label: 'Private Cloud', icon: Server, color: 'emerald' },
        { id: 'system', label: 'Email Service', icon: Shield, color: 'purple' },
    ] as const;

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-xl bg-slate-500/10 border border-slate-500/20">
                          <SettingsIcon className="w-5 h-5 text-slate-500" />
                      </div>
                      <h1 className="text-3xl font-extrabold tracking-tight text-primary">Control Center</h1>
                  </div>
                  <p className="text-secondary font-medium pl-10">
                    Fine-tune your personal experience and <span className="text-slate-500 font-bold">global platform settings</span>.
                  </p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Navigation Sidebar */}
                <aside className="w-full lg:w-72 flex-shrink-0 sticky top-24 z-10 space-y-2">
                    {tabs.map(tab => {
                        if (tab.id !== 'notifications' && user?.role !== 'admin') return null;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={clsx(
                                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group border",
                                    isActive 
                                        ? `bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border-blue-500/30 text-blue-600 shadow-md`
                                        : "bg-secondary/10 border-transparent text-secondary hover:bg-secondary/30 hover:text-primary"
                                )}
                            >
                                <div className={clsx(
                                    "p-2.5 rounded-xl transition-all group-hover:scale-110 group-active:scale-95",
                                    isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-secondary/20"
                                )}>
                                    <tab.icon className="w-5 h-5" />
                                </div>
                                <span className="font-bold tracking-tight text-sm uppercase">{tab.label}</span>
                                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                            </button>
                        );
                    })}
                </aside>

                {/* Content Area */}
                <main className="flex-1 w-full animate-in slide-in-from-right-4 duration-500">
                    {activeTab === 'notifications' && (
                        <div className="space-y-6">
                            <SectionHeader title="Alert Subscriptions" subtitle="Configure how the platform reaches out to you" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <NotificationCard 
                                    title="Email Directives" 
                                    desc="Critical alerts sent to your inbox" 
                                    icon={Mail} 
                                    enabled={emailNotifications} 
                                    onToggle={val => { setEmailNotifications(val); handleUpdatePreferences(val); }} 
                                />
                                <NotificationCard 
                                    title="Push Overlays" 
                                    desc="Real-time browser notifications" 
                                    icon={Globe} 
                                    enabled={browserNotifications} 
                                    onToggle={async val => {
                                        if (val) {
                                            const p = await Notification.requestPermission();
                                            if (p === 'granted') { setBrowserNotifications(true); handleUpdatePreferences(undefined, true); }
                                        } else { setBrowserNotifications(false); handleUpdatePreferences(undefined, false); }
                                    }} 
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'cloud' && (
                        <div className="space-y-6">
                            <SectionHeader title="Cloud Vendors" subtitle="Configure external hyperscaler credentials" />
                            <div className={clsx(viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4")}>
                                {cloudProviders.map(p => (
                                    <ProviderCard key={p.id} provider={p} onConfigure={() => handleOpenProviderModal(p)} viewMode={viewMode} />
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'onprem' && (
                        <div className="space-y-8 text-secondary">
                             <div className="flex items-center justify-between">
                                <SectionHeader title="Private Cloud" subtitle="Manage connected hypervisors and local clusters" />
                                <button 
                                    onClick={() => { resetConnectionForm(); setEditingConnection(null); setAddConnectionOpen(true); }}
                                    className="btn-primary py-2 px-6 rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-500/20"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Connection
                                </button>
                            </div>

                            {connections.length === 0 && (
                                <div className="glass rounded-[2rem] p-16 text-center border border-theme border-dashed">
                                    <Server className="w-16 h-16 mx-auto mb-6 text-slate-500 opacity-20" />
                                    <h3 className="text-xl font-bold text-primary mb-2">No Active Connections</h3>
                                    <p className="text-secondary opacity-60 max-w-md mx-auto">
                                        You haven't added any infrastructure connections yet. Add a vCenter or Proxmox host to start syncing inventory.
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-6">
                                {connections.map(conn => (
                                    <InfrastructureCard 
                                        key={conn.id}
                                        name={conn.name} 
                                        desc={`${conn.provider} Connection - ${conn.host}`}
                                        icon={conn.provider === 'vSphere' ? VMwareIcon : ProxmoxIcon}
                                        connected={conn.is_active}
                                        onTest={() => handleTestConnectionItem(conn)}
                                        onSave={() => editConnection(conn)}
                                        loading={false}
                                        saving={false}
                                        form={{}} // Not used here as we edit via modal
                                        setForm={() => {}}
                                        fields={[]} // Not used here as we edit via modal
                                        secondaryActions={
                                            <div className="flex gap-2">
                                                <button className="btn-secondary py-2 px-4 italic text-xs" onClick={() => handleSyncConnection(conn.id)}>
                                                    <RefreshCw className="w-3.5 h-3.5" /> Sync Inventory
                                                </button>
                                                <button className="btn-secondary py-2 px-4 italic text-xs text-red-400 hover:text-red-500" onClick={() => handleDeleteConnection(conn.id)}>
                                                    Remove
                                                </button>
                                            </div>
                                        }
                                        isNewStyle={true}
                                    />
                                ))}
                            </div>

                        </div>
                    )}

                    {activeTab === 'system' && (
                        <div className="space-y-6">
                            <SectionHeader title="Email Service" subtitle="SMTP configuration for notifications and invitations" />
                            
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                {/* Configuration Info & Actions */}
                                <div className="space-y-6">
                                    <div className="glass rounded-2xl border border-theme p-6 bg-purple-500/5 relative overflow-hidden group hover:border-purple-500/30 transition-all">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <ShieldCheck className="w-12 h-12 text-purple-500" />
                                        </div>
                                        <div className="flex items-center gap-3 mb-4 text-purple-500">
                                            <div className="p-2 rounded-lg bg-purple-500/10">
                                                <Lock className="w-4 h-4" />
                                            </div>
                                            <h4 className="font-bold uppercase tracking-widest text-[10px]">Security Directives</h4>
                                        </div>
                                        <p className="text-xs text-secondary leading-relaxed mb-6">
                                            The platform utilizes <span className="text-primary font-bold">FastAPI Mail</span> for all secure transactional communications.
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 rounded-xl bg-secondary/10 border border-theme/50 flex flex-col gap-1">
                                                <span className="text-[8px] font-bold text-secondary uppercase opacity-60">Handshake</span>
                                                <span className="text-[10px] font-black text-emerald-500 uppercase">STARTTLS</span>
                                            </div>
                                            <div className="p-3 rounded-xl bg-secondary/10 border border-theme/50 flex flex-col gap-1">
                                                <span className="text-[8px] font-bold text-secondary uppercase opacity-60">Authentication</span>
                                                <span className="text-[10px] font-black text-blue-500 uppercase">Login/Plain</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="glass rounded-2xl border border-theme p-6 bg-blue-500/5 hover:border-blue-500/30 transition-all">
                                        <div className="flex items-center gap-3 mb-4 text-blue-500">
                                            <div className="p-2 rounded-lg bg-blue-500/10">
                                                <UserPlus className="w-4 h-4" />
                                            </div>
                                            <h4 className="font-bold uppercase tracking-widest text-[10px]">Identity Services</h4>
                                        </div>
                                        <p className="text-[10px] text-secondary leading-relaxed mb-4 italic opacity-80">
                                            System invitations and student registration workflows are tied to this relay.
                                        </p>
                                        <a 
                                            href="/users" 
                                            className="w-full flex items-center justify-between px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500 hover:text-white text-blue-500 border border-blue-500/20 rounded-xl font-bold uppercase tracking-widest text-[9px] transition-all group"
                                        >
                                            Manage Invitations
                                            <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                        </a>
                                    </div>

                                    <button 
                                        onClick={() => setSmtpModalOpen(true)}
                                        className="w-full flex items-center justify-between px-6 py-5 bg-gradient-to-r from-purple-600/10 to-blue-600/10 text-primary border border-theme/50 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all hover:border-purple-500/50 hover:shadow-lg group shadow-purple-500/5"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-purple-500 text-white shadow-lg shadow-purple-500/20">
                                                <Zap className="w-4 h-4 group-hover:animate-pulse" />
                                            </div>
                                            Audit Transport
                                        </div>
                                        <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                                    </button>
                                </div>

                                {/* SMTP Form */}
                                <div className="xl:col-span-2 glass rounded-2xl border border-theme p-8 relative overflow-hidden bg-secondary/5">
                                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none text-primary">
                                        <Mail className="w-64 h-64" />
                                    </div>
                                    
                                    <div className="relative z-10 space-y-8">
                                        {/* Infrastructure Group */}
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-2 pb-3 border-b border-theme/30">
                                                <div className="w-1 h-4 bg-purple-500 rounded-full" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Relay Infrastructure</span>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {systemSettings.filter(s => s.category === 'smtp' && ['smtp_server', 'smtp_port', 'smtp_from'].includes(s.key)).map(s => (
                                                    <div key={s.key} className={clsx("space-y-2", s.key === 'smtp_from' && "md:col-span-2")}>
                                                        <label className="text-[9px] font-bold uppercase tracking-widest text-secondary/60 flex items-center gap-2">
                                                            {s.key === 'smtp_server' && <Globe className="w-3 h-3" />}
                                                            {s.key === 'smtp_port' && <Hash className="w-3 h-3" />}
                                                            {s.key === 'smtp_from' && <Mail className="w-3 h-3" />}
                                                            {s.description || s.key.replace('smtp_', '').replace('_', ' ')}
                                                        </label>
                                                        <input 
                                                            type="text"
                                                            value={s.value}
                                                            onChange={e => handleUpdateSetting(s.key, e.target.value)}
                                                            className="w-full bg-slate-50 dark:bg-black/40 px-4 py-3 border border-theme focus:border-purple-500/50 rounded-xl text-sm text-primary placeholder:text-secondary/30 outline-none transition-all hover:border-theme/80"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Credentials Group */}
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-2 pb-3 border-b border-theme/30">
                                                <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Access Credentials</span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {systemSettings.filter(s => s.category === 'smtp' && ['smtp_username', 'smtp_password'].includes(s.key)).map(s => (
                                                    <div key={s.key} className="space-y-2">
                                                        <label className="text-[9px] font-bold uppercase tracking-widest text-secondary/60 flex items-center gap-2">
                                                            {s.key === 'smtp_username' && <User className="w-3 h-3" />}
                                                            {s.key === 'smtp_password' && <Key className="w-3 h-3" />}
                                                            {s.description || s.key.replace('smtp_', '').replace('_', ' ')}
                                                        </label>
                                                        <input 
                                                            type={s.is_secret ? "password" : "text"}
                                                            value={s.value}
                                                            onChange={e => handleUpdateSetting(s.key, e.target.value)}
                                                            className="w-full bg-slate-50 dark:bg-black/40 px-4 py-3 border border-theme focus:border-blue-500/50 rounded-xl text-sm text-primary placeholder:text-secondary/30 outline-none transition-all hover:border-theme/80"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* Provider Modal */}
            <Modal isOpen={!!selectedProvider} onClose={() => setSelectedProvider(null)} title={`Matrix: ${selectedProvider?.name}`} maxWidth="md">
                <div className="space-y-6">
                    {systemSettings.filter(s => s.category === selectedProvider?.id).map(s => (
                        <div key={s.key} className="space-y-2">
                             <label className="text-[10px] font-black uppercase tracking-widest text-secondary pl-1">{s.description || s.key}</label>
                             <input 
                                type={s.is_secret ? "password" : "text"}
                                value={providerForm[s.key] || ''}
                                onChange={e => setProviderForm({...providerForm, [s.key]: e.target.value})}
                                className="input bg-secondary/10 p-4 border-theme focus:border-blue-500/50 rounded-2xl"
                             />
                        </div>
                    ))}
                    <button 
                        onClick={handleSaveProvider} 
                        disabled={providerSaving}
                        className="w-full py-4 bg-primary text-secondary hover:text-primary rounded-2xl font-bold transition-all border border-theme"
                    >
                        {providerSaving ? 'Syncing...' : 'Update Matrix'}
                    </button>
                </div>
            </Modal>

            {/* Modals */}
            <SMTPTestModal isOpen={smtpModalOpen} onClose={() => setSmtpModalOpen(false)} recipient={testRecipient} setRecipient={setTestRecipient} onTest={handleTestEmail} loading={testEmailLoading} />
            <AddConnectionModal 
                isOpen={addConnectionOpen} 
                onClose={() => setAddConnectionOpen(false)} 
                form={connectionForm} 
                setForm={setConnectionForm} 
                onSave={handleAddConnection} 
                loading={connectionLoading} 
                isEditing={!!editingConnection}
            />
        </div>
    );
};

// --- MODERN UI HELPERS ---

const SectionHeader: React.FC<{ title: string, subtitle: string }> = ({ title, subtitle }) => (
    <div className="mb-4">
        <h2 className="text-xl font-black text-primary tracking-tight leading-none mb-1 uppercase">{title}</h2>
        <p className="text-secondary text-sm font-medium">{subtitle}</p>
    </div>
);

const NotificationCard: React.FC<{ title: string, desc: string, icon: any, enabled: boolean, onToggle: (v: boolean) => void }> = ({ title, desc, icon: Icon, enabled, onToggle }) => (
    <div className="glass rounded-[2rem] p-6 border border-theme flex items-center justify-between group transition-all duration-300 hover:border-blue-500/30">
        <div className="flex items-center gap-4">
            <div className={clsx(
                "p-3 rounded-2xl transition-all",
                enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-secondary/20 text-secondary"
            )}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <h4 className="font-bold text-primary leading-tight mb-0.5">{title}</h4>
                <p className="text-[11px] text-secondary font-medium">{desc}</p>
            </div>
        </div>
        <button 
            onClick={() => onToggle(!enabled)}
            className={clsx(
                "relative w-14 h-8 rounded-full transition-all duration-300 flex items-center px-1 shadow-inner ring-4 ring-transparent",
                enabled ? "bg-emerald-500 ring-emerald-500/10" : "bg-secondary"
            )}
        >
            <div className={clsx(
                "w-6 h-6 rounded-full bg-white shadow-xl transition-transform duration-300 flex items-center justify-center",
                enabled ? "translate-x-6" : "translate-x-0"
            )}>
                {enabled && <Check className="w-4 h-4 text-emerald-500" />}
            </div>
        </button>
    </div>
);

const ProviderCard: React.FC<{ provider: any; onConfigure: () => void; viewMode: 'grid' | 'list' }> = ({ provider, onConfigure, viewMode }) => (
    <div 
        onClick={onConfigure}
        className={clsx(
            "group relative glass rounded-2xl border border-theme overflow-hidden transition-all duration-500 cursor-pointer",
            "hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1",
            viewMode === 'list' ? "flex items-center p-4 gap-6" : "p-8 text-center"
        )}
    >
        <div className={clsx(
            "absolute top-0 right-0 p-8 opacity-5 transition-transform duration-700 group-hover:scale-125",
            `text-${provider.color}-500`
        )}>
            <provider.icon className="w-32 h-32" />
        </div>
        
        <div className={clsx(
            "relative z-10 flex flex-col",
            viewMode === 'list' ? "flex-row items-center !text-left w-full" : "items-center"
        )}>
            <div className={clsx(
                "p-4 rounded-xl bg-gradient-to-br from-secondary/40 to-secondary/20 border border-theme/50 shadow-inner mb-5 transition-all duration-500 group-hover:rotate-6",
                viewMode === 'list' && "mb-0 mr-5"
            )}>
                <provider.icon className="w-7 h-7" />
            </div>
            <div className="flex-1">
                <span className="text-[9px] font-black text-secondary uppercase tracking-[0.2em]">{provider.id} registry</span>
                <h4 className="text-lg font-black text-primary tracking-tighter uppercase italic leading-none my-1">{provider.name}</h4>
                <p className="text-[10px] text-secondary font-medium leading-relaxed opacity-60 px-2 line-clamp-2">{provider.description}</p>
            </div>
            <div className={clsx(
                "mt-6 flex items-center gap-2 px-5 py-2 bg-secondary/30 rounded-full text-[9px] font-black uppercase tracking-widest text-secondary transition-all group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-500/20",
                viewMode === 'list' && "mt-0"
            )}>
                Connect <ChevronRight className="w-3.5 h-3.5" />
            </div>
        </div>
    </div>
);

const InfrastructureCard: React.FC<{ 
    name: string, desc: string, icon: any, connected: boolean, fields: any[], 
    onTest: () => void, onSave: () => void, loading: boolean, saving: boolean, 
    form: any, setForm: any, secondaryActions?: React.ReactNode,
    isNewStyle?: boolean
}> = ({ name, desc, icon: Icon, connected, fields, onTest, onSave, loading, saving, form, setForm, secondaryActions, isNewStyle }) => {
    const [showLocal, setShowLocal] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    
    return (
        <div className="glass rounded-2xl border border-theme overflow-hidden shadow-sm transition-all duration-300 hover:border-blue-500/30">
            {/* Collapsible Header */}
            <div 
                className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-secondary/5 cursor-pointer group"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-secondary/10 border border-theme/50 shadow-sm text-primary">
                        <Icon className="w-7 h-7" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-0.5">
                            <h3 className="text-lg font-bold text-primary tracking-tight">{name}</h3>
                            <div className={clsx(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                                connected ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                            )}>
                                <div className={clsx("w-1 h-1 rounded-full", connected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                                {connected ? 'Online' : 'Offline'}
                            </div>
                        </div>
                        <p className="text-[11px] text-secondary font-medium italic opacity-70">{desc}</p>
                    </div>
                </div>
                <div className="mt-4 md:mt-0 flex items-center gap-3">
                    {/* Quick action buttons visible when collapsed */}
                    {!isExpanded && (
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                            <button 
                                onClick={onTest} 
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary hover:text-primary rounded-xl border border-theme/50 text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                                Test Link
                            </button>
                            {isNewStyle && (
                                <button 
                                    className="px-4 py-2 bg-blue-600/10 text-blue-500 border border-blue-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all" 
                                    onClick={onSave}
                                >
                                    Modify
                                </button>
                            )}
                        </div>
                    )}
                    <button className="p-1.5 rounded-lg bg-secondary/10 text-secondary group-hover:text-primary group-hover:bg-secondary/20 transition-all">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                </div>
            </div>
            
            {/* Expandable Content */}
            {isExpanded && !isNewStyle && (
                <div className="border-t border-theme animate-in slide-in-from-top-2 duration-200">
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-secondary/5">
                        {fields.map(f => (
                            <div key={f.key} className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-secondary pl-1">{f.label}</label>
                                <div className="relative">
                                    <input 
                                        type={f.secret && !showLocal ? "password" : "text"}
                                        value={form[f.key] || ''}
                                        onChange={e => setForm({...form, [f.key]: e.target.value})}
                                        placeholder={f.placeholder}
                                        className="input bg-secondary/20 p-3 border-theme focus:border-blue-500/50 rounded-xl w-full text-sm"
                                    />
                                    {f.secret && (
                                        <button 
                                            onClick={() => setShowLocal(!showLocal)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary"
                                        >
                                            {showLocal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {/* Action buttons */}
                    <div className="px-6 py-4 bg-secondary/10 border-t border-theme flex items-center justify-between">
                        <div className="flex gap-2">
                            {secondaryActions}
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={onTest} 
                                disabled={loading}
                                className="btn-secondary py-2.5 px-5 rounded-xl flex items-center gap-2"
                            >
                                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                                <span className="text-sm font-semibold">Test Connection</span>
                            </button>
                            <button 
                                onClick={onSave} 
                                disabled={saving}
                                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Expanded Content for New Style (connection list cards) */}
            {isExpanded && isNewStyle && (
                <div className="border-t border-theme animate-in slide-in-from-top-2 duration-200">
                    <div className="p-6 bg-secondary/5 space-y-4">
                        <div className="flex items-center gap-2 text-secondary text-sm">
                            <Server className="w-4 h-4" />
                            <span className="font-medium">Connection Actions</span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {secondaryActions}
                        </div>
                        <div className="flex gap-3 pt-3 border-t border-theme">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onTest(); }} 
                                disabled={loading}
                                className="btn-secondary py-2.5 px-5 rounded-xl flex items-center gap-2"
                            >
                                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                                <span className="text-sm font-semibold">Test Connection</span>
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onSave(); }} 
                                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Edit Connection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin shadow-2xl" />
        <p className="text-secondary font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Syncing Control Center...</p>
    </div>
);


const SMTPTestModal: React.FC<{ isOpen: boolean, onClose: () => void, recipient: string, setRecipient: (v: string) => void, onTest: () => void, loading: boolean }> = ({ isOpen, onClose, recipient, setRecipient, onTest, loading }) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Transport Audit" maxWidth="md">
        <div className="space-y-6">
            <p className="text-secondary font-medium text-sm text-center px-4">Initialize a test sequence to verify SMTP relay connectivity and security handshake.</p>
            <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-secondary pl-1">Target Recipient</label>
                <div className="flex gap-2">
                    <input 
                        type="email" 
                        value={recipient} 
                        onChange={e => setRecipient(e.target.value)} 
                        placeholder="admin@enterprise.com" 
                        className="input flex-1 bg-secondary/10 p-4 border-theme focus:border-purple-500/50 rounded-2xl font-bold"
                    />
                    <button 
                        onClick={onTest} 
                        disabled={loading || !recipient}
                        className="p-4 bg-purple-600 text-white rounded-2xl shadow-lg shadow-purple-500/20 active:scale-90 transition-all"
                    >
                        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </div>
            </div>
            {loading && <div className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500 text-center animate-pulse mt-4">Transmitting Handshake...</div>}
        </div>
    </Modal>
);

const AddConnectionModal: React.FC<{ 
    isOpen: boolean, onClose: () => void, form: any, setForm: any, onSave: () => void, loading: boolean, isEditing: boolean 
}> = ({ isOpen, onClose, form, setForm, onSave, loading, isEditing }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Modify Connection" : "Add Infrastructure Connection"} maxWidth="lg">
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Provider</label>
                    <select 
                        value={form.provider}
                        onChange={e => setForm({...form, provider: e.target.value as any})}
                        className="input bg-secondary/10 p-4 border-theme rounded-2xl w-full"
                    >
                        <option value="vSphere">VMware vSphere</option>
                        <option value="Proxmox">Proxmox VE</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Connection Name</label>
                    <input 
                        type="text" 
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                        placeholder="Lab Environment"
                        className="input bg-secondary/10 p-4 border-theme rounded-2xl w-full"
                    />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Host / IP</label>
                    <input 
                        type="text" 
                        value={form.host}
                        onChange={e => setForm({...form, host: e.target.value})}
                        placeholder="10.10.10.50"
                        className="input bg-secondary/10 p-4 border-theme rounded-2xl w-full"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Port</label>
                    <input 
                        type="number" 
                        value={form.port}
                        onChange={e => setForm({...form, port: parseInt(e.target.value)})}
                        className="input bg-secondary/10 p-4 border-theme rounded-2xl w-full"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">User / Account</label>
                <input 
                    type="text" 
                    value={form.user}
                    onChange={e => setForm({...form, user: e.target.value})}
                    placeholder={form.provider === 'vSphere' ? 'administrator@vsphere.local' : 'root@pam'}
                    className="input bg-secondary/10 p-4 border-theme rounded-2xl w-full"
                />
            </div>

            {form.provider === 'vSphere' ? (
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Password</label>
                    <input 
                        type="password" 
                        value={form.password}
                        onChange={e => setForm({...form, password: e.target.value})}
                        placeholder="••••••••"
                        className="input bg-secondary/10 p-4 border-theme rounded-2xl w-full"
                    />
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Token ID (Optional)</label>
                        <input 
                            type="text" 
                            value={form.token_id}
                            onChange={e => setForm({...form, token_id: e.target.value})}
                            className="input bg-secondary/10 p-4 border-theme rounded-2xl w-full text-xs"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Token Secret / Pass</label>
                        <input 
                            type="password" 
                            value={form.token_secret || form.password}
                            onChange={e => setForm({...form, token_secret: e.target.value, password: e.target.value})}
                            className="input bg-secondary/10 p-4 border-theme rounded-2xl w-full text-xs"
                        />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4 py-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                        type="checkbox" 
                        checked={form.verify_ssl}
                        onChange={e => setForm({...form, verify_ssl: e.target.checked})}
                        className="w-5 h-5 rounded-lg border-theme text-blue-600 focus:ring-blue-500/20"
                    />
                    <span className="text-xs font-bold text-secondary group-hover:text-primary transition-colors">Verify SSL Certificate</span>
                </label>
            </div>

            <button 
                onClick={onSave}
                disabled={loading || !form.name || !form.host}
                className="w-full py-4 bg-primary text-secondary hover:text-primary rounded-2xl font-bold transition-all border border-theme shadow-xl active:scale-95 disabled:opacity-50"
            >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : isEditing ? 'Update Connection' : 'Initialize Connection'}
            </button>
        </div>
    </Modal>
);

export default Settings;
