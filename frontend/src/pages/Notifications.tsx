import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { Bell, Mail, Globe, Send, Check, ChevronRight, Eye, EyeOff, Settings, Smartphone } from 'lucide-react';
import Modal from '../components/Modal';

interface NotificationChannel {
    id: string;
    title: string;
    description: string;
    icon: any;
    color: string;
    enabled?: boolean;
}

const Notifications: React.FC = () => {
    const { user, isLoading } = useAuth();
    const { showToast } = useToast();
    
    // Notification preferences
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [browserNotifications, setBrowserNotifications] = useState(false);
    
    // SMTP Modal State
    const [smtpModalOpen, setSmtpModalOpen] = useState(false);
    const [smtpForm, setSmtpForm] = useState({
        smtp_server: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_password: '',
        smtp_from: '',
        smtp_tls: 'true'
    });
    const [smtpSaving, setSmtpSaving] = useState(false);
    const [showSmtpPassword, setShowSmtpPassword] = useState(false);
    const [testEmailLoading, setTestEmailLoading] = useState(false);
    const [testRecipient, setTestRecipient] = useState('');

    // Browser Notifications Modal
    const [browserModalOpen, setBrowserModalOpen] = useState(false);

    // Email Preferences Modal
    const [emailModalOpen, setEmailModalOpen] = useState(false);

    useEffect(() => {
        if (user) {
            setTestRecipient(user.email || '');
            fetchPreferences();
            fetchSmtpSettings();
        }
    }, [user]);

    const fetchPreferences = async () => {
        try {
            const res = await api.get('/preferences/');
            setEmailNotifications(res.data.email_notifications);
            setBrowserNotifications(res.data.browser_notifications);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchSmtpSettings = async () => {
        try {
            const res = await api.get('/settings/');
            const settings = Array.isArray(res.data) ? res.data : [];
            const smtp: Record<string, string> = {};
            settings.forEach((s: any) => {
                if (s.key.startsWith('smtp_')) {
                    smtp[s.key] = s.value;
                }
            });
            setSmtpForm(prev => ({
                ...prev,
                ...smtp
            }));
        } catch (e) {
            console.error(e);
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
            showToast('Failed to update preferences', 'error');
        }
    };

    const handleSaveSmtp = async () => {
        setSmtpSaving(true);
        try {
            const promises = Object.entries(smtpForm).map(([key, value]) => {
                return api.put(`/settings/${key}`, { value });
            });
            await Promise.all(promises);
            showToast('SMTP settings saved', 'success');
            setSmtpModalOpen(false);
        } catch (e) {
            showToast('Failed to save SMTP settings', 'error');
        } finally {
            setSmtpSaving(false);
        }
    };

    const handleTestEmail = async () => {
        setTestEmailLoading(true);
        try {
            await api.post('/email/test', {
                to: [testRecipient || user?.email],
                subject: "SMTP Configuration Test",
                message: "If you are reading this, your SMTP configuration is working correctly!"
            });
            showToast('Test email sent successfully!', 'success');
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to send test email', 'error');
        } finally {
            setTestEmailLoading(false);
        }
    };

    const handleEnableBrowserNotifications = async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            setBrowserNotifications(true);
            handleUpdatePreferences(undefined, true);
            localStorage.setItem('browser_notifications', 'true');
            new Notification("Notifications Enabled", { body: "You will now receive desktop notifications." });
            setBrowserModalOpen(false);
        } else {
            showToast('Permission denied. Please enable notifications in your browser settings.', 'error');
        }
    };

    const notificationChannels: NotificationChannel[] = [
        {
            id: 'email',
            title: 'Email Notifications',
            description: 'Receive alerts for class updates via email',
            icon: Mail,
            color: 'blue',
            enabled: emailNotifications
        },
        {
            id: 'browser',
            title: 'Browser Notifications',
            description: 'Get desktop push notifications',
            icon: Globe,
            color: 'purple',
            enabled: browserNotifications
        },
        {
            id: 'smtp',
            title: 'SMTP Configuration',
            description: 'Configure email server settings',
            icon: Settings,
            color: 'emerald'
        }
    ];

    const handleCardClick = (channel: NotificationChannel) => {
        switch (channel.id) {
            case 'email':
                setEmailModalOpen(true);
                break;
            case 'browser':
                setBrowserModalOpen(true);
                break;
            case 'smtp':
                setSmtpModalOpen(true);
                break;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!user) {
        window.location.href = '/login';
        return null;
    }

    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary">Notifications</h1>
                <p className="mt-1 text-secondary">Configure how you receive alerts and updates</p>
            </div>

            {/* Notification Channel Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {notificationChannels.map(channel => (
                    <div 
                        key={channel.id}
                        onClick={() => handleCardClick(channel)}
                        className="card hover:border-blue-500/50 cursor-pointer group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 relative overflow-hidden"
                    >
                        <div className={`absolute top-0 right-0 w-20 h-20 bg-${channel.color}-500/10 rounded-bl-full -mr-3 -mt-3 transition-transform group-hover:scale-110`} />
                        
                        <div className="flex items-start justify-between mb-4 relative z-10">
                            <div className={`p-3 rounded-xl bg-${channel.color}-500/10 text-${channel.color}-500`}>
                                <channel.icon className="w-6 h-6" />
                            </div>
                            {channel.enabled !== undefined && (
                                <div className={`badge ${channel.enabled ? 'badge-success' : 'badge-secondary'} flex items-center gap-1`}>
                                    {channel.enabled ? <Check className="w-3 h-3" /> : null}
                                    {channel.enabled ? 'Enabled' : 'Disabled'}
                                </div>
                            )}
                        </div>
                        
                        <h3 className="text-lg font-bold text-primary mb-1">{channel.title}</h3>
                        <p className="text-sm text-secondary">{channel.description}</p>
                        
                        <div className="mt-4 flex items-center text-blue-500 font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            Configure
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Email Notifications Modal */}
            <Modal
                isOpen={emailModalOpen}
                onClose={() => setEmailModalOpen(false)}
                title="Email Notifications"
                maxWidth="sm"
            >
                <div className="space-y-5">
                    <div className="flex items-center justify-between p-4 bg-secondary/10 rounded-xl">
                        <div>
                            <p className="font-medium text-primary">Email Alerts</p>
                            <p className="text-sm text-secondary">Receive email notifications for class updates</p>
                        </div>
                        <button 
                            onClick={() => {
                                const newVal = !emailNotifications;
                                setEmailNotifications(newVal);
                                handleUpdatePreferences(newVal, undefined);
                            }}
                            className={`relative w-12 h-6 rounded-full p-1 transition-colors ${emailNotifications ? 'bg-blue-600' : 'bg-gray-600'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${emailNotifications ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={() => setEmailModalOpen(false)} className="btn-primary">
                            Done
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Browser Notifications Modal */}
            <Modal
                isOpen={browserModalOpen}
                onClose={() => setBrowserModalOpen(false)}
                title="Browser Notifications"
                maxWidth="sm"
            >
                <div className="space-y-5">
                    <div className="flex items-center justify-between p-4 bg-secondary/10 rounded-xl">
                        <div>
                            <p className="font-medium text-primary">Desktop Notifications</p>
                            <p className="text-sm text-secondary">Show push notifications on your desktop</p>
                        </div>
                        <button 
                            onClick={async () => {
                                if (!browserNotifications) {
                                    await handleEnableBrowserNotifications();
                                } else {
                                    setBrowserNotifications(false);
                                    handleUpdatePreferences(undefined, false);
                                    localStorage.setItem('browser_notifications', 'false');
                                }
                            }}
                            className={`relative w-12 h-6 rounded-full p-1 transition-colors ${browserNotifications ? 'bg-blue-600' : 'bg-gray-600'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${browserNotifications ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    {!browserNotifications && (
                        <p className="text-sm text-secondary text-center">
                            Click the toggle to enable browser notifications. You may need to grant permission.
                        </p>
                    )}
                    <div className="flex justify-end">
                        <button onClick={() => setBrowserModalOpen(false)} className="btn-primary">
                            Done
                        </button>
                    </div>
                </div>
            </Modal>

            {/* SMTP Configuration Modal */}
            <Modal
                isOpen={smtpModalOpen}
                onClose={() => setSmtpModalOpen(false)}
                title="SMTP Configuration"
                maxWidth="lg"
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">SMTP Server</label>
                            <input 
                                type="text" 
                                className="input" 
                                placeholder="smtp.example.com"
                                value={smtpForm.smtp_server}
                                onChange={(e) => setSmtpForm(prev => ({...prev, smtp_server: e.target.value}))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">SMTP Port</label>
                            <input 
                                type="text" 
                                className="input" 
                                placeholder="587"
                                value={smtpForm.smtp_port}
                                onChange={(e) => setSmtpForm(prev => ({...prev, smtp_port: e.target.value}))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Username</label>
                            <input 
                                type="text" 
                                className="input" 
                                placeholder="user@example.com"
                                value={smtpForm.smtp_user}
                                onChange={(e) => setSmtpForm(prev => ({...prev, smtp_user: e.target.value}))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">Password</label>
                            <div className="relative">
                                <input 
                                    type={showSmtpPassword ? "text" : "password"}
                                    className="input pr-10" 
                                    placeholder="••••••••"
                                    value={smtpForm.smtp_password}
                                    onChange={(e) => setSmtpForm(prev => ({...prev, smtp_password: e.target.value}))}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                                >
                                    {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">From Address</label>
                            <input 
                                type="email" 
                                className="input" 
                                placeholder="noreply@example.com"
                                value={smtpForm.smtp_from}
                                onChange={(e) => setSmtpForm(prev => ({...prev, smtp_from: e.target.value}))}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setSmtpForm(prev => ({...prev, smtp_tls: prev.smtp_tls === 'true' ? 'false' : 'true'}))}
                                className={`relative w-11 h-6 rounded-full transition-colors ${smtpForm.smtp_tls === 'true' ? 'bg-blue-600' : 'bg-gray-600'}`}
                            >
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${smtpForm.smtp_tls === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                            <span className="text-sm text-secondary">Use TLS</span>
                        </div>
                    </div>

                    {/* Test Email Section */}
                    <div className="border-t border-theme pt-5">
                        <p className="text-sm font-medium text-primary mb-3">Test Configuration</p>
                        <div className="flex gap-3">
                            <input 
                                type="email" 
                                className="input flex-1" 
                                placeholder="Enter test recipient email"
                                value={testRecipient}
                                onChange={(e) => setTestRecipient(e.target.value)}
                            />
                            <button 
                                onClick={handleTestEmail}
                                disabled={testEmailLoading}
                                className="btn-secondary shrink-0"
                            >
                                {testEmailLoading ? (
                                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                                Send Test
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-theme">
                        <button onClick={() => setSmtpModalOpen(false)} className="btn-secondary">
                            Cancel
                        </button>
                        <button 
                            onClick={handleSaveSmtp}
                            disabled={smtpSaving}
                            className="btn-primary"
                        >
                            {smtpSaving ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Save Settings'
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Notifications;
