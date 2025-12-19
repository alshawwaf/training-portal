import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import clsx from "clsx";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [notification, setNotification] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    // Only show one at a time, or overwrite
    setNotification({ id: Date.now(), message, type });
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000); // Auto dismiss after 5 seconds

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const closeNotification = () => {
    setNotification(null);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast Notification - Floating glassmorphism card */}
      {notification && (
        <div 
            className="fixed top-6 right-6 z-[100] animate-slide-in-right"
        >
            <div 
                className={clsx(
                    "relative overflow-hidden flex items-center gap-4 px-5 py-4 rounded-2xl border shadow-2xl min-w-[320px] max-w-md backdrop-blur-xl transition-all duration-300",
                    {
                        "bg-emerald-500/10 border-emerald-500/30 text-emerald-100": notification.type === 'success',
                        "bg-red-500/10 border-red-500/30 text-red-100": notification.type === 'error',
                        "bg-blue-500/10 border-blue-500/30 text-blue-100": notification.type === 'info',
                        "bg-amber-500/10 border-amber-500/30 text-amber-100": notification.type === 'warning',
                    }
                )}
            >
                {/* Progress Bar Background */}
                <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/5" />
                
                {/* Animated Progress Bar */}
                <div 
                    className={clsx("absolute bottom-0 left-0 h-[3px] animate-toast-progress", {
                        "bg-emerald-500": notification.type === 'success',
                        "bg-red-500": notification.type === 'error',
                        "bg-blue-500": notification.type === 'info',
                        "bg-amber-500": notification.type === 'warning',
                    })} 
                />

                {/* Icon with Glowing Background */}
                <div className="relative flex-shrink-0">
                    <div className={clsx("absolute -inset-2 rounded-full blur-md opacity-20", {
                        "bg-emerald-500": notification.type === 'success',
                        "bg-red-500": notification.type === 'error',
                        "bg-blue-500": notification.type === 'info',
                        "bg-amber-500": notification.type === 'warning',
                    })} />
                    <div className={clsx("relative p-2.5 rounded-xl flex-shrink-0 border border-white/10 shadow-inner", {
                        "bg-emerald-500/20 text-emerald-400": notification.type === 'success',
                        "bg-red-500/20 text-red-400": notification.type === 'error',
                        "bg-blue-500/20 text-blue-400": notification.type === 'info',
                        "bg-amber-500/20 text-amber-400": notification.type === 'warning',
                    })}>
                        {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
                        {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
                        {notification.type === 'info' && <Info className="w-5 h-5" />}
                        {notification.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                    </div>
                </div>

                {/* Message & Title */}
                <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-0.5">
                        {notification.type}
                    </p>
                    <p className="text-sm font-semibold text-primary leading-tight">{notification.message}</p>
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
