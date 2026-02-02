import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { Mail, Globe, Check, ChevronRight, Settings } from 'lucide-react';
import Modal from '../components/Modal';
import EmailSettingsModal from '../components/EmailSettingsModal';

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
    
    // Modal States
    const [emailSettingsModalOpen, setEmailSettingsModalOpen] = useState(false);
    const [browserModalOpen, setBrowserModalOpen] = useState(false);
    const [emailPrefsModalOpen, setEmailPrefsModalOpen] = useState(false);

    useEffect(() => {
        if (user) {
            fetchPreferences();
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
            title: 'Email Server Settings',
            description: 'Configure SMTP and notification events',
            icon: Settings,
            color: 'emerald'
        }
    ];

    const handleCardClick = (channel: NotificationChannel) => {
        switch (channel.id) {
            case 'email':
                setEmailPrefsModalOpen(true);
                break;
            case 'browser':
                setBrowserModalOpen(true);
                break;
            case 'smtp':
                setEmailSettingsModalOpen(true);
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

            {/* Email Preferences Modal */}
            <Modal
                isOpen={emailPrefsModalOpen}
                onClose={() => setEmailPrefsModalOpen(false)}
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
                        <button onClick={() => setEmailPrefsModalOpen(false)} className="btn-primary">
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

            {/* Email Settings Modal (SMTP + Notification Events) */}
            <EmailSettingsModal 
                isOpen={emailSettingsModalOpen} 
                onClose={() => setEmailSettingsModalOpen(false)} 
            />
        </div>
    );
};

export default Notifications;
