import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { 
    User, 
    Shield, 
    Bell, 
    ChevronRight, 
    Check, 
    Server, 
    List, 
    Mail, 
    Send, 
    Cloud, 
    Globe, 
    RefreshCw, 
    Eye, 
    EyeOff, 
    LayoutGrid, 
    Rows3, 
    Edit3,
    Lock,
    CheckCircle2,
    Settings as SettingsIcon
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
    const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'cloud' | 'onprem' | 'system'>('profile');
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [browserNotifications, setBrowserNotifications] = useState(false);
    
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    
    // System Settings State
    const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
    const [testEmailLoading, setTestEmailLoading] = useState(false);
    const [testRecipient, setTestRecipient] = useState('');
    
    // Password Change State
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [pwdLoading, setPwdLoading] = useState(false);

    // Profile Edit State
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({ 
        first_name: '', 
        last_name: '',
        email: '',
        current_password: '',
        new_password: ''
    });
    const [profileSaving, setProfileSaving] = useState(false);

    const [smtpModalOpen, setSmtpModalOpen] = useState(false);
    
    // vSphere Inventory State
    const [vsphereInventory] = useState<any>(null);
    const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
    const [vsphereConnected, setVsphereConnected] = useState(false);
    const [vsphereTesting, setVsphereTesting] = useState(false);
    const [vsphereSaving, setVsphereSaving] = useState(false);
    
    // Proxmox Form State
    const [proxmoxForm, setProxmoxForm] = useState<Record<string, string>>({});
    const [proxmoxOriginal, setProxmoxOriginal] = useState<Record<string, string>>({});
    const [proxmoxTesting, setProxmoxTesting] = useState(false);
    const [proxmoxSaving, setProxmoxSaving] = useState(false);
    const [proxmoxConnected, setProxmoxConnected] = useState(false);

    // vSphere Form State
    const [vsphereForm, setVsphereForm] = useState<Record<string, string>>({});
    const [vsphereOriginal, setVsphereOriginal] = useState<Record<string, string>>({});

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
            
            const vsphereSettings: Record<string, string> = {};
            const proxmoxSettings: Record<string, string> = {};
            
            data.forEach((s: SystemSetting) => {
                if (s.key.startsWith('vsphere_')) vsphereSettings[s.key] = s.value;
                if (s.key.startsWith('proxmox_')) proxmoxSettings[s.key] = s.value;
            });
            
            setVsphereForm(vsphereSettings);
            setVsphereOriginal(vsphereSettings);
            setProxmoxForm(proxmoxSettings);
            setProxmoxOriginal(proxmoxSettings);
            
            // Sync connection status
            const vStat = await api.get('/infrastructure/vsphere/status').catch(() => ({ data: { connected: false } }));
            setVsphereConnected(vStat.data.connected);
            const pStat = await api.get('/infrastructure/proxmox/status').catch(() => ({ data: { connected: false } }));
            setProxmoxConnected(pStat.data.connected);

        } catch (e) {
            console.error(e);
            showToast('Failed to load settings', 'error');
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

    const handleSaveProxmox = async () => {
        setProxmoxSaving(true);
        try {
            const settingsToSave: Record<string, string> = {};
            Object.entries(proxmoxForm).forEach(([key, value]) => {
                if (value !== proxmoxOriginal[key]) settingsToSave[key] = value;
            });
            if (Object.keys(settingsToSave).length === 0) {
                showToast('No changes to save', 'info');
                return;
            }
            await api.post('/infrastructure/proxmox/save', { settings: settingsToSave, category: 'proxmox' });
            showToast('Proxmox settings committed', 'success');
            await fetchSettings();
        } catch {
            showToast('Failed to save Proxmox settings', 'error');
        } finally {
            setProxmoxSaving(false);
        }
    };

    const handleTestProxmox = async () => {
        setProxmoxTesting(true);
        try {
            const res = await api.post('/infrastructure/proxmox/test', {
                host: proxmoxForm['proxmox_host'] || '',
                port: parseInt(proxmoxForm['proxmox_port'] || '8006'),
                user: proxmoxForm['proxmox_user'] || '',
                password: proxmoxForm['proxmox_password'] || '',
                token_id: proxmoxForm['proxmox_token_id'],
                token_secret: proxmoxForm['proxmox_token_secret'],
                node: proxmoxForm['proxmox_node'] || 'pve',
                verify_ssl: proxmoxForm['proxmox_verify_ssl'] === 'true'
            });
            if (res.data.success) {
                showToast(`Proxmox Online: ${res.data.message}`, 'success');
                setProxmoxConnected(true);
            } else {
                showToast(res.data.message || 'Connection failed', 'error');
                setProxmoxConnected(false);
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Connection test failed', 'error');
            setProxmoxConnected(false);
        } finally {
            setProxmoxTesting(false);
        }
    };

    const handleSaveVsphere = async () => {
        setVsphereSaving(true);
        try {
            const settings: Record<string, string> = {};
            ['vsphere_host', 'vsphere_port', 'vsphere_user', 'vsphere_password', 'vsphere_verify_ssl', 'vsphere_sync_mode', 'vsphere_sync_interval'].forEach(key => {
                if (vsphereForm[key] !== vsphereOriginal[key]) settings[key] = vsphereForm[key];
            });
            if (Object.keys(settings).length === 0) {
                showToast('No changes to save', 'info');
                return;
            }
            await api.post('/infrastructure/vsphere/save', { settings, category: 'vsphere' });
            showToast('vSphere configuration updated', 'success');
            await fetchSettings();
        } catch {
            showToast('Failed to save vSphere settings', 'error');
        } finally {
            setVsphereSaving(false);
        }
    };

    const handleTestVsphere = async () => {
        setVsphereTesting(true);
        try {
            const res = await api.post('/infrastructure/vsphere/test', {
                host: vsphereForm['vsphere_host'],
                port: parseInt(vsphereForm['vsphere_port'] || '443'),
                user: vsphereForm['vsphere_user'],
                password: vsphereForm['vsphere_password'],
                verify_ssl: vsphereForm['vsphere_verify_ssl'] === 'true'
            });
            if (res.data.success) {
                showToast(`vSphere Connected: ${res.data.message}`, 'success');
                setVsphereConnected(true);
            } else {
                showToast(res.data.message || 'Connection failed', 'error');
                setVsphereConnected(false);
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Connection test failed', 'error');
            setVsphereConnected(false);
        } finally {
            setVsphereTesting(false);
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

    const handleSaveProfile = async () => {
        if (profileForm.new_password && !profileForm.current_password) {
            showToast('Current password required for change', 'warning');
            return;
        }
        setProfileSaving(true);
        try {
            await api.put('/auth/profile', {
                first_name: profileForm.first_name,
                last_name: profileForm.last_name,
                email: profileForm.email,
                current_password: profileForm.current_password || null,
                new_password: profileForm.new_password || null
            });
            showToast('Profile modernized successfully', 'success');
            setIsEditingProfile(false);
            window.location.reload();
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Profile update failed', 'error');
        } finally {
            setProfileSaving(false);
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

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pwdForm.new_password !== pwdForm.confirm_password) {
            showToast('Passwords do not match', 'error');
            return;
        }
        setPwdLoading(true);
        try {
            await api.post('/auth/change-password', {
                current_password: pwdForm.current_password,
                new_password: pwdForm.new_password
            });
            showToast('Security keys rotated successfully', 'success');
            setPwdModalOpen(false);
            setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Handshake failed', 'error');
        } finally {
            setPwdLoading(false);
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

    const tabs = [
        { id: 'profile', label: 'Identity', icon: User, color: 'blue' },
        { id: 'notifications', label: 'Alerts', icon: Bell, color: 'amber' },
        { id: 'cloud', label: 'Ecosystem', icon: Cloud, color: 'sky' },
        { id: 'onprem', label: 'Infrastructure', icon: Server, color: 'emerald' },
        { id: 'system', label: 'Security', icon: Shield, color: 'purple' },
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

                <div className="flex bg-secondary/30 p-1 rounded-2xl border border-theme backdrop-blur-md">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={clsx(
                            "p-2.5 rounded-xl transition-all",
                            viewMode === 'list' ? "bg-white dark:bg-slate-800 shadow-xl text-blue-500" : "text-secondary hover:text-primary"
                        )}
                    >
                        <Rows3 className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={() => setViewMode('grid')}
                        className={clsx(
                            "p-2.5 rounded-xl transition-all",
                            viewMode === 'grid' ? "bg-white dark:bg-slate-800 shadow-xl text-blue-500" : "text-secondary hover:text-primary"
                        )}
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Navigation Sidebar */}
                <aside className="w-full lg:w-72 flex-shrink-0 sticky top-24 z-10 space-y-2">
                    {tabs.map(tab => {
                        if (tab.id !== 'profile' && tab.id !== 'notifications' && user?.role !== 'admin') return null;
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
                    {activeTab === 'profile' && (
                        <div className="space-y-6">
                            <SectionHeader title="User Identity" subtitle="Manage your personal profile and credentials" />
                            <div className="glass rounded-[2.5rem] p-10 border border-theme shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                                    <User className="w-48 h-48" />
                                </div>
                                <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
                                    <div className="relative group">
                                        <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center text-white text-5xl font-black shadow-2xl ring-4 ring-white/10 group-hover:rotate-3 transition-transform duration-500">
                                            {user?.name?.charAt(0)}
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 p-2.5 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-theme">
                                            <Edit3 className="w-5 h-5 text-blue-500" />
                                        </div>
                                    </div>
                                    <div className="flex-1 text-center md:text-left">
                                        <h3 className="text-3xl font-black text-primary tracking-tight mb-1 uppercase italic">{user?.name}</h3>
                                        <p className="text-secondary font-medium text-lg mb-4">{user?.email}</p>
                                        <div className="flex flex-wrap justify-center md:justify-start gap-4">
                                            <div className="px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs font-black uppercase tracking-widest leading-none">
                                                {user?.role} Access
                                            </div>
                                            <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-black uppercase tracking-widest leading-none">
                                                Verified
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <button 
                                            onClick={() => setIsEditingProfile(true)}
                                            className="px-8 py-3 bg-primary text-secondary hover:text-primary rounded-2xl font-bold transition-all border border-theme"
                                        >
                                            Modify Identity
                                        </button>
                                        <button 
                                            onClick={() => setPwdModalOpen(true)}
                                            className="px-8 py-3 bg-secondary/30 hover:bg-secondary text-secondary hover:text-primary rounded-2xl font-bold transition-all border border-theme"
                                        >
                                            Reset Access Keys
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
                            <SectionHeader title="Cloud Integration" subtitle="Manage external provider credentials" />
                            <div className={clsx(viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4")}>
                                {cloudProviders.map(p => (
                                    <ProviderCard key={p.id} provider={p} onConfigure={() => handleOpenProviderModal(p)} viewMode={viewMode} />
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'onprem' && (
                        <div className="space-y-8">
                            <SectionHeader title="Infrastructure Matrix" subtitle="Connected clusters and hypervisors" />
                            <div className="grid grid-cols-1 gap-8">
                                <InfrastructureCard 
                                    name="VMware vSphere" 
                                    desc="Enterprise vCenter & ESXi orchestration"
                                    icon={VMwareIcon}
                                    connected={vsphereConnected}
                                    onTest={handleTestVsphere}
                                    onSave={handleSaveVsphere}
                                    loading={vsphereTesting}
                                    saving={vsphereSaving}
                                    form={vsphereForm}
                                    setForm={setVsphereForm}
                                    fields={[
                                        { key: 'vsphere_host', label: 'Management Host', placeholder: 'vcenter.labs.local' },
                                        { key: 'vsphere_port', label: 'Port', placeholder: '443' },
                                        { key: 'vsphere_user', label: 'Admin User', placeholder: 'administrator@vsphere.local' },
                                        { key: 'vsphere_password', label: 'Access Token', placeholder: '••••••••', secret: true }
                                    ]}
                                    secondaryActions={
                                        <button className="btn-secondary py-2 px-4 italic" onClick={() => setInventoryModalOpen(true)}>
                                            <List className="w-4 h-4" /> Verify Inventory
                                        </button>
                                    }
                                />
                                <InfrastructureCard 
                                    name="Proxmox VE" 
                                    desc="Virtual Environment nodes and clusters"
                                    icon={ProxmoxIcon}
                                    connected={proxmoxConnected}
                                    onTest={handleTestProxmox}
                                    onSave={handleSaveProxmox}
                                    loading={proxmoxTesting}
                                    saving={proxmoxSaving}
                                    form={proxmoxForm}
                                    setForm={setProxmoxForm}
                                    fields={[
                                        { key: 'proxmox_host', label: 'PVE IP / Host', placeholder: '10.0.0.5' },
                                        { key: 'proxmox_port', label: 'Port', placeholder: '8006' },
                                        { key: 'proxmox_node', label: 'Target Node', placeholder: 'pve01' },
                                        { key: 'proxmox_user', label: 'PAM/PVE User', placeholder: 'root@pam' },
                                        { key: 'proxmox_password', label: 'Password', placeholder: '••••••••', secret: true }
                                    ]}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'system' && (
                        <div className="space-y-6">
                            <SectionHeader title="System Core" subtitle="Global configuration and SMTP security" />
                            <div className="glass rounded-[2.5rem] border border-theme p-10 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none text-purple-500">
                                    <Lock className="w-32 h-32" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                                    {systemSettings.filter(s => s.category === 'smtp').map(s => (
                                        <div key={s.key} className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary pl-1">{s.description || s.key}</label>
                                            <input 
                                                type={s.is_secret ? "password" : "text"}
                                                value={s.value}
                                                onChange={e => handleUpdateSetting(s.key, e.target.value)}
                                                className="input bg-secondary/20 p-4 border-theme/50 focus:border-purple-500/50 rounded-2xl"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-10 pt-8 border-t border-theme flex justify-end relative z-10">
                                    <button 
                                        onClick={() => setSmtpModalOpen(true)}
                                        className="flex items-center gap-2 px-6 py-3 bg-purple-600/10 text-purple-500 border border-purple-500/20 rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:bg-purple-600 hover:text-white"
                                    >
                                        <Send className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                        Audit SMTP Transport
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* Change Profile Modal */}
            <Modal isOpen={isEditingProfile} onClose={() => setIsEditingProfile(false)} title="Update Identity" maxWidth="lg">
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="First Name" val={profileForm.first_name} onChange={v => setProfileForm({...profileForm, first_name: v})} />
                        <Field label="Last Name" val={profileForm.last_name} onChange={v => setProfileForm({...profileForm, last_name: v})} />
                    </div>
                    <Field label="Contact Email" val={profileForm.email} readOnly />
                    <div className="pt-4 border-t border-theme">
                        <p className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] mb-4">Security Confirmation</p>
                        <Field label="Current Password" val={profileForm.current_password} type="password" placeholder="Required for changes" onChange={v => setProfileForm({...profileForm, current_password: v})} />
                    </div>
                    <div className="flex gap-4 pt-4">
                        <button 
                            onClick={handleSaveProfile} 
                            disabled={profileSaving}
                            className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-[1.5rem] font-bold shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
                        >
                            {profileSaving ? <RefreshCw className="w-6 h-6 animate-spin mx-auto" /> : 'Commit Changes'}
                        </button>
                    </div>
                </div>
            </Modal>

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

            {/* Core Logic Placeholder for omitted functions to ensure build */}
            <InventoryModal isOpen={inventoryModalOpen} onClose={() => setInventoryModalOpen(false)} inventory={vsphereInventory} />
            <PasswordModal isOpen={pwdModalOpen} onClose={() => setPwdModalOpen(false)} form={pwdForm} setForm={setPwdForm} onSave={handlePasswordChange} loading={pwdLoading} />
            <SMTPTestModal isOpen={smtpModalOpen} onClose={() => setSmtpModalOpen(false)} recipient={testRecipient} setRecipient={setTestRecipient} onTest={handleTestEmail} loading={testEmailLoading} />
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

const ProviderCard: React.FC<{ provider: any, onConfigure: () => void, viewMode: string }> = ({ provider, onConfigure, viewMode }) => (
    <div 
        onClick={onConfigure}
        className={clsx(
            "glass rounded-[2rem] border border-theme cursor-pointer group transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] overflow-hidden relative",
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
                "p-5 rounded-[1.5rem] bg-gradient-to-br from-secondary/50 to-secondary/30 border border-theme/50 shadow-inner mb-6 transition-all duration-500 group-hover:rotate-6",
                viewMode === 'list' && "mb-0 mr-6"
            )}>
                <provider.icon className="w-8 h-8 opacity-80" />
            </div>
            <div className="flex-1">
                <span className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">{provider.id} network</span>
                <h4 className="text-xl font-black text-primary tracking-tighter uppercase italic leading-none my-1">{provider.name}</h4>
                <p className="text-[11px] text-secondary font-medium leading-relaxed opacity-60 px-2">{provider.description}</p>
            </div>
            <div className={clsx(
                "mt-6 flex items-center gap-2 px-6 py-2 bg-secondary/30 rounded-full text-[10px] font-black uppercase tracking-widest text-secondary transition-all group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-500/20",
                viewMode === 'list' && "mt-0"
            )}>
                Config <ChevronRight className="w-3.5 h-3.5" />
            </div>
        </div>
    </div>
);

const InfrastructureCard: React.FC<{ 
    name: string, desc: string, icon: any, connected: boolean, fields: any[], 
    onTest: () => void, onSave: () => void, loading: boolean, saving: boolean, 
    form: any, setForm: any, secondaryActions?: React.ReactNode 
}> = ({ name, desc, icon: Icon, connected, fields, onTest, onSave, loading, saving, form, setForm, secondaryActions }) => {
    const [showLocal, setShowLocal] = useState(false);
    return (
        <div className="glass rounded-[3rem] border border-theme overflow-hidden shadow-2xl transition-all duration-500 hover:border-blue-500/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between p-10 bg-secondary/20 border-b border-theme/50 relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-500/5 blur-3xl translate-x-1/2" />
                <div className="flex items-center gap-6 relative z-10">
                    <div className="p-5 rounded-[2rem] bg-white dark:bg-slate-900 border border-theme shadow-2xl transition-all duration-500 group-hover:scale-110">
                        <Icon className="w-10 h-10" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-2xl font-black text-primary tracking-tighter uppercase italic">{name}</h3>
                            <div className={clsx(
                                "flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                                connected ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                            )}>
                                <div className={clsx("w-1.5 h-1.5 rounded-full animate-pulse", connected ? "bg-emerald-500" : "bg-red-500")} />
                                {connected ? 'Live' : 'Offline'}
                            </div>
                        </div>
                        <p className="text-sm font-medium text-secondary italic opacity-80">{desc}</p>
                    </div>
                </div>
                <div className="mt-6 md:mt-0 flex gap-3 relative z-10">
                    {secondaryActions}
                    <button 
                        onClick={onTest} 
                        disabled={loading}
                        className="btn-secondary py-3 px-6 rounded-2xl flex items-center gap-2 group"
                    >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4 group-hover:text-blue-500" />}
                        <span className="text-xs font-black uppercase tracking-widest leading-none">Audit Link</span>
                    </button>
                    <button 
                        onClick={onSave} 
                        disabled={saving}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/30 transition-all hover:scale-[1.05] active:scale-[0.95]"
                    >
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Commit'}
                    </button>
                </div>
            </div>
            
            <div className="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-white/5">
                {fields.map(f => (
                    <div key={f.key} className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-secondary pl-1 opacity-60">{f.label}</label>
                        <div className="relative">
                            <input 
                                type={f.secret && !showLocal ? "password" : "text"}
                                value={form[f.key] || ''}
                                onChange={e => setForm({...form, [f.key]: e.target.value})}
                                placeholder={f.placeholder}
                                className="input bg-secondary/10 p-4 border-theme/50 focus:border-blue-500/50 rounded-2xl w-full text-sm font-bold"
                            />
                            {f.secret && (
                                <button 
                                    onClick={() => setShowLocal(!showLocal)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary hover:text-primary"
                                >
                                    {showLocal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string, val: string, readOnly?: boolean, type?: string, placeholder?: string, onChange?: (v: string) => void }> = ({ label, val, readOnly, type = "text", placeholder, onChange }) => (
    <div className="space-y-2 w-full">
        <label className="text-[10px] font-black uppercase tracking-widest text-secondary pl-1">{label}</label>
        <input 
            type={type}
            value={val}
            onChange={e => onChange?.(e.target.value)}
            readOnly={readOnly}
            placeholder={placeholder}
            className={clsx(
                "input p-4 border-theme/50 focus:border-blue-500/50 rounded-2xl w-full font-bold",
                readOnly ? "bg-secondary/10 cursor-not-allowed opacity-50" : "bg-secondary/20"
            )}
        />
    </div>
);

const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin shadow-2xl" />
        <p className="text-secondary font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Syncing Control Center...</p>
    </div>
);

const InventoryModal: React.FC<{ isOpen: boolean, onClose: () => void, inventory: any }> = ({ isOpen, onClose, inventory }) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Infrastructure Audit" maxWidth="4xl">
        <div className="space-y-6">
            {!inventory ? (
                <div className="p-12 text-center text-secondary border-2 border-dashed border-theme rounded-[2rem] bg-secondary/10">
                    <Cloud className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold text-lg">No inventory cached</p>
                    <p className="text-xs uppercase tracking-widest font-black opacity-50">Sync from provider to populate audit data</p>
                </div>
            ) : (
                <div className="space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar pr-4">
                    <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-primary">Sync Successful</p>
                            <p className="text-[10px] font-bold text-secondary">{new Date(inventory.last_sync).toLocaleString()}</p>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-widest text-primary px-1 flex items-center gap-2">
                            <Server className="w-4 h-4 text-blue-500" /> Virtual Entities ({inventory.vms?.length || 0})
                        </h3>
                        <div className="glass rounded-[2rem] border border-theme overflow-hidden shadow-lg">
                            <table className="w-full text-left">
                                <thead className="bg-secondary/20 text-[10px] font-black uppercase tracking-widest text-secondary border-b border-theme">
                                    <tr>
                                        <th className="px-6 py-4">Descriptor</th>
                                        <th className="px-6 py-4">Metric</th>
                                        <th className="px-6 py-4">Blueprint Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-theme text-sm">
                                    {inventory.vms?.map((vm: any, i: number) => (
                                        <tr key={i} className="hover:bg-secondary/10 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={clsx("w-2 h-2 rounded-full shadow-sm", vm.power_state?.toString().toLowerCase().includes('on') ? 'bg-emerald-500' : 'bg-slate-500')} />
                                                    <span className="font-bold text-primary">{vm.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-bold text-secondary">
                                                {vm.cpu}vCPU / {Math.round(vm.memory_mb/1024)}GB
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={clsx(
                                                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                                    vm.is_template ? "bg-purple-500/10 border-purple-500/20 text-purple-500" : "bg-blue-500/10 border-blue-500/20 text-blue-500"
                                                )}>
                                                    {vm.is_template ? 'Template' : 'Instance'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </Modal>
);

const PasswordModal: React.FC<{ isOpen: boolean, onClose: () => void, form: any, setForm: any, onSave: (e: any) => void, loading: boolean }> = ({ isOpen, onClose, form, setForm, onSave, loading }) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Rotate Credentials" maxWidth="sm">
        <form onSubmit={onSave} className="space-y-6">
            <Field label="Current Alpha-Key" type="password" val={form.current_password} onChange={v => setForm({...form, current_password: v})} />
            <div className="h-px bg-theme/50 w-full" />
            <Field label="New Secure-Key" type="password" val={form.new_password} onChange={v => setForm({...form, new_password: v})} />
            <Field label="Verify New Secure-Key" type="password" val={form.confirm_password} onChange={v => setForm({...form, confirm_password: v})} />
            <button 
                type="submit" 
                disabled={loading} 
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/30 transition-all hover:scale-[1.05]"
            >
                {loading ? 'Encrypting...' : 'Update Alpha-Key'}
            </button>
        </form>
    </Modal>
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

export default Settings;
