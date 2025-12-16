import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { User, Shield, Bell, ChevronRight, Check, Server, Lock, Mail, Send, Cloud, Globe, Save, RefreshCw, List, Eye, EyeOff, LayoutGrid, Rows3, Edit3 } from 'lucide-react';
import Modal from '../components/Modal';
import SettingsSection from '../components/SettingsSection';
import { AwsIcon, AzureIcon, GcpIcon, ProxmoxIcon, VMwareIcon } from '../components/ProviderIcons';

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
    
    const [viewDensity] = useState<'comfortable' | 'compact'>('compact');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    
    // System Settings State
    const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
    const [loadingSettings, setLoadingSettings] = useState(false);
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
    const [vsphereInventory, setVsphereInventory] = useState<any>(null);
    const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
    const [syncingInventory, setSyncingInventory] = useState(false);
    const [vsphereConnected, setVsphereConnected] = useState(false);
    const [vsphereTesting, setVsphereTesting] = useState(false);
    const [vsphereSaving, setVsphereSaving] = useState(false);
    
    // Proxmox Form State
    const [proxmoxForm, setProxmoxForm] = useState<Record<string, string>>({});
    const [proxmoxOriginal, setProxmoxOriginal] = useState<Record<string, string>>({});
    const [showProxmoxSecret, setShowProxmoxSecret] = useState(false);
    const [proxmoxTesting, setProxmoxTesting] = useState(false);
    const [proxmoxSaving, setProxmoxSaving] = useState(false);
    const [proxmoxConnected, setProxmoxConnected] = useState(false);

    // vSphere Form State (separate from displayed settings)
    const [vsphereForm, setVsphereForm] = useState<Record<string, string>>({});
    const [vsphereOriginal, setVsphereOriginal] = useState<Record<string, string>>({});
    const [showVspherePassword, setShowVspherePassword] = useState(false);

    // Cloud Provider State
    interface CloudProvider {
        id: string;
        name: string;
        icon: any;
        color: string; // Tailwind color name for default styling logic
        customColor?: string; // Specific brand hex if needed
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

    const handleOpenProviderModal = (provider: CloudProvider) => {
        setSelectedProvider(provider);
        // Initialize form with current values
        const form: Record<string, string> = {};
        systemSettings
            .filter(s => s.category === provider.id) // Simple filter for now
            .forEach(s => {
                form[s.key] = s.value;
            });
        setProviderForm(form);
    };

    const handleSaveProvider = async () => {
        setProviderSaving(true);
        try {
            // Save each changed setting
            const promises = Object.entries(providerForm).map(([key, value]) => {
                // Only update if changed (basic check)
                const current = systemSettings.find(s => s.key === key);
                if (current && current.value !== value) {
                    return api.put(`/settings/${key}`, { value });
                }
                return Promise.resolve();
            });

            await Promise.all(promises);
            
            // Refresh settings to ensure sync
            await fetchSettings();
            showToast('Provider settings saved successfully', 'success');
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
            // Filter only changed settings
            const settingsToSave: Record<string, string> = {};
            let hasChanges = false;
            
            Object.entries(proxmoxForm).forEach(([key, value]) => {
                if (value !== proxmoxOriginal[key]) {
                    settingsToSave[key] = value;
                    hasChanges = true;
                }
            });

            if (!hasChanges) {
                showToast('No changes to save', 'info');
                return;
            }

            await api.post('/infrastructure/proxmox/save', { 
                settings: settingsToSave, 
                category: 'proxmox' 
            });
            
            showToast('Proxmox settings saved', 'success');
            await fetchSettings(); // Reload to update original state
        } catch {
            showToast('Failed to save Proxmox settings', 'error');
        } finally {
            setProxmoxSaving(false);
        }
    };

    const handleTestProxmox = async () => {
        setProxmoxTesting(true);
        try {
            // Use form values
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
                showToast(`Connected! ${res.data.message}`, 'success');
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

    useEffect(() => {
        if (user?.role === 'admin') {
            fetchSettings();
            if (user?.email) setTestRecipient(user.email);
        }
        fetchPreferences();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const fetchSettings = async () => {
        setLoadingSettings(true);
        try {
            const res = await api.get('/settings/');
            const data = Array.isArray(res.data) ? res.data : [];
            setSystemSettings(data);
            
            // Initialize vSphere form from settings
            const vsphereSettings: Record<string, string> = {};
            const proxmoxSettings: Record<string, string> = {};
            
            data.forEach((s: SystemSetting) => {
                if (s.key.startsWith('vsphere_')) {
                    vsphereSettings[s.key] = s.value;
                }
                if (s.key.startsWith('proxmox_')) {
                    proxmoxSettings[s.key] = s.value;
                }
            });
            
            setVsphereForm(vsphereSettings);
            setVsphereOriginal(vsphereSettings);
            
            setProxmoxForm(proxmoxSettings);
            setProxmoxOriginal(proxmoxSettings);
            
        } catch (e) {
            console.error(e);
            showToast('Failed to load settings', 'error');
        } finally {
            setLoadingSettings(false);
        }
        // ... (check status)


        // Check vSphere status
        try {
            const res = await api.get('/infrastructure/vsphere/status');
            setVsphereConnected(res.data.connected);
        } catch (e) {
            setVsphereConnected(false);
        }
    };

    const fetchPreferences = async () => {
        try {
            const res = await api.get('/preferences/');
            setEmailNotifications(res.data.email_notifications);
            setBrowserNotifications(res.data.browser_notifications);
            localStorage.setItem('browser_notifications', res.data.browser_notifications ? 'true' : 'false');
        } catch (e) {
            console.error(e);
        }
    };

    const handleUpdateSetting = async (key: string, value: string) => {
        try {
            await api.put(`/settings/${key}`, { value });
            setSystemSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
            showToast('Setting updated', 'success');
        } catch {
            showToast('Failed to update setting', 'error');
            fetchSettings();
        }
    };

    const handleUpdatePreferences = async (email?: boolean, browser?: boolean) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: any = {};
            if (email !== undefined) payload.email_notifications = email;
            if (browser !== undefined) payload.browser_notifications = browser;
            
            await api.put('/preferences/', payload);
            showToast('Preferences updated', 'success');
        } catch {
            showToast('Failed to update preferences', 'error');
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pwdForm.new_password !== pwdForm.confirm_password) {
            showToast('New passwords do not match', 'error');
            return;
        }
        setPwdLoading(true);
        try {
            await api.post('/auth/change-password', {
                current_password: pwdForm.current_password,
                new_password: pwdForm.new_password
            });
            showToast('Password updated successfully', 'success');
            setPwdModalOpen(false);
            setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to update password', 'error');
        } finally {
            setPwdLoading(false);
        }
    };

    const handleSaveProfile = async () => {
        // Validate: if changing password, current_password is required
        if (profileForm.new_password && !profileForm.current_password) {
            showToast('Current password is required to set a new password', 'error');
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
            showToast('Profile updated successfully', 'success');
            setIsEditingProfile(false);
            // Refresh user data
            window.location.reload();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to update profile', 'error');
        } finally {
            setProfileSaving(false);
        }
    };

    const handleTestEmail = async () => {
        setTestEmailLoading(true);
        try {
            // We'll send to the current user's email
            await api.post('/email/test', {
                 to: [testRecipient || user?.email],
                 subject: "SMTP Configuration Test",
                 message: "If you are reading this, your SMTP configuration is working correctly!"
            });
            showToast('Test email sent successfully!', 'success');
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error(e);
            showToast(e.response?.data?.detail || 'Failed to send test email', 'error');
        } finally {
            setTestEmailLoading(false);
        }
    };

    const renderSettingInput = (setting: SystemSetting, isBuffered = false) => {
        if (setting.key.endsWith('_tls') || setting.key.endsWith('_ssl')) {
             const isChecked = isBuffered ? providerForm[setting.key] === 'true' : setting.value === 'true';
             const handleToggle = (val: string) => {
                 if (isBuffered) {
                     setProviderForm(prev => ({ ...prev, [setting.key]: val }));
                 } else {
                     handleUpdateSetting(setting.key, val);
                 }
             };

             return (
                 <div className="flex items-center justify-between py-2">
                     <label className="text-secondary text-sm">{setting.description}</label>
                     <button 
                        onClick={() => handleToggle(isChecked ? 'false' : 'true')}
                        className={`relative w-12 h-6 rounded-full p-1 transition-colors ${isChecked ? 'bg-blue-600' : 'bg-gray-600'}`}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isChecked ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                 </div>
             );
        }

        return (
            <div className={`space-y-1 ${viewDensity === 'compact' ? 'py-1' : ''}`}>
                <label className="input-label text-xs uppercase tracking-wider">{setting.description || setting.key}</label>
                <input 
                    type={setting.is_secret ? "password" : "text"}
                    className={`input ${viewDensity === 'compact' ? 'py-1.5 text-sm' : ''}`}
                    value={isBuffered ? (providerForm[setting.key] !== undefined ? providerForm[setting.key] : setting.value) : setting.value}
                    onChange={(e) => {
                        if (isBuffered) {
                            setProviderForm(prev => ({ ...prev, [setting.key]: e.target.value }));
                        }
                    }}
                    onBlur={(e) => {
                        if (!isBuffered && e.target.value !== setting.value && e.target.value !== '********') {
                            handleUpdateSetting(setting.key, e.target.value);
                        }
                    }}
                    placeholder={setting.is_secret ? "••••••••" : ""}
                    readOnly={!isBuffered && setting.is_secret} // Prevent accidental edits on main page for secrets without distinct save action? Actually existing logic allows blur save. Keeping consistent.
                />
            </div>
        );
    };

    const tabs = [
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'cloud', label: 'Cloud Providers', icon: Cloud },
        { id: 'onprem', label: 'On-Premise', icon: Server },
        { id: 'system', label: 'Configuration', icon: Shield },
    ] as const;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!user) {
        // Redirect to login if not authenticated
        window.location.href = '/login';
        return null;
    }

    return (
        <div className="w-full px-4">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-primary">Settings</h1>
                    <p className="mt-1 text-secondary">
                        Manage your account preferences and system configuration
                    </p>
                </div>
                {/* View Mode Toggle */}
                <div className="flex gap-1 p-1 bg-secondary/30 rounded-lg border border-theme">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-md transition-all ${
                            viewMode === 'list' 
                                ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm ring-1 ring-black/5' 
                                : 'text-secondary hover:text-primary hover:bg-white/50 dark:hover:bg-gray-800/50'
                        }`}
                        title="List View"
                    >
                        <Rows3 className={`w-4 h-4 ${viewMode === 'list' ? 'text-blue-500' : 'text-secondary'}`} />
                    </button>
                    <button 
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-md transition-all ${
                            viewMode === 'grid' 
                                ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm ring-1 ring-black/5' 
                                : 'text-secondary hover:text-primary hover:bg-white/50 dark:hover:bg-gray-800/50'
                        }`}
                        title="Grid View"
                    >
                        <LayoutGrid className={`w-4 h-4 ${viewMode === 'grid' ? 'text-blue-500' : 'text-secondary'}`} />
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 relative items-start">
                {/* Sticky Sidebar Navigation */}
                <div className="w-full lg:w-64 flex-shrink-0 sticky top-24 z-10 self-start">
                    <nav className="flex lg:flex-col gap-2 overflow-x-auto pb-4 lg:pb-0 p-1">
                        {tabs.map(tab => {
                             // Profile and Notifications visible to all, others admin-only
                             if (tab.id !== 'profile' && tab.id !== 'notifications' && user.role !== 'admin') return null;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap text-left ${
                                        activeTab === tab.id 
                                            ? 'bg-blue-500/10 text-blue-600 font-medium shadow-sm ring-1 ring-blue-500/20' 
                                            : 'text-secondary hover:bg-secondary hover:text-primary'
                                    }`}
                                >
                                    <Icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-blue-500' : 'text-secondary/70'}`} />
                                    <span>{tab.label}</span>
                                    {activeTab === tab.id && (
                                        <ChevronRight className="w-4 h-4 ml-auto text-blue-400" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 space-y-6">
                    {/* Profile Tab */}
                    {activeTab === 'profile' && (
                        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'space-y-6'}>
                            <SettingsSection title="Profile" icon={User} color="blue" density={viewDensity}>
                                <div className="space-y-4">
                                    {!isEditingProfile ? (
                                        <>
                                            <div className="flex items-center gap-4">
                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                                                    {user?.name?.charAt(0) || 'U'}
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="text-lg font-semibold text-primary">{user?.name}</h3>
                                                    <p className="text-secondary">{user?.email}</p>
                                                    <span className="badge badge-info mt-2 inline-block capitalize">{user?.role}</span>
                                                </div>
                                                <button 
                                                    onClick={() => setPwdModalOpen(true)}
                                                    className="p-2 rounded-lg hover:bg-secondary/20 transition-colors"
                                                    title="Change Password"
                                                >
                                                    🔑
                                                </button>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setProfileForm({ 
                                                        first_name: user?.name?.split(' ')[0] || '', 
                                                        last_name: user?.name?.split(' ').slice(1).join(' ') || '',
                                                        email: user?.email || '',
                                                        current_password: '',
                                                        new_password: ''
                                                    });
                                                    setIsEditingProfile(true);
                                                }}
                                                className="btn-secondary flex items-center gap-2"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                                Edit Profile
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="label">First Name</label>
                                                        <input
                                                            type="text"
                                                            className="input"
                                                            value={profileForm.first_name}
                                                            onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="label">Last Name</label>
                                                        <input
                                                            type="text"
                                                            className="input"
                                                            value={profileForm.last_name}
                                                            onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="label">Email <span className="text-xs text-secondary">(read-only)</span></label>
                                                    <input
                                                        type="email"
                                                        className="input bg-secondary/20 cursor-not-allowed"
                                                        value={profileForm.email}
                                                        disabled
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSaveProfile}
                                                    disabled={profileSaving}
                                                    className="btn-primary flex items-center gap-2"
                                                >
                                                    {profileSaving ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <Save className="w-4 h-4" />
                                                    )}
                                                    Save Changes
                                                </button>
                                                <button
                                                    onClick={() => setIsEditingProfile(false)}
                                                    className="btn-secondary"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </SettingsSection>
                        </div>
                    )}

                    {/* Notifications Tab */}
                    {activeTab === 'notifications' && (
                        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'space-y-6'}>
                            <SettingsSection title="Email Notifications" icon={Bell} color="amber" density={viewDensity}>
                                <div className="space-y-4">
                                    <ToggleOption 
                                        title="Email Alerts"
                                        description="Receive email alerts for class updates"
                                        enabled={emailNotifications}
                                        onChange={(val) => {
                                            setEmailNotifications(val);
                                            handleUpdatePreferences(val, undefined);
                                        }}
                                    />
                                </div>
                            </SettingsSection>

                            <SettingsSection title="Browser Notifications" icon={Globe} color="purple" density={viewDensity}>
                                <div className="space-y-4">
                                    <ToggleOption 
                                        title="Desktop Notifications"
                                        description="Show desktop push notifications"
                                        enabled={browserNotifications}
                                        onChange={async (val) => {
                                            if (val) {
                                                const permission = await Notification.requestPermission();
                                                if (permission === 'granted') {
                                                    setBrowserNotifications(true);
                                                    handleUpdatePreferences(undefined, true);
                                                    localStorage.setItem('browser_notifications', 'true');
                                                    new Notification("Notifications Enabled", { body: "You will now receive desktop notifications." });
                                                } else {
                                                    setBrowserNotifications(false);
                                                    showToast('Permission denied. Please enable notifications in your browser settings.', 'error');
                                                    localStorage.setItem('browser_notifications', 'false');
                                                }
                                            } else {
                                                setBrowserNotifications(false);
                                                handleUpdatePreferences(undefined, false);
                                                localStorage.setItem('browser_notifications', 'false');
                                            }
                                        }}
                                    />
                                </div>
                            </SettingsSection>
                        </div>
                    )}

                    {/* Cloud Providers Tab */}
                    {activeTab === 'cloud' && user?.role === 'admin' && (
                        <>
                            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
                                {cloudProviders.map(provider => (
                                    viewMode === 'grid' ? (
                                        <div 
                                            key={provider.id}
                                            onClick={() => handleOpenProviderModal(provider)}
                                            className="card hover:border-blue-500/50 cursor-pointer group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 relative overflow-hidden"
                                        >
                                            <div className={`absolute top-0 right-0 w-24 h-24 bg-${provider.color}-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`} />
                                            
                                            <div className="flex items-start justify-between mb-4 relative z-10">
                                                <div className={`p-3 rounded-xl bg-${provider.color}-500/10 text-${provider.color}-500`}>
                                                    <provider.icon className="w-8 h-8" />
                                                </div>
                                                {systemSettings.some(s => s.category === provider.id && s.value && s.value !== 'false') && (
                                                    <div className="badge badge-success flex items-center gap-1">
                                                        <Check className="w-3 h-3" />
                                                        Configured
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <h3 className="text-xl font-bold text-primary mb-1">{provider.name}</h3>
                                            <p className="text-sm text-secondary line-clamp-2">{provider.description}</p>
                                            
                                            <div className="mt-4 flex items-center text-blue-500 font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                                Manage Settings
                                                <ChevronRight className="w-4 h-4 ml-1" />
                                            </div>
                                        </div>
                                    ) : (
                                        /* List View: Horizontal row card */
                                        <div 
                                            key={provider.id}
                                            onClick={() => handleOpenProviderModal(provider)}
                                            className="card flex items-center gap-4 p-4 hover:border-blue-500/50 cursor-pointer group transition-all"
                                        >
                                            <div className={`p-3 rounded-xl bg-${provider.color}-500/10 text-${provider.color}-500 shrink-0`}>
                                                <provider.icon className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-primary truncate">{provider.name}</h3>
                                                <p className="text-xs text-secondary truncate">{provider.description}</p>
                                            </div>
                                            {systemSettings.some(s => s.category === provider.id && s.value && s.value !== 'false') && (
                                                <div className="badge badge-success flex items-center gap-1 shrink-0">
                                                    <Check className="w-3 h-3" />
                                                    Configured
                                                </div>
                                            )}
                                            <ChevronRight className="w-5 h-5 text-secondary group-hover:text-blue-500 transition-colors shrink-0" />
                                        </div>
                                    )
                                ))}
                            </div>

                            {/* Provider Edit Modal */}
                            <Modal 
                                isOpen={!!selectedProvider} 
                                onClose={() => setSelectedProvider(null)} 
                                title={selectedProvider ? `Configure ${selectedProvider.name}` : 'Configure Provider'}
                                maxWidth="lg"
                            >
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4 p-4 bg-secondary/20 rounded-xl border border-theme">
                                        <div className={`p-3 rounded-lg bg-${selectedProvider?.color}-500/10`}>
                                            {selectedProvider && <selectedProvider.icon className={`w-6 h-6 text-${selectedProvider.color}-500`} />}
                                        </div>
                                        <div>
                                            <p className="text-sm text-secondary">Make sure you have the necessary API keys and permissions enabled for this provider.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                                        {loadingSettings ? (
                                            <div className="flex justify-center p-8">
                                                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                                            </div>
                                        ) : (
                                            systemSettings
                                                .filter(s => s.category === selectedProvider?.id)
                                                .map(setting => (
                                                    <div key={setting.key}>
                                                        {renderSettingInput(setting, true)} 
                                                    </div>
                                                ))
                                        )}
                                        {selectedProvider && systemSettings.filter(s => s.category === selectedProvider.id).length === 0 && (
                                            <p className="text-center text-secondary py-8">No specific settings found for this provider.</p>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-theme">
                                        <button 
                                            onClick={() => setSelectedProvider(null)} 
                                            className="btn-secondary"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleSaveProvider} 
                                            disabled={providerSaving}
                                            className="btn-primary"
                                        >
                                            {providerSaving ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <Save className="w-4 h-4 ml-1" />
                                                    Save Changes
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </Modal>
                        </>
                    )}

                    {/* On-Premise Tab */}
                    {activeTab === 'onprem' && user?.role === 'admin' && (
                        <div className="space-y-8">
                            {/* Proxmox VE Card */}
                            <div className="card-elevated overflow-hidden">
                                <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-b border-theme px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg border border-theme">
                                            <ProxmoxIcon className="w-7 h-7" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-primary">Proxmox VE</h3>
                                            <p className="text-xs text-secondary">Virtual Environment Management</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Host / IP Address</label>
                                            <input type="text" className="input" placeholder="192.168.1.10" 
                                                value={proxmoxForm['proxmox_host'] || ''}
                                                onChange={(e) => setProxmoxForm({...proxmoxForm, proxmox_host: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Port</label>
                                            <input type="text" className="input" placeholder="8006" 
                                                value={proxmoxForm['proxmox_port'] || '8006'}
                                                onChange={(e) => setProxmoxForm({...proxmoxForm, proxmox_port: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Target Node</label>
                                            <input type="text" className="input" placeholder="pve" 
                                                value={proxmoxForm['proxmox_node'] || ''}
                                                onChange={(e) => setProxmoxForm({...proxmoxForm, proxmox_node: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Username</label>
                                            <input type="text" className="input" placeholder="root@pam" 
                                                value={proxmoxForm['proxmox_user'] || ''}
                                                onChange={(e) => setProxmoxForm({...proxmoxForm, proxmox_user: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Password</label>
                                            <div className="relative">
                                                <input 
                                                    type={showProxmoxSecret ? "text" : "password"} 
                                                    className="input pr-10" 
                                                    placeholder="Enter password..." 
                                                    value={proxmoxForm['proxmox_password'] || ''}
                                                    onChange={(e) => setProxmoxForm({...proxmoxForm, proxmox_password: e.target.value})}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowProxmoxSecret(!showProxmoxSecret)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                                                >
                                                    {showProxmoxSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>

                                        </div>
                                        
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">API Token ID (Optional)</label>
                                            <input type="text" className="input" placeholder="user@pam!tokenid" 
                                                value={proxmoxForm['proxmox_token_id'] || ''}
                                                onChange={(e) => setProxmoxForm({...proxmoxForm, proxmox_token_id: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">API Token Secret (Optional)</label>
                                            <div className="relative">
                                                <input 
                                                    type={showProxmoxSecret ? "text" : "password"} 
                                                    className="input pr-10" 
                                                    placeholder="••••••••••••••••" 
                                                    value={proxmoxForm['proxmox_token_secret'] || ''}
                                                    onChange={(e) => setProxmoxForm({...proxmoxForm, proxmox_token_secret: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-end">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className={`relative w-11 h-6 rounded-full transition-colors ${proxmoxForm['proxmox_verify_ssl'] === 'true' ? 'bg-blue-600' : 'bg-gray-600'}`}
                                                    onClick={() => setProxmoxForm(prev => ({...prev, proxmox_verify_ssl: prev['proxmox_verify_ssl'] === 'true' ? 'false' : 'true'}))}
                                                >
                                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${proxmoxForm['proxmox_verify_ssl'] === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
                                                </div>
                                                <span className="text-sm text-secondary group-hover:text-primary transition-colors">Verify SSL</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="mt-6 pt-5 border-t border-theme flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm text-secondary">
                                            <div className={`w-2 h-2 rounded-full ${proxmoxConnected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                            <span>{proxmoxConnected ? 'Connected' : 'Not connected'}</span>
                                        </div>
                                        <div className="flex gap-3">
                                            <button 
                                                className="btn-secondary"
                                                onClick={handleTestProxmox}
                                                disabled={proxmoxTesting}
                                            >
                                                {proxmoxTesting ? (
                                                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                                ) : (
                                                    <Globe className="w-4 h-4" />
                                                )}
                                                Test Connection
                                            </button>
                                            <button 
                                                className="btn-primary"
                                                onClick={handleSaveProxmox}
                                                disabled={proxmoxSaving || JSON.stringify(proxmoxForm) === JSON.stringify(proxmoxOriginal)}
                                            >
                                                {proxmoxSaving ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <Save className="w-4 h-4" />
                                                )}
                                                Save Settings
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* VMware vSphere Card */}
                            <div className="card-elevated overflow-hidden">
                                <div className="bg-gradient-to-r from-green-500/10 to-lime-500/10 border-b border-theme px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg border border-theme">
                                            <VMwareIcon className="w-7 h-7" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-primary">VMware vSphere</h3>
                                            <p className="text-xs text-secondary">vCenter & ESXi Management</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        <div className="space-y-1.5 lg:col-span-2">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">vCenter / ESXi Host</label>
                                            <input type="text" className="input" placeholder="vcenter.example.com" 
                                                value={vsphereForm['vsphere_host'] || ''}
                                                onChange={(e) => setVsphereForm(prev => ({...prev, vsphere_host: e.target.value}))}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Port</label>
                                            <input type="text" className="input" placeholder="443" 
                                                value={vsphereForm['vsphere_port'] || '443'}
                                                onChange={(e) => setVsphereForm(prev => ({...prev, vsphere_port: e.target.value}))}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Username</label>
                                            <input type="text" className="input" placeholder="administrator@vsphere.local" 
                                                value={vsphereForm['vsphere_user'] || ''}
                                                onChange={(e) => setVsphereForm(prev => ({...prev, vsphere_user: e.target.value}))}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Password</label>
                                            <div className="relative">
                                                <input 
                                                    type={showVspherePassword ? "text" : "password"} 
                                                    className="input pr-10" 
                                                    placeholder="Enter password..." 
                                                    value={vsphereForm['vsphere_password'] || ''}
                                                    onChange={(e) => setVsphereForm(prev => ({...prev, vsphere_password: e.target.value}))}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowVspherePassword(!showVspherePassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                                                >
                                                    {showVspherePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>

                                        </div>

                                        {/* Sync Mode Configuration */}
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Sync Mode</label>
                                            <select 
                                                className="input w-full"
                                                value={vsphereForm['vsphere_sync_mode'] || 'manual'}
                                                onChange={(e) => setVsphereForm(prev => ({...prev, vsphere_sync_mode: e.target.value}))}
                                            >
                                                <option value="manual">Manual Only</option>
                                                <option value="scheduled">Scheduled</option>
                                            </select>
                                        </div>

                                        {vsphereForm['vsphere_sync_mode'] === 'scheduled' && (
                                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                                                <label className="text-xs font-medium text-secondary uppercase tracking-wider">Sync Interval</label>
                                                <select 
                                                    className="input w-full"
                                                    value={vsphereForm['vsphere_sync_interval'] || '60'}
                                                    onChange={(e) => setVsphereForm(prev => ({...prev, vsphere_sync_interval: e.target.value}))}
                                                >
                                                    <option value="15">Every 15 Minutes</option>
                                                    <option value="60">Every 1 Hour</option>
                                                    <option value="360">Every 6 Hours</option>
                                                    <option value="720">Every 12 Hours</option>
                                                    <option value="1440">Every 24 Hours</option>
                                                </select>
                                            </div>
                                        )}

                                        <div className="flex items-end">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className={`relative w-11 h-6 rounded-full transition-colors ${vsphereForm['vsphere_verify_ssl'] === 'true' ? 'bg-blue-600' : 'bg-gray-600'}`}
                                                    onClick={() => setVsphereForm(prev => ({...prev, vsphere_verify_ssl: prev['vsphere_verify_ssl'] === 'true' ? 'false' : 'true'}))}
                                                >
                                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${vsphereForm['vsphere_verify_ssl'] === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
                                                </div>
                                                <span className="text-sm text-secondary group-hover:text-primary transition-colors">Verify SSL</span>
                                            </label>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-6 pt-5 border-t border-theme flex items-center justify-between">
                                        <div className="flex items-center gap-4 text-sm text-secondary">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${vsphereConnected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                                <span>{vsphereConnected ? 'Connected' : 'Not connected'}</span>
                                            </div>
                                            {vsphereForm['vsphere_sync_mode'] === 'scheduled' && (
                                                <div className="flex items-center gap-1.5 text-xs bg-theme-hover px-2 py-1 rounded-md">
                                                    <RefreshCw className="w-3 h-3" />
                                                    <span>Auto-sync: {vsphereForm['vsphere_sync_interval'] ? `${parseInt(vsphereForm['vsphere_sync_interval']) / 60 < 1 ? `${vsphereForm['vsphere_sync_interval']}m` : `${parseInt(vsphereForm['vsphere_sync_interval']) / 60}h`}` : '1h'}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-3">
                                            <button 
                                                className="btn-secondary"
                                                disabled={syncingInventory}
                                                onClick={async () => {
                                                    setSyncingInventory(true);
                                                    try {
                                                        const res = await api.post('/infrastructure/vsphere/sync');
                                                        if (res.data.success) {
                                                            showToast(`Inventory synced!`, 'success');
                                                            const invRes = await api.get('/infrastructure/vsphere/inventory');
                                                            if (invRes.data.success) {
                                                                setVsphereInventory(invRes.data.data);
                                                            }
                                                        } else {
                                                            showToast(res.data.message || 'Sync failed', 'error');
                                                        }
                                                    } catch (e: any) {
                                                        showToast(e.response?.data?.detail || 'Sync failed', 'error');
                                                    } finally {
                                                        setSyncingInventory(false);
                                                    }
                                                }}
                                            >
                                                <RefreshCw className={`w-4 h-4 ${syncingInventory ? 'animate-spin' : ''}`} />
                                                Sync
                                            </button>
                                            <button 
                                                className="btn-secondary"
                                                onClick={async () => {
                                                    setInventoryModalOpen(true);
                                                    if (!vsphereInventory) {
                                                        try {
                                                            const res = await api.get('/infrastructure/vsphere/inventory');
                                                            if (res.data.success) {
                                                                setVsphereInventory(res.data.data);
                                                            }
                                                        } catch (e) {
                                                            // ignore
                                                        }
                                                    }
                                                }}
                                            >
                                                <List className="w-4 h-4" />
                                                View Inventory
                                            </button>
                                            <button 
                                                className="btn-secondary"
                                                onClick={async () => {
                                                    try {
                                                        const host = vsphereForm['vsphere_host'] || '';
                                                        const port = parseInt(vsphereForm['vsphere_port'] || '443');
                                                        const user = vsphereForm['vsphere_user'] || '';
                                                        const password = vsphereForm['vsphere_password'] || '';
                                                        const verify_ssl = vsphereForm['vsphere_verify_ssl'] === 'true';
                                                        
                                                        if (!host || !user) {
                                                            showToast('Host and user are required', 'warning');
                                                            return;
                                                        }
                                                        
                                                        setVsphereTesting(true);
                                                        const res = await api.post('/infrastructure/vsphere/test', { host, port, user, password, verify_ssl });
                                                        if (res.data.success) {
                                                            showToast(`✓ vSphere Connection Successful\n${res.data.message || 'Connected to ' + host}`, 'success');
                                                        } else {
                                                            showToast(`✗ vSphere Connection Failed\n${res.data.message || 'Unable to connect'}`, 'error');
                                                        }
                                                    } catch (e: any) {
                                                        showToast(`✗ vSphere Connection Failed\n${e.response?.data?.detail || 'Connection test failed'}`, 'error');
                                                    } finally {
                                                        setVsphereTesting(false);
                                                    }
                                                }}
                                            >
                                                {vsphereTesting ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <Globe className="w-4 h-4" />
                                                )}
                                                {vsphereTesting ? 'Testing...' : 'Test Connection'}
                                            </button>
                                            <button 
                                                className="btn-primary"
                                                disabled={vsphereSaving || (
                                                    vsphereForm['vsphere_host'] === vsphereOriginal['vsphere_host'] &&
                                                    vsphereForm['vsphere_port'] === vsphereOriginal['vsphere_port'] &&
                                                    vsphereForm['vsphere_user'] === vsphereOriginal['vsphere_user'] &&
                                                    vsphereForm['vsphere_password'] === vsphereOriginal['vsphere_password'] &&
                                                    vsphereForm['vsphere_verify_ssl'] === vsphereOriginal['vsphere_verify_ssl']
                                                )}
                                                onClick={async () => {
                                                    try {
                                                        setVsphereSaving(true);
                                                        const settings: Record<string, string> = {};
                                                        ['vsphere_host', 'vsphere_port', 'vsphere_user', 'vsphere_password', 'vsphere_verify_ssl'].forEach(key => {
                                                            const val = vsphereForm[key];
                                                            if (val !== undefined) settings[key] = val;
                                                        });
                                                        await api.post('/infrastructure/vsphere/save', { settings, category: 'vsphere' });
                                                        
                                                        // Update original to reflect saved state
                                                        setVsphereOriginal({...vsphereForm});
                                                        
                                                        // Refresh connection status after save
                                                        try {
                                                            const statusRes = await api.get('/infrastructure/vsphere/status');
                                                            setVsphereConnected(statusRes.data.connected);
                                                        } catch (e) {
                                                            setVsphereConnected(false);
                                                        }
                                                        
                                                        showToast('✓ vSphere Settings Saved Successfully\nCredentials have been stored securely', 'success');
                                                    } catch (e: any) {
                                                        showToast(`✗ Failed to Save vSphere Settings\n${e.response?.data?.detail || 'Please try again'}`, 'error');
                                                    } finally {
                                                        setVsphereSaving(false);
                                                    }
                                                }}
                                            >
                                                {vsphereSaving ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <Save className="w-4 h-4" />
                                                )}
                                                {vsphereSaving ? 'Saving...' : 'Save Settings'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* System Tab */}
                    {activeTab === 'system' && user?.role === 'admin' && (
                        <div className="space-y-6">
                            <SettingsSection title="Email (SMTP)" icon={Mail} color="purple" density={viewDensity}>
                                <div className="space-y-4">
                                    {systemSettings.filter(s => s.category === 'smtp').map(s => (
                                        <div key={s.key}>{renderSettingInput(s)}</div>
                                    ))}
                                    <div className="pt-4 flex justify-end">
                                        <button 
                                            onClick={() => setSmtpModalOpen(true)}
                                            className="btn-secondary"
                                        >
                                            <Send className="w-4 h-4 mr-2" />
                                            Test SMTP Settings
                                        </button>
                                    </div>
                                </div>
                            </SettingsSection>


                        </div>
                    )}
                </div>
            </div>

            {/* Modals remain unchanged ... */}
            {/* SMTP Modal */}
            <Modal isOpen={smtpModalOpen} onClose={() => setSmtpModalOpen(false)} title="Test SMTP Configuration">
                <div className="space-y-4">
                    {loadingSettings ? (
                        <div className="animate-pulse space-y-3">
                             <div className="h-10 rounded bg-secondary/20"></div>
                        </div>
                    ) : (
                        <>
                            <div className="pt-4 border-t border-theme space-y-3">
                                <div>
                                    <label className="input-label">Test Recipient</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="email" 
                                            className="input" 
                                            value={testRecipient} 
                                            onChange={(e) => setTestRecipient(e.target.value)}
                                            placeholder="Enter email to test..."
                                        />
                                        <button 
                                            onClick={handleTestEmail} 
                                            disabled={testEmailLoading || !testRecipient}
                                            className="btn-primary whitespace-nowrap"
                                        >
                                            {testEmailLoading ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <Send className="w-4 h-4" />
                                                    Send
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </Modal>

            {/* Change Password Modal */}
            <Modal isOpen={pwdModalOpen} onClose={() => setPwdModalOpen(false)} title="Change Password" maxWidth="sm">
                <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div>
                        <label className="input-label">Current Password</label>
                        <input 
                            type="password"
                            required
                            className="input"
                            value={pwdForm.current_password}
                            onChange={e => setPwdForm({...pwdForm, current_password: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="input-label">New Password</label>
                        <input 
                            type="password"
                            required
                            className="input"
                            value={pwdForm.new_password}
                            onChange={e => setPwdForm({...pwdForm, new_password: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="input-label">Confirm New Password</label>
                        <input 
                            type="password"
                            required
                            className="input"
                            value={pwdForm.confirm_password}
                            onChange={e => setPwdForm({...pwdForm, confirm_password: e.target.value})}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setPwdModalOpen(false)} className="btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" disabled={pwdLoading} className="btn-primary">
                            {pwdLoading ? 'Updating...' : 'Update Password'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* vSphere Inventory Modal */}
            <Modal isOpen={inventoryModalOpen} onClose={() => setInventoryModalOpen(false)} title="vSphere Inventory" maxWidth="3xl">
                <div className="space-y-4">
                    {!vsphereInventory ? (
                        <div className="p-8 text-center text-secondary border-2 border-dashed border-theme rounded-xl">
                            <Cloud className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>No inventory loaded.</p>
                            <p className="text-xs mt-1">Click "Sync" to fetch data from vSphere.</p>
                        </div>
                    ) : (
                        <div className="h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                            <div className="mb-4 text-xs text-secondary flex items-center gap-2">
                                <Check className="w-3 h-3 text-green-500" />
                                Last Synced: {new Date(vsphereInventory.last_sync).toLocaleString()}
                            </div>
                            
                            {/* Templates/VMs Section */}
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2 sticky top-0 bg-base-100 py-1 z-10">
                                    <Server className="w-4 h-4" />
                                    Templates & VMs ({vsphereInventory.vms?.length || 0})
                                </h3>
                                <div className="bg-base-200 rounded-lg border border-theme overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-base-300 text-xs uppercase text-secondary font-medium">
                                            <tr>
                                                <th className="px-4 py-2">Name</th>
                                                <th className="px-4 py-2">Type</th>
                                                <th className="px-4 py-2">OS</th>
                                                <th className="px-4 py-2 text-right">Specs</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-theme">
                                            {vsphereInventory.vms?.map((vm: any, i: number) => (
                                                <tr key={i} className="hover:bg-base-300/50 transition-colors">
                                                    <td className="px-4 py-2 font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${vm.power_state?.toString().toLowerCase().includes('on') ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                                            {vm.name}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        {vm.is_template ? (
                                                            <span className="badge badge-primary text-[10px]">Template</span>
                                                        ) : (
                                                            <span className="badge badge-neutral text-[10px]">VM</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-secondary text-xs">{vm.guest_os}</td>
                                                    <td className="px-4 py-2 text-secondary text-xs text-right">
                                                        {vm.cpu} vCPU, {Math.round(vm.memory_mb / 1024)} GB
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Networks Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2 sticky top-0 bg-base-100 py-1 z-10">
                                    <Globe className="w-4 h-4" />
                                    Networks ({vsphereInventory.networks?.length || 0})
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {vsphereInventory.networks?.map((net: any, i: number) => (
                                        <div key={i} className="bg-base-200 p-2.5 rounded border border-theme flex justify-between items-center hover:border-primary/50 transition-colors">
                                            <span className="font-medium text-xs truncate" title={net.name}>{net.name}</span>
                                            <span className="text-[10px] text-secondary bg-base-300 px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">{net.type}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end pt-4 border-t border-theme">
                        <button className="btn-secondary" onClick={() => setInventoryModalOpen(false)}>Close</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

interface ToggleOptionProps {
    title: string;
    description: string;
    enabled: boolean;
    onChange: (value: boolean) => void;
}

const ToggleOption: React.FC<ToggleOptionProps> = ({ title, description, enabled, onChange }) => (
    <div className="flex items-center justify-between p-4 rounded-xl border border-theme bg-secondary/10">
        <div>
            <h3 className="font-medium text-primary">{title}</h3>
            <p className="text-sm text-secondary">{description}</p>
        </div>
        <button 
            onClick={() => onChange(!enabled)}
            className={`relative w-14 h-8 rounded-full p-1 transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
        >
            <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform flex items-center justify-center ${enabled ? 'translate-x-6' : 'translate-x-0'}`}>
                {enabled && <Check className="w-3 h-3 text-blue-600" />}
            </div>
        </button>
    </div>
);

export default Settings;
