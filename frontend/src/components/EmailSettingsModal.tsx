import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { 
    Server, 
    Mail, 
    Lock, 
    Eye, 
    EyeOff, 
    Send, 
    RefreshCw, 
    Check, 
    AlertCircle,
    Shield,
    Bell,
    Hash
} from 'lucide-react';
import clsx from 'clsx';

interface EmailSettings {
    smtp_server: string;
    smtp_port: number;
    smtp_from: string;
    smtp_to: string;
    smtp_ssl: boolean;
    smtp_starttls: boolean;
    smtp_use_auth: boolean;
    smtp_username: string;
    smtp_password: string;
}

interface NotificationEvent {
    id: number;
    event_type: string;
    name: string;
    description: string;
    email_enabled: boolean;
}

interface EmailSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const EmailSettingsModal: React.FC<EmailSettingsModalProps> = ({ isOpen, onClose }) => {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'server' | 'events'>('server');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testRecipient, setTestRecipient] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);

    const [settings, setSettings] = useState<EmailSettings>({
        smtp_server: '10.1.2.250',
        smtp_port: 25,
        smtp_from: 'info@americas-ses.com',
        smtp_to: 'admin@americas-ses.com',
        smtp_ssl: false,
        smtp_starttls: false,
        smtp_use_auth: false,
        smtp_username: '',
        smtp_password: ''
    });

    const [events, setEvents] = useState<NotificationEvent[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchSettings();
            fetchEvents();
            checkStatus();
        }
    }, [isOpen]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await api.get('/email/settings');
            const data = res.data;
            setSettings({
                smtp_server: data.smtp_server || '10.1.2.250',
                smtp_port: parseInt(data.smtp_port) || 25,
                smtp_from: data.smtp_from || 'info@americas-ses.com',
                smtp_to: data.smtp_to || 'admin@americas-ses.com',
                smtp_ssl: data.smtp_ssl === 'true',
                smtp_starttls: data.smtp_starttls === 'true',
                smtp_use_auth: data.smtp_use_auth === 'true',
                smtp_username: data.smtp_username || '',
                smtp_password: ''
            });
            setTestRecipient(data.smtp_to || data.smtp_from || '');
        } catch (e) {
            console.error('Failed to fetch email settings:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchEvents = async () => {
        try {
            const res = await api.get('/notification-events/');
            setEvents(res.data);
        } catch (e) {
            console.error('Failed to fetch notification events:', e);
        }
    };

    const checkStatus = async () => {
        try {
            const res = await api.get('/email/status');
            setIsConfigured(res.data.configured);
        } catch (e) {
            setIsConfigured(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/email/settings', settings);
            showToast('Email settings saved successfully', 'success');
            checkStatus();
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to save settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTestEmail = async () => {
        if (!testRecipient) {
            showToast('Please enter a recipient email', 'error');
            return;
        }
        setTesting(true);
        try {
            const res = await api.post('/email/test', {
                to: [testRecipient],
                subject: 'SE Training Portal - SMTP Configuration Test',
                message: 'This is a test email to verify your SMTP configuration is working correctly. If you receive this message, your email settings are properly configured.'
            });
            if (res.data.success) {
                showToast(res.data.message, 'success');
            } else {
                showToast(res.data.message || 'Test failed', 'error');
            }
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to send test email', 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleToggleEvent = async (eventType: string, enabled: boolean) => {
        try {
            await api.put(`/notification-events/${eventType}`, { email_enabled: enabled });
            setEvents(prev => prev.map(e => 
                e.event_type === eventType ? { ...e, email_enabled: enabled } : e
            ));
            showToast(`Notification ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } catch (e) {
            showToast('Failed to update notification setting', 'error');
        }
    };

    const tabs = [
        { id: 'server', label: 'Server Configuration', icon: Server },
        { id: 'events', label: 'Notification Events', icon: Bell }
    ] as const;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Email Configuration" 
            maxWidth="2xl"
        >
            <div className="min-h-[500px]">
                {/* Status Badge */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-theme">
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "p-2 rounded-lg",
                            isConfigured ? "bg-emerald-500/10" : "bg-amber-500/10"
                        )}>
                            {isConfigured ? (
                                <Check className="w-5 h-5 text-emerald-500" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-amber-500" />
                            )}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-primary">
                                {isConfigured ? 'Email Service Active' : 'Configuration Required'}
                            </p>
                            <p className="text-xs text-secondary">
                                {isConfigured 
                                    ? 'SMTP relay is configured and ready to send emails'
                                    : 'Complete the configuration below to enable email notifications'
                                }
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                                activeTab === tab.id
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                                    : "bg-secondary/10 text-secondary hover:bg-secondary/20 hover:text-primary"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Server Configuration Tab */}
                        {activeTab === 'server' && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                {/* SMTP Server Section */}
                                <div className="p-5 bg-secondary/5 rounded-2xl border border-theme space-y-4">
                                    <div className="flex items-center gap-2 text-primary mb-4">
                                        <Server className="w-4 h-4 text-blue-500" />
                                        <span className="text-xs font-black uppercase tracking-widest">SMTP Server</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className="text-xs font-bold text-secondary uppercase tracking-wider">Server Address</label>
                                            <input 
                                                type="text"
                                                value={settings.smtp_server}
                                                onChange={e => setSettings({...settings, smtp_server: e.target.value})}
                                                placeholder="smtp.example.com or IP address"
                                                className="w-full px-4 py-3 bg-white dark:bg-black/40 border border-theme rounded-xl text-primary placeholder:text-secondary/40 focus:border-blue-500/50 outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-1">
                                                <Hash className="w-3 h-3" /> Port
                                            </label>
                                            <input 
                                                type="number"
                                                value={settings.smtp_port}
                                                onChange={e => setSettings({...settings, smtp_port: parseInt(e.target.value) || 25})}
                                                placeholder="25"
                                                className="w-full px-4 py-3 bg-white dark:bg-black/40 border border-theme rounded-xl text-primary placeholder:text-secondary/40 focus:border-blue-500/50 outline-none transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-1">
                                                <Mail className="w-3 h-3" /> From Address
                                            </label>
                                            <input 
                                                type="email"
                                                value={settings.smtp_from}
                                                onChange={e => setSettings({...settings, smtp_from: e.target.value})}
                                                placeholder="noreply@example.com"
                                                className="w-full px-4 py-3 bg-white dark:bg-black/40 border border-theme rounded-xl text-primary placeholder:text-secondary/40 focus:border-blue-500/50 outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-1">
                                                <Mail className="w-3 h-3" /> Admin Recipient
                                            </label>
                                            <input 
                                                type="email"
                                                value={settings.smtp_to}
                                                onChange={e => setSettings({...settings, smtp_to: e.target.value})}
                                                placeholder="admin@example.com"
                                                className="w-full px-4 py-3 bg-white dark:bg-black/40 border border-theme rounded-xl text-primary placeholder:text-secondary/40 focus:border-blue-500/50 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Security Section */}
                                <div className="p-5 bg-secondary/5 rounded-2xl border border-theme space-y-4">
                                    <div className="flex items-center gap-2 text-primary mb-4">
                                        <Shield className="w-4 h-4 text-purple-500" />
                                        <span className="text-xs font-black uppercase tracking-widest">Security Options</span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <ToggleOption
                                            label="SSL/TLS"
                                            description="Direct SSL connection"
                                            enabled={settings.smtp_ssl}
                                            onChange={v => setSettings({...settings, smtp_ssl: v})}
                                        />
                                        <ToggleOption
                                            label="STARTTLS"
                                            description="Upgrade to TLS"
                                            enabled={settings.smtp_starttls}
                                            onChange={v => setSettings({...settings, smtp_starttls: v})}
                                        />
                                        <ToggleOption
                                            label="Authentication"
                                            description="Require login"
                                            enabled={settings.smtp_use_auth}
                                            onChange={v => setSettings({...settings, smtp_use_auth: v})}
                                        />
                                    </div>

                                    {/* Auth Credentials - Only shown when auth is enabled */}
                                    {settings.smtp_use_auth && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-theme/50 animate-in slide-in-from-top-2 duration-200">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-secondary uppercase tracking-wider">Username</label>
                                                <input 
                                                    type="text"
                                                    value={settings.smtp_username}
                                                    onChange={e => setSettings({...settings, smtp_username: e.target.value})}
                                                    placeholder="user@example.com"
                                                    className="w-full px-4 py-3 bg-white dark:bg-black/40 border border-theme rounded-xl text-primary placeholder:text-secondary/40 focus:border-purple-500/50 outline-none transition-all"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-secondary uppercase tracking-wider">Password</label>
                                                <div className="relative">
                                                    <input 
                                                        type={showPassword ? "text" : "password"}
                                                        value={settings.smtp_password}
                                                        onChange={e => setSettings({...settings, smtp_password: e.target.value})}
                                                        placeholder="••••••••"
                                                        className="w-full px-4 py-3 pr-12 bg-white dark:bg-black/40 border border-theme rounded-xl text-primary placeholder:text-secondary/40 focus:border-purple-500/50 outline-none transition-all"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                                                    >
                                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Test Email Section */}
                                <div className="p-5 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-2xl border border-theme space-y-4">
                                    <div className="flex items-center gap-2 text-primary mb-2">
                                        <Send className="w-4 h-4 text-blue-500" />
                                        <span className="text-xs font-black uppercase tracking-widest">Test Configuration</span>
                                    </div>
                                    <p className="text-xs text-secondary">
                                        Send a test email to verify your SMTP configuration is working correctly.
                                    </p>
                                    <div className="flex gap-3">
                                        <input 
                                            type="email"
                                            value={testRecipient}
                                            onChange={e => setTestRecipient(e.target.value)}
                                            placeholder="test@example.com"
                                            className="flex-1 px-4 py-3 bg-white dark:bg-black/40 border border-theme rounded-xl text-primary placeholder:text-secondary/40 focus:border-blue-500/50 outline-none transition-all"
                                        />
                                        <button
                                            onClick={handleTestEmail}
                                            disabled={testing || !testRecipient}
                                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                                        >
                                            {testing ? (
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Send className="w-4 h-4" />
                                            )}
                                            Send Test
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Notification Events Tab */}
                        {activeTab === 'events' && (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <p className="text-sm text-secondary mb-4">
                                    Select which system events should trigger email notifications. Disabled events will be logged but won't send emails.
                                </p>
                                
                                <div className="space-y-3">
                                    {events.map(event => (
                                        <div 
                                            key={event.event_type}
                                            className="flex items-center justify-between p-4 bg-secondary/5 rounded-xl border border-theme hover:border-blue-500/30 transition-all"
                                        >
                                            <div className="flex-1">
                                                <h4 className="font-bold text-primary text-sm">{event.name}</h4>
                                                <p className="text-xs text-secondary">{event.description}</p>
                                            </div>
                                            <button
                                                onClick={() => handleToggleEvent(event.event_type, !event.email_enabled)}
                                                className={clsx(
                                                    "relative w-12 h-6 rounded-full transition-all duration-300 flex items-center px-1",
                                                    event.email_enabled 
                                                        ? "bg-emerald-500" 
                                                        : "bg-gray-400 dark:bg-gray-600"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300",
                                                    event.email_enabled ? "translate-x-6" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {events.length === 0 && (
                                    <div className="text-center py-12 text-secondary">
                                        <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                        <p className="font-medium">No notification events configured</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-theme">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 bg-secondary/10 hover:bg-secondary/20 text-primary rounded-xl font-bold text-sm transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                        {saving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
                        Save Configuration
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// Toggle Option Component
const ToggleOption: React.FC<{
    label: string;
    description: string;
    enabled: boolean;
    onChange: (value: boolean) => void;
}> = ({ label, description, enabled, onChange }) => (
    <div 
        onClick={() => onChange(!enabled)}
        className={clsx(
            "p-4 rounded-xl border cursor-pointer transition-all",
            enabled 
                ? "bg-emerald-500/10 border-emerald-500/30" 
                : "bg-secondary/10 border-theme hover:border-theme/80"
        )}
    >
        <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-bold text-primary">{label}</span>
            <div className={clsx(
                "w-3 h-3 rounded-full transition-colors",
                enabled ? "bg-emerald-500" : "bg-gray-400"
            )} />
        </div>
        <p className="text-[10px] text-secondary">{description}</p>
    </div>
);

export default EmailSettingsModal;
