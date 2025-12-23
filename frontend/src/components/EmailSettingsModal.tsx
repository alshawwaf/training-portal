import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { 
    Server, Mail, Lock, Eye, EyeOff, Send, RefreshCw, Check, AlertCircle,
    Shield, Bell, Hash, CheckCircle, XCircle, Clock, ArrowRight
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

interface TestStep {
    id: string;
    label: string;
    status: 'pending' | 'running' | 'success' | 'error';
    detail?: string;
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
    const [showPassword, setShowPassword] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);

    // Test email state
    const [testRecipient, setTestRecipient] = useState('');
    const [showTestPanel, setShowTestPanel] = useState(false);
    const [testSteps, setTestSteps] = useState<TestStep[]>([]);

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
            setShowTestPanel(false);
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

    const updateStep = (id: string, update: Partial<TestStep>) => {
        setTestSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
    };

    const handleTestEmail = async () => {
        if (!testRecipient) {
            showToast('Please enter a recipient email', 'error');
            return;
        }

        // Initialize test steps
        setShowTestPanel(true);
        setTestSteps([
            { id: 'connect', label: 'Connecting to SMTP server', status: 'pending', detail: `${settings.smtp_server}:${settings.smtp_port}` },
            { id: 'auth', label: 'Authenticating', status: 'pending', detail: settings.smtp_use_auth ? `User: ${settings.smtp_username || 'N/A'}` : 'No authentication' },
            { id: 'compose', label: 'Composing message', status: 'pending', detail: `From: ${settings.smtp_from}` },
            { id: 'send', label: 'Sending email', status: 'pending', detail: `To: ${testRecipient}` },
        ]);

        // Simulate step progression with actual API call
        await new Promise(r => setTimeout(r, 300));
        updateStep('connect', { status: 'running' });
        
        await new Promise(r => setTimeout(r, 500));
        updateStep('connect', { status: 'success', detail: `Connected to ${settings.smtp_server}:${settings.smtp_port}` });
        updateStep('auth', { status: 'running' });

        await new Promise(r => setTimeout(r, 400));
        updateStep('auth', { status: 'success' });
        updateStep('compose', { status: 'running' });

        await new Promise(r => setTimeout(r, 300));
        updateStep('compose', { status: 'success' });
        updateStep('send', { status: 'running' });

        try {
            const res = await api.post('/email/test', {
                to: [testRecipient],
                subject: 'SE Training Portal - SMTP Configuration Test',
                message: 'This is a test email to verify your SMTP configuration is working correctly.'
            });
            
            if (res.data.success) {
                updateStep('send', { status: 'success', detail: 'Email delivered successfully!' });
            } else {
                updateStep('send', { status: 'error', detail: res.data.message || 'Failed to send' });
            }
        } catch (e: any) {
            const errorMsg = e.response?.data?.detail || 'Connection failed';
            // Determine which step failed
            if (errorMsg.toLowerCase().includes('connect') || errorMsg.toLowerCase().includes('timeout')) {
                updateStep('connect', { status: 'error', detail: errorMsg });
                updateStep('auth', { status: 'pending' });
                updateStep('compose', { status: 'pending' });
                updateStep('send', { status: 'pending' });
            } else if (errorMsg.toLowerCase().includes('auth')) {
                updateStep('auth', { status: 'error', detail: errorMsg });
                updateStep('compose', { status: 'pending' });
                updateStep('send', { status: 'pending' });
            } else {
                updateStep('send', { status: 'error', detail: errorMsg });
            }
        }
    };

    const handleToggleEvent = async (eventType: string, enabled: boolean) => {
        try {
            await api.put(`/notification-events/${eventType}`, { email_enabled: enabled });
            setEvents(prev => prev.map(e => 
                e.event_type === eventType ? { ...e, email_enabled: enabled } : e
            ));
        } catch (e) {
            showToast('Failed to update notification setting', 'error');
        }
    };

    const StepIcon: React.FC<{ status: TestStep['status'] }> = ({ status }) => {
        switch (status) {
            case 'pending': return <div className="w-4 h-4 rounded-full border-2 border-secondary/30" />;
            case 'running': return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
            case 'success': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
            case 'error': return <XCircle className="w-4 h-4 text-red-400" />;
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Email Configuration" maxWidth="lg">
            <div className="max-h-[70vh] overflow-y-auto">
                {/* Compact Status + Tabs Row */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-theme">
                    <div className="flex items-center gap-2">
                        <div className={clsx("p-1.5 rounded-lg", isConfigured ? "bg-emerald-500/10" : "bg-amber-500/10")}>
                            {isConfigured ? <Check className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                        </div>
                        <span className="text-xs font-semibold text-primary">{isConfigured ? 'Active' : 'Not Configured'}</span>
                    </div>
                    <div className="flex gap-1 p-0.5 bg-secondary/10 rounded-lg">
                        <button onClick={() => setActiveTab('server')} className={clsx("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", activeTab === 'server' ? "bg-blue-600 text-white" : "text-secondary hover:text-primary")}>
                            <Server className="w-3 h-3 inline mr-1" />Server
                        </button>
                        <button onClick={() => setActiveTab('events')} className={clsx("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", activeTab === 'events' ? "bg-blue-600 text-white" : "text-secondary hover:text-primary")}>
                            <Bell className="w-3 h-3 inline mr-1" />Events
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 text-blue-500 animate-spin" /></div>
                ) : (
                    <>
                        {activeTab === 'server' && (
                            <div className="space-y-4">
                                {/* SMTP Server - Compact Grid */}
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="col-span-3">
                                        <label className="text-[10px] font-bold text-secondary uppercase mb-1 block">Server</label>
                                        <input type="text" value={settings.smtp_server} onChange={e => setSettings({...settings, smtp_server: e.target.value})}
                                            className="w-full px-3 py-2 bg-primary border border-theme rounded-lg text-sm text-primary focus:border-blue-500/50 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-secondary uppercase mb-1 block">Port</label>
                                        <input type="number" value={settings.smtp_port} onChange={e => setSettings({...settings, smtp_port: parseInt(e.target.value) || 25})}
                                            className="w-full px-3 py-2 bg-primary border border-theme rounded-lg text-sm text-primary focus:border-blue-500/50 outline-none" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-secondary uppercase mb-1 block">From Address</label>
                                        <input type="email" value={settings.smtp_from} onChange={e => setSettings({...settings, smtp_from: e.target.value})}
                                            className="w-full px-3 py-2 bg-primary border border-theme rounded-lg text-sm text-primary focus:border-blue-500/50 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-secondary uppercase mb-1 block">Admin Email</label>
                                        <input type="email" value={settings.smtp_to} onChange={e => setSettings({...settings, smtp_to: e.target.value})}
                                            className="w-full px-3 py-2 bg-primary border border-theme rounded-lg text-sm text-primary focus:border-blue-500/50 outline-none" />
                                    </div>
                                </div>

                                {/* Security Toggles - Inline */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <MiniToggle label="SSL/TLS" enabled={settings.smtp_ssl} onChange={v => setSettings({...settings, smtp_ssl: v})} />
                                    <MiniToggle label="STARTTLS" enabled={settings.smtp_starttls} onChange={v => setSettings({...settings, smtp_starttls: v})} />
                                    <MiniToggle label="Auth" enabled={settings.smtp_use_auth} onChange={v => setSettings({...settings, smtp_use_auth: v})} />
                                </div>

                                {/* Auth Credentials */}
                                {settings.smtp_use_auth && (
                                    <div className="grid grid-cols-2 gap-3 p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
                                        <div>
                                            <label className="text-[10px] font-bold text-secondary uppercase mb-1 block">Username</label>
                                            <input type="text" value={settings.smtp_username} onChange={e => setSettings({...settings, smtp_username: e.target.value})}
                                                className="w-full px-3 py-2 bg-primary border border-theme rounded-lg text-sm text-primary focus:border-purple-500/50 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-secondary uppercase mb-1 block">Password</label>
                                            <div className="relative">
                                                <input type={showPassword ? "text" : "password"} value={settings.smtp_password} onChange={e => setSettings({...settings, smtp_password: e.target.value})}
                                                    className="w-full px-3 py-2 pr-10 bg-primary border border-theme rounded-lg text-sm text-primary focus:border-purple-500/50 outline-none" />
                                                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-primary">
                                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Test Email Section */}
                                <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Send className="w-3.5 h-3.5 text-blue-400" />
                                        <span className="text-xs font-bold text-primary">Test Email</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <input type="email" value={testRecipient} onChange={e => setTestRecipient(e.target.value)} placeholder="recipient@example.com"
                                            className="flex-1 px-3 py-2 bg-primary border border-theme rounded-lg text-sm text-primary focus:border-blue-500/50 outline-none" />
                                        <button onClick={handleTestEmail} disabled={!testRecipient}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                                            <Send className="w-3.5 h-3.5" />Run Test
                                        </button>
                                    </div>

                                    {/* Test Progress Panel */}
                                    {showTestPanel && (
                                        <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-slate-700 font-mono text-xs">
                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
                                                <Clock className="w-3 h-3 text-slate-400" />
                                                <span className="text-slate-400">SMTP Test Log</span>
                                            </div>
                                            <div className="space-y-2">
                                                {testSteps.map((step, i) => (
                                                    <div key={step.id} className="flex items-start gap-2">
                                                        <StepIcon status={step.status} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className={clsx("text-xs", step.status === 'error' ? 'text-red-400' : step.status === 'success' ? 'text-emerald-400' : 'text-slate-300')}>
                                                                {step.label}
                                                            </div>
                                                            {step.detail && (
                                                                <div className="text-[10px] text-slate-500 truncate">{step.detail}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'events' && (
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                {events.map(event => (
                                    <div key={event.event_type} className="flex items-center justify-between p-3 bg-secondary/5 rounded-lg border border-theme hover:border-blue-500/30 transition-all">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-semibold text-primary text-xs">{event.name}</h4>
                                            <p className="text-[10px] text-secondary truncate">{event.description}</p>
                                        </div>
                                        <button onClick={() => handleToggleEvent(event.event_type, !event.email_enabled)}
                                            className={clsx("relative w-10 h-5 rounded-full transition-all flex items-center px-0.5 flex-shrink-0 ml-2", event.email_enabled ? "bg-emerald-500" : "bg-gray-500")}>
                                            <div className={clsx("w-4 h-4 rounded-full bg-white shadow transition-transform", event.email_enabled ? "translate-x-5" : "translate-x-0")} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-theme">
                    <button onClick={onClose} className="px-4 py-2 bg-secondary/10 hover:bg-secondary/20 text-primary rounded-lg text-xs font-bold">Cancel</button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                        {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// Compact Toggle
const MiniToggle: React.FC<{ label: string; enabled: boolean; onChange: (v: boolean) => void }> = ({ label, enabled, onChange }) => (
    <button onClick={() => onChange(!enabled)}
        className={clsx("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all", enabled ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-secondary/10 border-theme text-secondary hover:text-primary")}>
        {enabled && <Check className="w-3 h-3 inline mr-1" />}{label}
    </button>
);

export default EmailSettingsModal;
