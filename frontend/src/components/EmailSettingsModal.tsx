import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { 
    Server, Eye, EyeOff, Send, RefreshCw, Check, AlertCircle,
    Bell, CheckCircle, XCircle, Clock
} from 'lucide-react';
import clsx from 'clsx';

interface EmailSettings {
    smtp_server: string;
    smtp_port: number;
    smtp_from: string;
    smtp_to: string;
    smtp_ssl: boolean;
    smtp_starttls: boolean;
    smtp_validate_certs: boolean;
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
    const [activeTab, setActiveTab] = useState<'server' | 'events' | 'certs'>('server');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);
    
    // Certificate states
    const [certStatus, setCertStatus] = useState<{
        ca_certificate: { configured: boolean; info?: any };
        client_certificate: { configured: boolean; info?: any };
        client_key: { configured: boolean };
        mtls_enabled: boolean;
    } | null>(null);
    const [caCertInput, setCaCertInput] = useState('');
    const [clientCertInput, setClientCertInput] = useState('');
    const [clientKeyInput, setClientKeyInput] = useState('');
    const [keyPasswordInput, setKeyPasswordInput] = useState('');
    const [uploadingCert, setUploadingCert] = useState<string | null>(null);

    // Test email state
    const [testRecipient, setTestRecipient] = useState('');
    const [showTestPanel, setShowTestPanel] = useState(false);
    const [testSteps, setTestSteps] = useState<TestStep[]>([]);
    const [debugInfo, setDebugInfo] = useState<{
        smtp_config?: {
            server: string;
            port: number;
            encryption: { ssl_tls: boolean; starttls: boolean; validate_certs: boolean };
            authentication: { enabled: boolean; username?: string };
            from_address: string;
        };
        request?: { url: string; method: string; headers: Record<string, string>; payload: any };
        response?: { status: number; statusText: string; data: any };
        error?: string;
    } | null>(null);
    const [showDebug, setShowDebug] = useState(false);


    const [settings, setSettings] = useState<EmailSettings>({
        smtp_server: '',
        smtp_port: 25,
        smtp_from: 'noreply@example.com',
        smtp_to: 'admin@example.com',
        smtp_ssl: false,
        smtp_starttls: false,
        smtp_validate_certs: false,
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
            fetchCertStatus();
            setShowTestPanel(false);
        }
    }, [isOpen]);

    const fetchCertStatus = async () => {
        try {
            const res = await api.get('/email/certificates/status');
            setCertStatus(res.data);
        } catch (e) {
            console.log('Certificate status not available');
        }
    };


    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await api.get('/email/settings');
            const data = res.data;
            setSettings({
                smtp_server: data.smtp_server || '',
                smtp_port: parseInt(data.smtp_port) || 25,
                smtp_from: data.smtp_from || 'noreply@example.com',
                smtp_to: data.smtp_to || 'admin@example.com',
                smtp_ssl: data.smtp_ssl === 'true',
                smtp_starttls: data.smtp_starttls === 'true',
                smtp_validate_certs: data.smtp_validate_certs === 'true',
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

        // Prepare request payload for debug info
        const requestPayload = {
            to: [testRecipient],
            subject: 'Training Portal - SMTP Configuration Test',
            message: 'This is a test email to verify your SMTP configuration is working correctly.'
        };

        setDebugInfo({
            smtp_config: {
                server: settings.smtp_server,
                port: settings.smtp_port,
                encryption: {
                    ssl_tls: settings.smtp_ssl,
                    starttls: settings.smtp_starttls,
                    validate_certs: settings.smtp_validate_certs
                },

                authentication: {
                    enabled: settings.smtp_use_auth,
                    username: settings.smtp_username || undefined
                },
                from_address: settings.smtp_from
            },
            request: {
                url: '/api/email/test',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer [token]' },
                payload: requestPayload
            }
        });

        try {
            const res = await api.post('/email/test', requestPayload);
            
            // Store response in debug info (includes connection_info from backend)
            setDebugInfo(prev => ({
                ...prev,
                smtp_config: res.data.connection_info || prev?.smtp_config,
                response: {
                    status: res.status,
                    statusText: res.statusText,
                    data: res.data
                }

            }));
            
            if (res.data.success) {
                updateStep('send', { status: 'success', detail: 'Email delivered successfully!' });
            } else {
                updateStep('send', { status: 'error', detail: res.data.message || 'Failed to send' });
            }
        } catch (e: any) {
            const errorMsg = e.response?.data?.detail || 'Connection failed';
            
            // Store error info in debug
            setDebugInfo(prev => ({
                ...prev,
                response: e.response ? {
                    status: e.response.status,
                    statusText: e.response.statusText,
                    data: e.response.data
                } : undefined,
                error: errorMsg
            }));
            
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
                        <button onClick={() => setActiveTab('certs')} className={clsx("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", activeTab === 'certs' ? "bg-blue-600 text-white" : "text-secondary hover:text-primary")}>
                            🔒 Certs
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
                                    <MiniToggle label="Validate Certs" enabled={settings.smtp_validate_certs} onChange={v => setSettings({...settings, smtp_validate_certs: v})} />
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
                                                {testSteps.map((step) => (
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

                                            {/* Debug Info Toggle */}
                                            {debugInfo && (
                                                <div className="mt-3 pt-3 border-t border-slate-700">
                                                    <button 
                                                        onClick={() => setShowDebug(!showDebug)}
                                                        className="flex items-center gap-2 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                                                    >
                                                        <span>{showDebug ? '▼' : '▶'}</span>
                                                        <span>Debug Info (Request/Response)</span>
                                                    </button>
                                                    
                                                    {showDebug && (
                                                        <div className="mt-2 space-y-2 text-[10px]">
                                                            {/* SMTP Connection Details */}
                                                            {debugInfo.smtp_config && (
                                                                <div className="p-2 bg-purple-900/30 rounded border border-purple-500/30">
                                                                    <div className="text-purple-400 font-bold mb-2">SMTP CONNECTION DETAILS</div>
                                                                    <div className="grid grid-cols-2 gap-2 text-slate-300">
                                                                        <div>
                                                                            <span className="text-slate-500">Server: </span>
                                                                            <span className="text-cyan-400">{debugInfo.smtp_config.server}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">Port: </span>
                                                                            <span className="text-cyan-400">{debugInfo.smtp_config.port}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">SSL/TLS: </span>
                                                                            <span className={debugInfo.smtp_config.encryption.ssl_tls ? "text-emerald-400" : "text-slate-500"}>
                                                                                {debugInfo.smtp_config.encryption.ssl_tls ? "Enabled" : "Disabled"}
                                                                            </span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">STARTTLS: </span>
                                                                            <span className={debugInfo.smtp_config.encryption.starttls ? "text-emerald-400" : "text-slate-500"}>
                                                                                {debugInfo.smtp_config.encryption.starttls ? "Enabled" : "Disabled"}
                                                                            </span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">Cert Validation: </span>
                                                                            <span className={debugInfo.smtp_config.encryption.validate_certs ? "text-emerald-400" : "text-amber-400"}>
                                                                                {debugInfo.smtp_config.encryption.validate_certs ? "Enabled" : "Disabled"}
                                                                            </span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">Authentication: </span>
                                                                            <span className={debugInfo.smtp_config.authentication.enabled ? "text-emerald-400" : "text-slate-500"}>
                                                                                {debugInfo.smtp_config.authentication.enabled ? "Enabled" : "None"}
                                                                            </span>
                                                                        </div>
                                                                        {debugInfo.smtp_config.authentication.enabled && debugInfo.smtp_config.authentication.username && (
                                                                            <div className="col-span-2">
                                                                                <span className="text-slate-500">Username: </span>
                                                                                <span className="text-cyan-400">{debugInfo.smtp_config.authentication.username}</span>
                                                                            </div>
                                                                        )}
                                                                        <div className="col-span-2">
                                                                            <span className="text-slate-500">From: </span>
                                                                            <span className="text-cyan-400">{debugInfo.smtp_config.from_address}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Request Info */}
                                                            <div className="p-2 bg-slate-800 rounded border border-slate-600">
                                                                <div className="text-blue-400 font-bold mb-1">REQUEST</div>
                                                                <div className="text-slate-300">
                                                                    <span className="text-emerald-400">{debugInfo.request?.method}</span> {debugInfo.request?.url}
                                                                </div>
                                                                <div className="text-slate-500 mt-1">Headers:</div>
                                                                <pre className="text-slate-400 overflow-x-auto">{JSON.stringify(debugInfo.request?.headers, null, 2)}</pre>
                                                                <div className="text-slate-500 mt-1">Payload:</div>
                                                                <pre className="text-slate-400 overflow-x-auto max-h-24 overflow-y-auto">{JSON.stringify(debugInfo.request?.payload, null, 2)}</pre>
                                                            </div>

                                                            
                                                            {/* Response Info */}
                                                            {debugInfo.response && (
                                                                <div className="p-2 bg-slate-800 rounded border border-slate-600">
                                                                    <div className={clsx("font-bold mb-1", debugInfo.response.status >= 400 ? "text-red-400" : "text-emerald-400")}>
                                                                        RESPONSE ({debugInfo.response.status} {debugInfo.response.statusText})
                                                                    </div>
                                                                    <pre className="text-slate-400 overflow-x-auto max-h-32 overflow-y-auto">{JSON.stringify(debugInfo.response.data, null, 2)}</pre>
                                                                </div>
                                                            )}
                                                            
                                                            {/* Error */}
                                                            {debugInfo.error && (
                                                                <div className="p-2 bg-red-900/30 rounded border border-red-500/30">
                                                                    <div className="text-red-400 font-bold mb-1">ERROR</div>
                                                                    <div className="text-red-300">{debugInfo.error}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
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

                        {activeTab === 'certs' && (
                            <div className="space-y-4">
                                {/* Certificate Status */}
                                <div className="p-3 bg-secondary/5 rounded-lg border border-theme">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-primary">Certificate Status</span>
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    const res = await api.get('/email/certificates/status');
                                                    setCertStatus(res.data);
                                                } catch { showToast('Failed to fetch certificate status', 'error'); }
                                            }}
                                            className="text-[10px] text-blue-400 hover:text-blue-300"
                                        >
                                            Refresh
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className={clsx("p-2 rounded-lg border", certStatus?.ca_certificate?.configured ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-500/10 border-slate-500/30")}>
                                            <p className="text-[10px] text-secondary">CA Cert</p>
                                            <p className={clsx("text-xs font-bold", certStatus?.ca_certificate?.configured ? "text-emerald-400" : "text-slate-400")}>
                                                {certStatus?.ca_certificate?.configured ? '✓' : '—'}
                                            </p>
                                        </div>
                                        <div className={clsx("p-2 rounded-lg border", certStatus?.client_certificate?.configured ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-500/10 border-slate-500/30")}>
                                            <p className="text-[10px] text-secondary">Client Cert</p>
                                            <p className={clsx("text-xs font-bold", certStatus?.client_certificate?.configured ? "text-emerald-400" : "text-slate-400")}>
                                                {certStatus?.client_certificate?.configured ? '✓' : '—'}
                                            </p>
                                        </div>
                                        <div className={clsx("p-2 rounded-lg border", certStatus?.mtls_enabled ? "bg-purple-500/10 border-purple-500/30" : "bg-slate-500/10 border-slate-500/30")}>
                                            <p className="text-[10px] text-secondary">mTLS</p>
                                            <p className={clsx("text-xs font-bold", certStatus?.mtls_enabled ? "text-purple-400" : "text-slate-400")}>
                                                {certStatus?.mtls_enabled ? 'Active' : '—'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* CA Certificate Upload */}
                                <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-blue-400">CA Certificate (Trust Internal CAs)</span>
                                        {certStatus?.ca_certificate?.configured && (
                                            <button 
                                                onClick={async () => {
                                                    setUploadingCert('ca-delete');
                                                    try {
                                                        await api.delete('/email/certificates/ca');
                                                        showToast('CA certificate deleted', 'success');
                                                        setCertStatus(prev => prev ? {...prev, ca_certificate: {configured: false}} : null);
                                                    } catch { showToast('Failed to delete', 'error'); }
                                                    setUploadingCert(null);
                                                }}
                                                className="text-[10px] text-red-400 hover:text-red-300"
                                                disabled={uploadingCert === 'ca-delete'}
                                            >
                                                {uploadingCert === 'ca-delete' ? 'Deleting...' : 'Delete'}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-secondary mb-2">Paste PEM-encoded CA certificate to trust internally-signed mail server certs:</p>
                                    <textarea 
                                        value={caCertInput}
                                        onChange={e => setCaCertInput(e.target.value)}
                                        placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                                        className="w-full h-20 px-2 py-1.5 bg-primary border border-theme rounded-lg text-[10px] font-mono text-primary resize-none focus:border-blue-500/50 outline-none"
                                    />
                                    <button 
                                        onClick={async () => {
                                            if (!caCertInput.includes('-----BEGIN CERTIFICATE-----')) {
                                                showToast('Invalid PEM format', 'error');
                                                return;
                                            }
                                            setUploadingCert('ca');
                                            try {
                                                await api.post('/email/certificates/ca', { certificate: caCertInput });
                                                showToast('CA certificate uploaded', 'success');
                                                setCaCertInput('');
                                                const res = await api.get('/email/certificates/status');
                                                setCertStatus(res.data);
                                            } catch (e: any) { showToast(e.response?.data?.detail || 'Upload failed', 'error'); }
                                            setUploadingCert(null);
                                        }}
                                        disabled={!caCertInput || uploadingCert === 'ca'}
                                        className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold disabled:opacity-50"
                                    >
                                        {uploadingCert === 'ca' ? 'Uploading...' : 'Upload CA Certificate'}
                                    </button>
                                </div>

                                {/* mTLS Client Certificate */}
                                <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-purple-400">Client Certificate (mTLS)</span>
                                        {certStatus?.client_certificate?.configured && (
                                            <button 
                                                onClick={async () => {
                                                    setUploadingCert('client-delete');
                                                    try {
                                                        await api.delete('/email/certificates/client');
                                                        showToast('Client certificate deleted', 'success');
                                                        setCertStatus(prev => prev ? {...prev, client_certificate: {configured: false}, client_key: {configured: false}, mtls_enabled: false} : null);
                                                    } catch { showToast('Failed to delete', 'error'); }
                                                    setUploadingCert(null);
                                                }}
                                                className="text-[10px] text-red-400 hover:text-red-300"
                                                disabled={uploadingCert === 'client-delete'}
                                            >
                                                {uploadingCert === 'client-delete' ? 'Deleting...' : 'Delete'}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-secondary mb-2">For servers requiring mutual TLS authentication:</p>
                                    
                                    <div className="space-y-2">
                                        <div>
                                            <label className="text-[9px] font-bold text-secondary uppercase">Client Certificate (PEM)</label>
                                            <textarea 
                                                value={clientCertInput}
                                                onChange={e => setClientCertInput(e.target.value)}
                                                placeholder="-----BEGIN CERTIFICATE-----"
                                                className="w-full h-16 px-2 py-1.5 bg-primary border border-theme rounded-lg text-[10px] font-mono text-primary resize-none focus:border-purple-500/50 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-secondary uppercase">Private Key (PEM)</label>
                                            <textarea 
                                                value={clientKeyInput}
                                                onChange={e => setClientKeyInput(e.target.value)}
                                                placeholder="-----BEGIN PRIVATE KEY-----"
                                                className="w-full h-16 px-2 py-1.5 bg-primary border border-theme rounded-lg text-[10px] font-mono text-primary resize-none focus:border-purple-500/50 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-secondary uppercase">Key Password (optional)</label>
                                            <input 
                                                type="password"
                                                value={keyPasswordInput}
                                                onChange={e => setKeyPasswordInput(e.target.value)}
                                                placeholder="For encrypted private keys"
                                                className="w-full px-2 py-1.5 bg-primary border border-theme rounded-lg text-[10px] text-primary focus:border-purple-500/50 outline-none"
                                            />
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={async () => {
                                            if (!clientCertInput.includes('-----BEGIN CERTIFICATE-----')) {
                                                showToast('Invalid certificate format', 'error');
                                                return;
                                            }
                                            if (!clientKeyInput.includes('PRIVATE KEY')) {
                                                showToast('Invalid private key format', 'error');
                                                return;
                                            }
                                            setUploadingCert('client');
                                            try {
                                                await api.post('/email/certificates/client', { 
                                                    certificate: clientCertInput, 
                                                    private_key: clientKeyInput,
                                                    key_password: keyPasswordInput || null
                                                });
                                                showToast('Client certificate uploaded for mTLS', 'success');
                                                setClientCertInput('');
                                                setClientKeyInput('');
                                                setKeyPasswordInput('');
                                                const res = await api.get('/email/certificates/status');
                                                setCertStatus(res.data);
                                            } catch (e: any) { showToast(e.response?.data?.detail || 'Upload failed', 'error'); }
                                            setUploadingCert(null);
                                        }}
                                        disabled={!clientCertInput || !clientKeyInput || uploadingCert === 'client'}
                                        className="mt-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] font-bold disabled:opacity-50"
                                    >
                                        {uploadingCert === 'client' ? 'Uploading...' : 'Upload Client Certificate'}
                                    </button>
                                </div>
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
