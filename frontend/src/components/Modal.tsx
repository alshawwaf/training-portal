import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
    icon?: React.ReactNode;
    headerActions?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = 'md', icon, headerActions }) => {
    const modalRef = useRef<HTMLDivElement>(null);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    // Close on click outside (backdrop only)
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
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
    };

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={handleBackdropClick}
        >
            <div 
                ref={modalRef}
                className={clsx(
                    "bg-elevated rounded-xl border border-theme shadow-2xl w-full transform transition-all scale-100 max-h-[90vh] flex flex-col",
                    maxWidthClasses[maxWidth]
                )}
            >
                <div className="flex items-center justify-between p-6 border-b border-theme flex-shrink-0">
                    <div className="flex items-center gap-3">
                        {icon && <div className="p-2 bg-theme-hover rounded-lg">{icon}</div>}
                        <h2 className="text-xl font-semibold text-primary">{title}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {headerActions}
                        <button 
                            onClick={onClose}
                            className="text-secondary hover:text-primary transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
