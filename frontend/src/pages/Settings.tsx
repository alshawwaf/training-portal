import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api';
import { User, Shield, Bell, Palette, ChevronRight, Check, Server, Lock, Mail, Send } from 'lucide-react';
import Modal from '../components/Modal';

interface SystemSetting {
    key: string;
    value: string;
    category: string;
    description: string;
    is_secret: boolean;
}

const Settings: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { darkMode, toggleDarkMode } = useTheme();
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [browserNotifications, setBrowserNotifications] = useState(false);
    
    // System Settings State
    const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [testEmailLoading, setTestEmailLoading] = useState(false);
    const [testRecipient, setTestRecipient] = useState('');
    
    // Password Change State
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [pwdLoading, setPwdLoading] = useState(false);



    const [smtpModalOpen, setSmtpModalOpen] = useState(false);

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
            setSystemSettings(res.data);
        } catch (e) {
            console.error(e);
            showToast('Failed to load settings', 'error');
        } finally {
            setLoadingSettings(false);
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

    const handleToggleDarkMode = (newValue: boolean) => {
        toggleDarkMode();
        showToast(`${newValue ? 'Dark' : 'Light'} mode enabled`, 'success');
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

    const renderSettingInput = (setting: SystemSetting) => {
        if (setting.key.endsWith('_tls') || setting.key.endsWith('_ssl')) {
             const isChecked = setting.value === 'true';
             return (
                 <div className="flex items-center justify-between py-2">
                     <label className="text-secondary text-sm">{setting.description}</label>
                     <button 
                        onClick={() => handleUpdateSetting(setting.key, isChecked ? 'false' : 'true')}
                        className={`relative w-12 h-6 rounded-full p-1 transition-colors ${isChecked ? 'bg-blue-600' : 'bg-gray-600'}`}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isChecked ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                 </div>
             );
        }

        return (
            <div className="space-y-1">
                <label className="input-label text-xs uppercase tracking-wider">{setting.description || setting.key}</label>
                <input 
                    type={setting.is_secret ? "password" : "text"}
                    className="input"
                    defaultValue={setting.value}
                    onBlur={(e) => {
                        if (e.target.value !== setting.value && e.target.value !== '********') {
                            handleUpdateSetting(setting.key, e.target.value);
                        }
                    }}
                    placeholder={setting.is_secret ? "••••••••" : ""}
                />
            </div>
        );
    };

    const sections = [
        {
            title: 'Profile',
            icon: User,
            color: 'blue',
            content: (
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-primary">
                                {user?.name}
                            </h3>
                            <p className="text-secondary">{user?.email}</p>
                            <span className="badge badge-info mt-2 inline-block capitalize">{user?.role}</span>
                        </div>
                    </div>
                </div>
            )
        },
        {
            title: 'System Configuration',
            icon: Server,
            color: 'indigo',
            show: user?.role === 'admin',
            content: (
                <div className="space-y-4">
                    {loadingSettings ? (
                        <div className="animate-pulse space-y-3">
                            <div className="h-10 rounded bg-secondary/20"></div>
                            <div className="h-10 rounded bg-secondary/20"></div>
                        </div>
                    ) : systemSettings.length > 0 ? (
                        <div className="space-y-4">
                             {systemSettings.filter(s => s.category !== 'smtp').map(setting => (
                                <div key={setting.key}>
                                    {renderSettingInput(setting)}
                                </div>
                             ))}
                             {systemSettings.filter(s => s.category !== 'smtp').length === 0 && (
                                 <p className="text-secondary">No general settings available.</p>
                             )}
                        </div>
                    ) : (
                        <p className="text-secondary">No settings available.</p>
                    )}
                </div>
            )
        },
        {
            title: 'SMTP Configuration',
            icon: Mail,
            color: 'rose',
            show: user?.role === 'admin',
            content: (
                <div className="space-y-4">
                    <p className="text-secondary">Configure your outgoing email server settings.</p>
                    <button 
                        onClick={() => setSmtpModalOpen(true)}
                        className="btn-secondary w-full justify-between group flex items-center"
                    >
                        <span className="flex items-center gap-2 text-primary">
                            <Mail className="w-4 h-4 text-secondary group-hover:text-primary transition-colors" />
                            Configure SMTP Server
                        </span>
                        <ChevronRight className="w-4 h-4 text-secondary group-hover:text-primary transition-colors" />
                    </button>
                </div>
            )
        },
        {
            title: 'Notifications',
            icon: Bell,
            color: 'amber',
            content: (
                <div className="space-y-4">
                    <ToggleOption 
                        title="Email Notifications"
                        description="Receive email alerts for class updates"
                        enabled={emailNotifications}
                        onChange={(val) => {
                            setEmailNotifications(val);
                            handleUpdatePreferences(val, undefined);
                        }}
                    />
                    <ToggleOption 
                        title="Browser Notifications"
                        description="Show desktop notifications"
                        enabled={browserNotifications}
                        onChange={(val) => {
                            setBrowserNotifications(val);
                            handleUpdatePreferences(undefined, val);
                        }}
                    />
                </div>
            )
        },
        {
            title: 'Appearance',
            icon: Palette,
            color: 'purple',
            content: (
                <div className="space-y-4">
                    <ToggleOption 
                        title="Dark Mode"
                        description="Use dark theme for the interface"
                        enabled={darkMode}
                        onChange={handleToggleDarkMode}
                    />
                    <p className="text-xs italic text-secondary">
                        Theme preference is saved locally in your browser.
                    </p>
                </div>
            )
        },
        {
            title: 'Security',
            icon: Shield,
            color: 'emerald',
            content: (
                <div className="space-y-4">
                    <button onClick={() => setPwdModalOpen(true)} className="btn-secondary w-full justify-between group flex items-center">
                        <span className="flex items-center gap-2 text-primary">
                             <Lock className="w-4 h-4 text-secondary group-hover:text-primary transition-colors" />
                             Change Password
                        </span>
                        <ChevronRight className="w-4 h-4 text-secondary group-hover:text-primary transition-colors" />
                    </button>
                    <button className="btn-secondary w-full justify-between opacity-50 cursor-not-allowed flex items-center" title="Available in Enterprise Edition">
                        <span className="text-primary">Two-Factor Authentication</span>
                        <span className="text-xs px-2 py-1 rounded bg-secondary/30">
                            Coming Soon
                        </span>
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-primary">Settings</h1>
                <p className="mt-1 text-secondary">
                    Manage your account preferences and system configuration
                </p>
            </div>
            
            <div className="space-y-6">
                {sections.filter(s => s.show !== false).map((section) => (
                    <div key={section.title} className="card-elevated overflow-hidden">
                        <div className={`flex items-center gap-3 p-5 border-b border-theme bg-${section.color}-500/5`}>
                            <div className={`p-2 bg-${section.color}-500/10 rounded-lg`}>
                                <section.icon className={`w-5 h-5 text-${section.color}-400`} />
                            </div>
                            <h2 className="text-lg font-semibold text-primary">
                                {section.title}
                            </h2>
                        </div>
                        <div className="p-5">
                            {section.content}
                        </div>
                    </div>
                ))}
            </div>

            {/* SMTP Modal */}
            <Modal isOpen={smtpModalOpen} onClose={() => setSmtpModalOpen(false)} title="SMTP Configuration">
                <div className="space-y-4">
                    {loadingSettings ? (
                        <div className="animate-pulse space-y-3">
                             <div className="h-10 rounded bg-secondary/20"></div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-4">
                                {systemSettings.filter(s => s.category === 'smtp').map(setting => (
                                    <div key={setting.key}>
                                        {renderSettingInput(setting)}
                                    </div>
                                ))}
                            </div>
                            

                            
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
