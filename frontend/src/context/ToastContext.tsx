import React, { createContext, useContext, useState, useCallback } from "react";
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

  const closeNotification = () => {
    setNotification(null);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Notification Modal */}
      {notification && (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-fade-in"
            onClick={closeNotification}
        >
            <div 
                className={clsx(
                    "bg-elevated rounded-2xl border shadow-2xl w-full max-w-sm transform transition-all scale-100 p-6 flex flex-col items-center text-center animate-slide-up bg-opacity-95 backdrop-blur-xl",
                    {
                        "border-green-500/30 shadow-green-500/10": notification.type === 'success',
                        "border-red-500/30 shadow-red-500/10": notification.type === 'error',
                        "border-blue-500/30 shadow-blue-500/10": notification.type === 'info',
                        "border-amber-500/30 shadow-amber-500/10": notification.type === 'warning',
                    }
                )}
                onClick={e => e.stopPropagation()}
            >
                {/* Icon */}
                <div className={clsx("p-4 rounded-full mb-4", {
                    "bg-green-500/10 text-green-500": notification.type === 'success',
                    "bg-red-500/10 text-red-500": notification.type === 'error',
                    "bg-blue-500/10 text-blue-500": notification.type === 'info',
                    "bg-amber-500/10 text-amber-500": notification.type === 'warning',
                })}>
                    {notification.type === 'success' && <CheckCircle className="w-8 h-8" />}
                    {notification.type === 'error' && <AlertCircle className="w-8 h-8" />}
                    {notification.type === 'info' && <Info className="w-8 h-8" />}
                    {notification.type === 'warning' && <AlertTriangle className="w-8 h-8" />}
                </div>

                <h3 className={clsx("text-lg font-bold mb-2", {
                     "text-green-500": notification.type === 'success',
                     "text-red-500": notification.type === 'error',
                     "text-blue-500": notification.type === 'info',
                     "text-amber-500": notification.type === 'warning',
                     "text-primary": !['success', 'error', 'info', 'warning'].includes(notification.type)
                })}>
                    {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}!
                </h3>

                <p className="text-secondary mb-6 leading-relaxed">
                    {notification.message}
                </p>

                <button 
                    onClick={closeNotification}
                    className="w-full py-2.5 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-primary font-medium transition-colors"
                >
                    Close
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
