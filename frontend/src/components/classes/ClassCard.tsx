import React, { useState } from "react";
import {
  Users,
  Layers,
  Eye,
  Edit,
  Trash2,
  Sparkles,
  Clock,
  Pause,
  RotateCcw,
  Play,
  Square,
  RefreshCw,
  Link2,
  Copy,
  Calendar,
  ChevronDown,
  ChevronUp,
  Zap,
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
  const [isExpanded, setIsExpanded] = useState(true);
  
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

  // Status color mapping for the glow effect
  const statusGlow = {
    active: 'from-violet-500/20 to-purple-500/10',
    draft: 'from-slate-500/20 to-gray-500/10',
    upcoming: 'from-indigo-500/20 to-blue-500/10',
    completed: 'from-fuchsia-500/20 to-pink-500/10',
    archived: 'from-gray-500/20 to-slate-500/10',
  };

  return (
    <>
      <div className="group relative bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-200 dark:border-slate-700/50 hover:border-violet-300 dark:hover:border-violet-500/50 transition-all duration-300 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-violet-500/5 dark:hover:shadow-violet-500/10">
        {/* Gradient glow on hover */}
        <div className={clsx(
          "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br",
          statusGlow[cls.status as keyof typeof statusGlow] || statusGlow.draft
        )} />
        
        {/* Main Header */}
        <div className="relative p-4">
          <div className="flex items-start gap-3">
            {/* Provider Icon with gradient background */}
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
              <div className="relative p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
                <ProviderIcon className="w-5 h-5 text-white" />
              </div>
            </div>
            
            {/* Title & Meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
                  {cls.name}
                </h3>
                <div className={clsx(
                  "flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                  config.bgColor || "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                )}>
                  {config.label}
                </div>
              </div>
              
              {/* Meta row */}
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(cls.start_date)} — {formatDate(cls.end_date)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {cls.max_users} seats
                </span>
                {daysRemaining > 0 && cls.status === 'active' && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <Clock className="w-3 h-3" />
                    {daysRemaining}d left
                  </span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1">
              <button 
                onClick={() => onView(cls)} 
                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" 
                title="View Details"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button 
                onClick={() => onEdit(cls)} 
                className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors" 
                title="Edit Class"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsExpanded(!isExpanded)} 
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Description (if exists, always show) */}
          {cls.description && (
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400 line-clamp-2">
              {cls.description}
            </p>
          )}

          {/* Inline Quick Stats */}
          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-slate-700/50 rounded-lg">
              <Layers className="w-3 h-3 text-gray-500 dark:text-slate-400" />
              <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{cls.template?.name || 'No Template'}</span>
            </div>
            {cls.passcode && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                <Zap className="w-3 h-3 text-blue-500" />
                <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">{cls.passcode}</span>
              </div>
            )}
          </div>
        </div>

        {/* Expanded Section */}
        {isExpanded && (
          <div className="relative border-t border-gray-100 dark:border-slate-700/50 animate-in slide-in-from-top-2 duration-200">
            {/* Fleet Control Bar */}
            <div className="p-4 bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Fleet Control</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleStartAll} 
                  disabled={isLoading !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isLoading === 'start' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Start
                </button>
                <button 
                  onClick={handleStopAll} 
                  disabled={isLoading !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isLoading === 'stop' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                  Stop
                </button>
                <button 
                  onClick={handleSuspendAll} 
                  disabled={isLoading !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-fuchsia-500 hover:bg-fuchsia-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isLoading === 'suspend' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                  Suspend
                </button>
                <button 
                  onClick={handleRevertAll} 
                  disabled={isLoading !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isLoading === 'revert' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Revert
                </button>
              </div>
            </div>

            {/* Student Access URL */}
            {joinUrl && (
              <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-500/5 dark:to-indigo-500/5 border-t border-blue-100 dark:border-blue-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-400">Student Join Link</span>
                  </div>
                  <button 
                    onClick={copyJoinLink} 
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
                <div className="mt-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-blue-500/30">
                  <code className="text-xs text-gray-600 dark:text-slate-300 break-all">{joinUrl}</code>
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100 dark:border-slate-700/50">
              <button
                onClick={handleOpenProvision}
                disabled={!["active", "draft", "upcoming"].includes(cls.status)}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  ["active", "draft", "upcoming"].includes(cls.status)
                    ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-gray-100 dark:bg-slate-700 text-gray-400 cursor-not-allowed"
                )}
              >
                <Sparkles className="w-4 h-4" />
                Build Fleet
              </button>
              <button 
                onClick={handleOpenDeletion} 
                className="flex items-center gap-1.5 px-3 py-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
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
