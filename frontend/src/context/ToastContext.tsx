import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Bell, Trash2 } from "lucide-react";
import clsx from "clsx";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  timestamp: Date;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
  notifications: Toast[];
  removeNotification: (id: number) => void;
  clearAllNotifications: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentToast, setCurrentToast] = useState<Toast | null>(null);
  const [notifications, setNotifications] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const newNotification: Toast = { 
      id: Date.now(), 
      message, 
      type,
      timestamp: new Date()
    };
    setCurrentToast(newNotification);
    // Add to notification history (keep last 50)
    setNotifications(prev => [newNotification, ...prev].slice(0, 50));
  }, []);

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (currentToast) {
      const timer = setTimeout(() => {
        setCurrentToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [currentToast]);

  const closeNotification = () => {
    setCurrentToast(null);
  };

  return (
    <ToastContext.Provider value={{ showToast, notifications, removeNotification, clearAllNotifications }}>
      {children}
      
      {/* Toast Notification - Floating glassmorphism card */}
      {currentToast && (
        <div className="fixed top-6 right-6 z-[100] animate-slide-in-right">
            <div 
                className={clsx(
                    "relative overflow-hidden flex items-center gap-4 px-5 py-4 rounded-2xl border shadow-2xl min-w-[320px] max-w-md backdrop-blur-xl transition-all duration-300",
                    {
                        "bg-emerald-50 dark:bg-emerald-900/90 border-emerald-500/30 text-emerald-900 dark:text-emerald-100": currentToast.type === 'success',
                        "bg-red-50 dark:bg-red-900/90 border-red-500/30 text-red-900 dark:text-red-100": currentToast.type === 'error',
                        "bg-blue-50 dark:bg-blue-900/90 border-blue-500/30 text-blue-900 dark:text-blue-100": currentToast.type === 'info',
                        "bg-amber-50 dark:bg-amber-900/90 border-amber-500/30 text-amber-900 dark:text-amber-100": currentToast.type === 'warning',
                    }
                )}
            >
                {/* Progress Bar Background */}
                <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/5" />
                
                {/* Animated Progress Bar */}
                <div 
                    className={clsx("absolute bottom-0 left-0 h-[3px] animate-toast-progress", {
                        "bg-emerald-500": currentToast.type === 'success',
                        "bg-red-500": currentToast.type === 'error',
                        "bg-blue-500": currentToast.type === 'info',
                        "bg-amber-500": currentToast.type === 'warning',
                    })} 
                />

                {/* Icon with Glowing Background */}
                <div className="relative flex-shrink-0">
                    <div className={clsx("absolute -inset-2 rounded-full blur-md opacity-20", {
                        "bg-emerald-500": currentToast.type === 'success',
                        "bg-red-500": currentToast.type === 'error',
                        "bg-blue-500": currentToast.type === 'info',
                        "bg-amber-500": currentToast.type === 'warning',
                    })} />
                    <div className={clsx("relative p-2.5 rounded-xl flex-shrink-0 border border-white/10 shadow-inner", {
                        "bg-emerald-500/20 text-emerald-400": currentToast.type === 'success',
                        "bg-red-500/20 text-red-400": currentToast.type === 'error',
                        "bg-blue-500/20 text-blue-400": currentToast.type === 'info',
                        "bg-amber-500/20 text-amber-400": currentToast.type === 'warning',
                    })}>
                        {currentToast.type === 'success' && <CheckCircle className="w-5 h-5" />}
                        {currentToast.type === 'error' && <AlertCircle className="w-5 h-5" />}
                        {currentToast.type === 'info' && <Info className="w-5 h-5" />}
                        {currentToast.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                    </div>
                </div>

                {/* Message & Title */}
                <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-0.5">
                        {currentToast.type}
                    </p>
                    <p className="text-sm font-semibold text-primary leading-tight">{currentToast.message}</p>
                </div>

                {/* Close Button */}
                <button 
                    onClick={closeNotification}
                    className="p-1.5 text-secondary hover:text-primary rounded-lg hover:bg-white/10 transition-all flex-shrink-0 group"
                >
                    <X className="w-4 h-4 transition-transform group-hover:rotate-90" />
                </button>
            </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};

// Notification Bell Component for use in Layout
export const NotificationBell: React.FC = () => {
  const { notifications, removeNotification, clearAllNotifications } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getIconForType = (type: ToastType) => {
    switch(type) {
      case 'success': return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      default: return <Info className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  return (
    <div className="relative z-[9999]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-secondary/50 hover:bg-secondary text-secondary hover:text-primary border border-theme hover:border-blue-500/30 transition-all duration-300"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop - closes dropdown when clicking outside */}
          <div className="fixed inset-0 z-[9998] cursor-default" onClick={() => setIsOpen(false)} />
          
          {/* Dropdown */}
          <div 
            className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <span className="text-sm font-bold text-slate-900 dark:text-white">Notifications</span>
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear All
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-slate-500 dark:text-slate-400">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 last:border-0 group"
                  >
                    <div className="mt-0.5">{getIconForType(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 dark:text-white leading-tight">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{getTimeAgo(n.timestamp)}</p>
                    </div>
                    <button
                      onClick={() => removeNotification(n.id)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
