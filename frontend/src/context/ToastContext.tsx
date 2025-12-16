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
      
      {/* Toast Notification - Small, top right corner */}
      {notification && (
        <div 
            className="fixed top-4 right-4 z-[100] animate-slide-in-right"
        >
            <div 
                className={clsx(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg min-w-[280px] max-w-md bg-elevated",
                    {
                        "border-green-500/30": notification.type === 'success',
                        "border-red-500/30": notification.type === 'error',
                        "border-blue-500/30": notification.type === 'info',
                        "border-amber-500/30": notification.type === 'warning',
                    }
                )}
            >
                {/* Icon */}
                <div className={clsx("p-2 rounded-lg flex-shrink-0", {
                    "bg-green-500/10 text-green-500": notification.type === 'success',
                    "bg-red-500/10 text-red-500": notification.type === 'error',
                    "bg-blue-500/10 text-blue-500": notification.type === 'info',
                    "bg-amber-500/10 text-amber-500": notification.type === 'warning',
                })}>
                    {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
                    {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
                    {notification.type === 'info' && <Info className="w-5 h-5" />}
                    {notification.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                </div>

                {/* Message */}
                <p className="text-sm text-primary flex-1">{notification.message}</p>

                {/* Close Button */}
                <button 
                    onClick={closeNotification}
                    className="p-1 text-secondary hover:text-primary rounded-lg hover:bg-secondary/10 transition-colors flex-shrink-0"
                >
                    <X className="w-4 h-4" />
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
