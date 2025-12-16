import React, { useState } from 'react';
import { Calendar, Users, Layers, MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';
import { getProviderIcon } from '../ProviderIcons';
import { useToast } from '../../context/ToastContext';
import api from '../../api';

// Types
import type { ClassModel } from '../../types/class';
import { statusConfig } from '../../types/class';

// Import New Modal
import ProvisioningStatusModal from './ProvisioningStatusModal';
import DeletionStatusModal from './DeletionStatusModal';

interface ClassCardProps {
    cls: ClassModel;
    onView: (cls: ClassModel) => void;
    onEdit: (cls: ClassModel) => void;
    onDelete: (cls: ClassModel) => void;
    onRefresh?: () => void;
}

const ClassCard: React.FC<ClassCardProps> = ({ cls, onView, onEdit, onDelete, onRefresh }) => {
    const { showToast } = useToast();
    const [menuOpen, setMenuOpen] = useState(false);
    
    // Status Modal State
    const [showProvisionModal, setShowProvisionModal] = useState(false);
    const [showDeletionModal, setShowDeletionModal] = useState(false);

    // Old handleProvision replaced by simply opening the modal
    const handleOpenProvision = () => {
         setShowProvisionModal(true);
    };

    const handleOpenDeletion = () => {
        setShowDeletionModal(true);
    };

    const getStatusBadge = (status: string) => {
        const config = statusConfig[status] || { label: status, color: 'text-gray-400', bgColor: 'bg-gray-800' };
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.color}`}>
                {config.label}
            </span>
        );
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    return (
        <>
            <div className="card hover:border-blue-500/50 transition-all hover:shadow-xl hover:shadow-black/20 group overflow-hidden flex flex-col h-full">
                {/* Card Header & Status */}
                <div className="p-5 pb-0 flex items-start justify-between">
                    <div className="flex gap-3">
                        <div className={`p-2.5 rounded-lg ${cls.template ? 'bg-blue-500/10 text-blue-400' : 'bg-secondary text-secondary'}`}>
                            {cls.template ? (
                                 // Helper to render icon dynamically if needed, or just use default
                                 getProviderIcon(cls.template.provider)({ className: "w-6 h-6" })
                            ) : (
                                <Layers className="w-6 h-6" />
                            )}
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg text-primary group-hover:text-blue-400 transition-colors line-clamp-1" title={cls.name}>
                                {cls.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                                {getStatusBadge(cls.status)}
                                {cls.template && (
                                    <span className="text-xs text-secondary flex items-center gap-1">
                                        <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                                        {cls.template.name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Action Menu */}
                    <div className="relative action-menu-container">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                            className={`p-1.5 rounded-lg transition-colors ${menuOpen ? 'bg-secondary text-primary' : 'text-secondary hover:text-primary hover:bg-secondary'}`}
                        >
                            <MoreVertical className="w-5 h-5" />
                        </button>

                        {menuOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)}></div>
                                <div className="absolute right-0 mt-2 w-48 bg-elevated border border-theme rounded-xl shadow-xl z-20 py-1 overflow-hidden scale-in-center origin-top-right">
                                    <button 
                                        onClick={() => { setMenuOpen(false); onView(cls); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-secondary hover:bg-secondary hover:text-primary flex items-center gap-2 transition-colors"
                                    >
                                        <Eye className="w-4 h-4 text-blue-400" /> View Details
                                    </button>
                                    <button 
                                        onClick={() => { setMenuOpen(false); onEdit(cls); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-secondary hover:bg-secondary hover:text-primary flex items-center gap-2 transition-colors"
                                    >
                                        <Edit className="w-4 h-4 text-amber-400" /> Edit Class
                                    </button>

                                    <button 
                                        onClick={(e) => { 
                                            setMenuOpen(false); 
                                            e.stopPropagation();
                                            handleOpenProvision(); 
                                        }}
                                        disabled={!['active', 'draft'].includes(cls.status)}
                                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                                            ['active', 'draft'].includes(cls.status) 
                                                ? 'text-emerald-500 hover:bg-secondary hover:text-emerald-400' 
                                                : 'text-gray-500 opacity-50 cursor-not-allowed'
                                        }`}
                                    >
                                        <Layers className="w-4 h-4" /> 
                                        Provision
                                    </button>
                                    
                                    <div className="border-t border-theme my-1"></div>
                                    
                                    <button 
                                        onClick={() => { setMenuOpen(false); handleOpenDeletion(); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" /> Delete
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                
                {/* Card Body */}
                <div className="p-5 space-y-3 flex-1">
                    <p className="text-secondary text-sm line-clamp-2 h-10">
                        {cls.description || "No description provided."}
                    </p>
                    
                    <div className="space-y-2 pt-2">
                        <div className="flex items-center text-sm text-secondary">
                            <Calendar className="w-4 h-4 mr-2 text-secondary" />
                            <span>{formatDate(cls.start_date)} - {formatDate(cls.end_date)}</span>
                        </div>
                        <div className="flex items-center text-sm text-secondary">
                            <Users className="w-4 h-4 mr-2 text-secondary" />
                            <span>Capacity: {cls.max_users} Students</span>
                        </div>
                    </div>
                </div>

                {/* Card Footer */}
                <div className="px-5 py-4 bg-secondary/50 border-t border-theme flex justify-between items-center text-xs">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleOpenProvision(); }}
                            disabled={!['active', 'draft'].includes(cls.status)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium border ${
                                ['active', 'draft'].includes(cls.status)
                                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20 cursor-pointer' 
                                    : 'bg-gray-500/5 text-gray-500 border-gray-500/20 cursor-not-allowed opacity-50'
                            }`}
                            title={['active', 'draft'].includes(cls.status) ? "Provision Environments" : "Class must be 'Active' or 'Draft' to provision"}
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Provision
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-secondary">{new Date(cls.updated_at || cls.created_at || '').toLocaleDateString()}</span>
                        <button 
                            onClick={() => onView(cls)}
                            className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                        >
                            Manage &rarr;
                        </button>
                    </div>
                </div>
            </div>

            {/* Status Modals */}
            <ProvisioningStatusModal 
                isOpen={showProvisionModal} 
                onClose={() => setShowProvisionModal(false)}
                classId={cls.id}
                className={cls.name}
                onComplete={() => { if(onRefresh) onRefresh(); }}
            />
            
            <DeletionStatusModal 
                isOpen={showDeletionModal} 
                onClose={() => setShowDeletionModal(false)}
                classId={cls.id}
                className={cls.name}
                onComplete={() => { if(onRefresh) onRefresh(); }}
            />
        </>
    );
};

export default ClassCard;
