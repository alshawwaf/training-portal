import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
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

    // Use portal to render modal at document.body level
    // This escapes the stacking context of parent elements
    return ReactDOM.createPortal(
        <div 
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-200 dark:bg-slate-900 transition-opacity duration-100"
            onClick={handleBackdropClick}
        >
            <div 
                ref={modalRef}
                className={clsx(
                    "glass-light rounded-2xl border border-theme/30 shadow-xl w-full transition-transform duration-100 max-h-[90vh] flex flex-col relative overflow-hidden",
                    maxWidthClasses[maxWidth]
                )}
            >
                {/* Header - Compact */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-theme/30 flex-shrink-0 bg-secondary/5">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                {icon}
                            </div>
                        )}
                        <div>
                            <h2 className="text-lg font-bold text-primary leading-tight">{title}</h2>
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mt-0.5 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-blue-500" />
                                Action Required
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {headerActions}
                        <button 
                            onClick={onClose}
                            className="p-2 bg-secondary/20 hover:bg-secondary/40 text-secondary hover:text-primary rounded-lg transition-colors duration-100"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                
                {/* Content - Compact */}
                <div className="p-5 overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default Modal;
