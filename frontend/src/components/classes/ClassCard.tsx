import React, { useState } from "react";
import {
  Calendar,
  Users,
  Layers,
  Eye,
  Edit,
  Trash2,
  Sparkles,
  Clock,
  Key,
  Pause,
  RotateCcw,
  Power,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Link2,
  Copy,
} from "lucide-react";
import { getProviderIcon } from "../ProviderIcons";
import clsx from "clsx";
import api from "../../api";
import { useToast } from "../../context/ToastContext";
// Types
import type { ClassModel } from "../../types/class";
import { statusConfig } from "../../types/class";

// Import New Modal
import ProvisioningStatusModal from "./ProvisioningStatusModal";
import DeletionStatusModal from "./DeletionStatusModal";

interface ClassCardProps {
  cls: ClassModel;
  onView: (cls: ClassModel) => void;
  onEdit: (cls: ClassModel) => void;
  onRefresh?: () => void;
}

const ClassCard: React.FC<ClassCardProps> = ({
  cls,
  onView,
  onEdit,
  onRefresh,
}) => {
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Status Modal State
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleOpenProvision = () => {
    setShowProvisionModal(true);
  };

  const handleOpenDeletion = () => {
    setShowDeletionModal(true);
  };

  const handleSuspendAll = async () => {
    setIsLoading('suspend');
    try {
      const response = await api.post(`/classes/${cls.id}/environments/suspend-all`);
      if (response.data.success) {
        showToast(`Suspended all VMs for ${cls.name}`, 'success');
      } else {
        showToast(response.data.message || 'Failed to suspend VMs', 'error');
      }
      if (onRefresh) onRefresh();
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Failed to suspend VMs', 'error');
    } finally {
      setIsLoading(null);
    }
  };

  const handleRevertAll = async () => {
    setIsLoading('revert');
    try {
      const response = await api.post(`/classes/${cls.id}/environments/revert-all`);
      if (response.data.success) {
        showToast(`Reverted all VMs to snapshot for ${cls.name}`, 'success');
      } else {
        showToast(response.data.message || 'Failed to revert VMs', 'error');
      }
      if (onRefresh) onRefresh();
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Failed to revert VMs', 'error');
    } finally {
      setIsLoading(null);
    }
  };

  const handleStartAll = async () => {
    setIsLoading('start');
    try {
      const envsResponse = await api.get(`/classes/${cls.id}/environments`);
      const envs = envsResponse.data || [];
      let successCount = 0;
      for (const env of envs) {
        try {
          await api.post(`/classes/environments/${env.id}/power`, { action: 'start' });
          successCount++;
        } catch (e) { /* continue */ }
      }
      showToast(`Started VMs in ${successCount} environments`, 'success');
      if (onRefresh) onRefresh();
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Failed to start VMs', 'error');
    } finally {
      setIsLoading(null);
    }
  };

  const handleStopAll = async () => {
    setIsLoading('stop');
    try {
      const envsResponse = await api.get(`/classes/${cls.id}/environments`);
      const envs = envsResponse.data || [];
      let successCount = 0;
      for (const env of envs) {
        try {
          await api.post(`/classes/environments/${env.id}/power`, { action: 'stop' });
          successCount++;
        } catch (e) { /* continue */ }
      }
      showToast(`Stopped VMs in ${successCount} environments`, 'success');
      if (onRefresh) onRefresh();
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Failed to stop VMs', 'error');
    } finally {
      setIsLoading(null);
    }
  };

  const config = statusConfig[cls.status] || {
    label: cls.status,
    color: "text-gray-400",
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getDaysRemaining = () => {
    const end = new Date(cls.end_date);
    const now = new Date();
    const days = Math.ceil(
      (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  const daysRemaining = getDaysRemaining();
  const ProviderIcon = cls.template ? getProviderIcon(cls.template.provider) : Layers;

  // Generate join URL
  const joinUrl = cls.join_token 
    ? `${window.location.origin}/join/${cls.join_token}`
    : null;

  const copyJoinLink = () => {
    if (joinUrl) {
      navigator.clipboard.writeText(joinUrl);
      showToast('Join link copied to clipboard!', 'success');
    }
  };

  return (
    <>
      <div className="glass-light rounded-2xl border border-white/10 hover:border-blue-500/40 transition-all duration-300 relative group shadow-xl bg-white/5 dark:bg-gray-900/40 overflow-hidden">
        {/* Compact Header - Always Visible */}
        <div 
          className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/5 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Expand Icon */}
          <div className="text-secondary">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>

          {/* Provider Icon */}
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10 border border-white/10 transition-all group-hover:scale-105">
            <ProviderIcon className="w-5 h-5 text-primary" />
          </div>

          {/* Title & Template */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-primary truncate group-hover:text-blue-400 transition-colors">
              {cls.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-secondary">
              <span>{cls.template?.name || 'No Template'}</span>
              <span>•</span>
              <span>{formatDate(cls.start_date)} - {formatDate(cls.end_date)}</span>
            </div>
          </div>

          {/* Stats Pills */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-secondary/20 rounded-lg text-xs">
              <Users className="w-3 h-3 text-blue-400" />
              <span className="text-primary font-medium">{cls.max_users}</span>
            </div>
            {daysRemaining > 0 && cls.status === 'active' && (
              <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 rounded-lg text-xs border border-emerald-500/20">
                <Clock className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500 font-medium">{daysRemaining}d</span>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div className={clsx(
            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border",
            cls.status === 'active' 
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
              : cls.status === 'draft'
              ? "bg-blue-500/10 border-blue-500/30 text-blue-500"
              : cls.status === 'completed'
              ? "bg-slate-500/10 border-slate-500/30 text-slate-500"
              : "bg-gray-500/10 border-gray-500/30 text-gray-500"
          )}>
            {config.label}
          </div>

          {/* Quick Actions (always visible) */}
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => onView(cls)} 
              className="p-2 text-secondary hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
              title="View Details"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onEdit(cls)} 
              className="p-2 text-secondary hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-white/5 bg-secondary/5 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {/* Description */}
            {cls.description && (
              <p className="text-sm text-secondary leading-relaxed pl-1 border-l-2 border-blue-500/20">
                {cls.description}
              </p>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-secondary/20 p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 text-xs text-secondary mb-1">
                  <Layers className="w-3 h-3" /> Template
                </div>
                <div className="text-sm font-medium text-primary truncate">
                  {cls.template?.name || '—'}
                </div>
              </div>
              <div className="bg-secondary/20 p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 text-xs text-secondary mb-1">
                  <Calendar className="w-3 h-3" /> Schedule
                </div>
                <div className="text-sm font-medium text-primary">
                  {formatDate(cls.start_date)} — {formatDate(cls.end_date)}
                </div>
              </div>
              <div className="bg-secondary/20 p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 text-xs text-secondary mb-1">
                  <Key className="w-3 h-3" /> Passcode
                </div>
                <div className="text-sm font-mono font-medium text-primary">
                  {cls.passcode || '—'}
                </div>
              </div>
            </div>

            {/* Student Access Section - Prominent and Copiable */}
            {joinUrl && (
              <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-4 rounded-xl border border-emerald-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                    <Link2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <span className="text-sm font-bold text-emerald-400">Student Access</span>
                </div>
                
                {/* Join Link */}
                <div className="space-y-2 mb-3">
                  <label className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-wide">Join Link</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={joinUrl} 
                      className="flex-1 px-3 py-2 bg-slate-900 border border-emerald-500/30 rounded-lg text-sm text-white font-mono text-xs truncate"
                    />
                    <button
                      onClick={copyJoinLink}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                </div>

                {/* Access Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 rounded-lg p-2.5 border border-white/5">
                    <div className="text-[10px] font-bold text-secondary uppercase tracking-wide mb-0.5">Passcode</div>
                    <div className="text-sm font-mono font-bold text-white">{cls.passcode}</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2.5 border border-white/5">
                    <div className="text-[10px] font-bold text-secondary uppercase tracking-wide mb-0.5">Max Students</div>
                    <div className="text-sm font-bold text-white">{cls.max_users}</div>
                  </div>
                </div>
                
                <p className="text-[10px] text-emerald-500/60 mt-2">
                  Share this link with students. They'll use the passcode to access their class environment.
                </p>
              </div>
            )}

            {/* Power Operations */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-wide mr-2">Power:</span>
              <button
                onClick={handleStartAll}
                disabled={isLoading !== null}
                className={clsx(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  isLoading === 'start'
                    ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/40"
                    : "bg-secondary/20 text-secondary hover:text-emerald-500 hover:bg-emerald-500/10 border-white/5 hover:border-emerald-500/30"
                )}
              >
                {isLoading === 'start' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Start
              </button>
              <button
                onClick={handleStopAll}
                disabled={isLoading !== null}
                className={clsx(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  isLoading === 'stop'
                    ? "bg-red-500/20 text-red-500 border-red-500/40"
                    : "bg-secondary/20 text-secondary hover:text-red-500 hover:bg-red-500/10 border-white/5 hover:border-red-500/30"
                )}
              >
                {isLoading === 'stop' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                Stop
              </button>
              <button
                onClick={handleSuspendAll}
                disabled={isLoading !== null}
                className={clsx(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  isLoading === 'suspend'
                    ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
                    : "bg-secondary/20 text-secondary hover:text-amber-500 hover:bg-amber-500/10 border-white/5 hover:border-amber-500/30"
                )}
              >
                {isLoading === 'suspend' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
                Suspend
              </button>
              <button
                onClick={handleRevertAll}
                disabled={isLoading !== null}
                className={clsx(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  isLoading === 'revert'
                    ? "bg-purple-500/20 text-purple-500 border-purple-500/40"
                    : "bg-secondary/20 text-secondary hover:text-purple-500 hover:bg-purple-500/10 border-white/5 hover:border-purple-500/30"
                )}
              >
                {isLoading === 'revert' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                Revert
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <button
                onClick={handleOpenProvision}
                disabled={!["active", "draft"].includes(cls.status)}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border shadow-lg",
                  ["active", "draft"].includes(cls.status)
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-transparent hover:scale-105 active:scale-95 shadow-emerald-500/20"
                    : "bg-secondary/20 text-secondary/40 border-theme/20 cursor-not-allowed"
                )}
              >
                <Sparkles className="w-4 h-4" />
                Provision Environments
              </button>
              
              <button 
                onClick={handleOpenDeletion} 
                className="flex items-center gap-2 px-4 py-2 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors text-xs font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Delete Class
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Modals */}
      <ProvisioningStatusModal
        isOpen={showProvisionModal}
        onClose={() => setShowProvisionModal(false)}
        classId={cls.id}
        className={cls.name}
        onComplete={() => {
          if (onRefresh) onRefresh();
        }}
      />

      <DeletionStatusModal
        isOpen={showDeletionModal}
        onClose={() => setShowDeletionModal(false)}
        classId={cls.id}
        className={cls.name}
        onComplete={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </>
  );
};

export default ClassCard;
