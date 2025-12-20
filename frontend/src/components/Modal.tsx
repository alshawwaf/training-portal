import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
    icon?: React.ReactNode;
    headerActions?: React.ReactNode;
    closeOnClickOutside?: boolean; // Default false - only close via buttons
    closeOnEscape?: boolean; // Default false - only close via buttons
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = 'md', icon, headerActions, closeOnClickOutside = false, closeOnEscape = false }) => {
    const modalRef = useRef<HTMLDivElement>(null);

    // Close on escape key (only if enabled)
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && closeOnEscape) onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose, closeOnEscape]);

    // Close on click outside (backdrop only) - only if enabled
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (closeOnClickOutside && e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    const maxWidthClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
        '6xl': 'max-w-6xl',
    };

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-300 animate-in fade-in"
            onClick={handleBackdropClick}
        >

            <div 
                ref={modalRef}
                className={clsx(
                    "glass-light rounded-[2.5rem] border border-white/20 shadow-2xl w-full transform transition-all animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col relative overflow-hidden",
                    maxWidthClasses[maxWidth]
                )}
            >
                {/* Header Glow */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 blur-[80px] pointer-events-none" />
                
                <div className="flex items-center justify-between p-8 border-b border-theme/50 flex-shrink-0 relative z-10 bg-secondary/10 backdrop-blur-xl">
                    <div className="flex items-center gap-4">
                        {icon && (
                            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl shadow-inner group">
                                {icon}
                            </div>
                        )}
                        <div>
                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight drop-shadow-sm">{title}</h2>
                            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-[0.2em] mt-1.5 opacity-100 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
                                Action Required
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {headerActions}
                        <button 
                            onClick={onClose}
                            className="p-2.5 bg-secondary/30 hover:bg-secondary/50 text-secondary hover:text-primary rounded-xl transition-all hover:rotate-90 duration-300 border border-theme/50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                <div className="p-8 overflow-y-auto custom-scrollbar relative z-10">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
