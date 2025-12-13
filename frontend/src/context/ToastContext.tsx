import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);

        // Browser Notification
        if (localStorage.getItem('browser_notifications') === 'true' && Notification.permission === 'granted') {
            try {
                // Don't show generic info toasts as system notifications to avoid spam, usually success/error is important
                if (type !== 'info') {
                    new Notification(type.charAt(0).toUpperCase() + type.slice(1), { 
                        body: message,
                        icon: '/vite.svg' // Optional icon
                    });
                }
            } catch (e) {
                console.error("Failed to show notification", e);
            }
        }

        // Auto remove after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map(toast => (
                    <div 
                        key={toast.id}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border min-w-[300px] animate-slide-in",
                            {
                                'bg-green-500/10 border-green-500/20 text-green-400': toast.type === 'success',
                                'bg-red-500/10 border-red-500/20 text-red-400': toast.type === 'error',
                                'bg-blue-500/10 border-blue-500/20 text-blue-400': toast.type === 'info',
                                'bg-yellow-500/10 border-yellow-500/20 text-yellow-400': toast.type === 'warning',
                            }
                        )}
                    >
                        {toast.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
                        {toast.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                        {toast.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
                        {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
                        
                        <p className="text-sm font-medium flex-1">{toast.message}</p>
                        
                        <button 
                            onClick={() => removeToast(toast.id)}
                            className="text-current opacity-60 hover:opacity-100"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};
