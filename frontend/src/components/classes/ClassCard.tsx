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
      <div className="bg-secondary/20 rounded-lg border border-theme hover:border-blue-500/40 transition-all group overflow-hidden">
        {/* Compact Header */}
        <div 
          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/10 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <button className="text-secondary p-0.5">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <ProviderIcon className="w-4 h-4 text-blue-400" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-primary truncate">{cls.name}</h3>
            <span className="text-xs text-secondary">{cls.template?.name || 'No Template'} • {formatDate(cls.start_date)} - {formatDate(cls.end_date)}</span>
          </div>

          {/* Stats */}
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-secondary/20 rounded text-xs">
              <Users className="w-3 h-3 text-blue-400" />
              <span className="text-primary font-medium">{cls.max_users}</span>
            </div>
            {daysRemaining > 0 && cls.status === 'active' && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-fuchsia-500/10 rounded text-xs">
                <Clock className="w-3 h-3 text-fuchsia-400" />
                <span className="text-fuchsia-400 font-medium">{daysRemaining}d</span>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div className={clsx(
            "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
            cls.status === 'active' 
              ? "bg-fuchsia-500/15 text-fuchsia-400" 
              : cls.status === 'draft'
              ? "bg-blue-500/15 text-blue-400"
              : cls.status === 'completed'
              ? "bg-slate-500/15 text-slate-400"
              : "bg-gray-500/15 text-gray-400"
          )}>
            {config.label}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            <button onClick={() => onView(cls)} className="p-1.5 text-secondary hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors">
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onEdit(cls)} className="p-1.5 text-secondary hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors">
              <Edit className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-theme bg-secondary/10 px-3 py-2 space-y-3 animate-in slide-in-from-top-1 duration-150">
            {cls.description && (
              <p className="text-xs text-secondary pl-2 border-l-2 border-blue-500/30">{cls.description}</p>
            )}

            {/* Details Grid - Compact */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-secondary/20 px-2 py-1.5 rounded text-xs">
                <div className="flex items-center gap-1 text-secondary mb-0.5"><Layers className="w-3 h-3" /> Template</div>
                <div className="font-medium text-primary truncate">{cls.template?.name || '—'}</div>
              </div>
              <div className="bg-secondary/20 px-2 py-1.5 rounded text-xs">
                <div className="flex items-center gap-1 text-secondary mb-0.5"><Calendar className="w-3 h-3" /> Schedule</div>
                <div className="font-medium text-primary">{formatDate(cls.start_date)} — {formatDate(cls.end_date)}</div>
              </div>
              <div className="bg-secondary/20 px-2 py-1.5 rounded text-xs">
                <div className="flex items-center gap-1 text-secondary mb-0.5"><Key className="w-3 h-3" /> Passcode</div>
                <div className="font-mono font-medium text-primary">{cls.passcode || '—'}</div>
              </div>
            </div>

            {/* Student Access - Compact */}
            {joinUrl && (
              <div className="bg-fuchsia-500/10 p-2 rounded border border-fuchsia-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span className="text-xs font-bold text-fuchsia-400">Student Access</span>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" readOnly value={joinUrl} 
                    className="flex-1 px-2 py-1 bg-slate-900/50 border border-fuchsia-500/20 rounded text-xs text-white font-mono truncate"
                  />
                  <button onClick={copyJoinLink} className="flex items-center gap-1 px-2 py-1 bg-fuchsia-500 text-white rounded text-xs font-medium hover:bg-fuchsia-600 shrink-0">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
              </div>
            )}

            {/* Power Operations - Compact */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] font-bold text-secondary uppercase mr-1">Power:</span>
              <button onClick={handleStartAll} disabled={isLoading !== null} className={clsx("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all", isLoading === 'start' ? "bg-fuchsia-500/20 text-fuchsia-400" : "bg-secondary/20 text-secondary hover:text-fuchsia-400 hover:bg-fuchsia-500/10")}>
                {isLoading === 'start' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Start
              </button>
              <button onClick={handleStopAll} disabled={isLoading !== null} className={clsx("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all", isLoading === 'stop' ? "bg-red-500/20 text-red-400" : "bg-secondary/20 text-secondary hover:text-red-400 hover:bg-red-500/10")}>
                {isLoading === 'stop' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />} Stop
              </button>
              <button onClick={handleSuspendAll} disabled={isLoading !== null} className={clsx("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all", isLoading === 'suspend' ? "bg-amber-500/20 text-amber-400" : "bg-secondary/20 text-secondary hover:text-amber-400 hover:bg-amber-500/10")}>
                {isLoading === 'suspend' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />} Suspend
              </button>
              <button onClick={handleRevertAll} disabled={isLoading !== null} className={clsx("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all", isLoading === 'revert' ? "bg-purple-500/20 text-purple-400" : "bg-secondary/20 text-secondary hover:text-purple-400 hover:bg-purple-500/10")}>
                {isLoading === 'revert' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Revert
              </button>
            </div>

            {/* Action Buttons - Compact */}
            <div className="flex items-center justify-between pt-2 border-t border-theme">
              <button
                onClick={handleOpenProvision}
                disabled={!["active", "draft"].includes(cls.status)}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all",
                  ["active", "draft"].includes(cls.status)
                    ? "bg-fuchsia-600 text-white hover:bg-fuchsia-500"
                    : "bg-secondary/20 text-secondary/40 cursor-not-allowed"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" /> Provision
              </button>
              <button onClick={handleOpenDeletion} className="flex items-center gap-1 px-2 py-1.5 text-secondary hover:text-red-400 hover:bg-red-500/10 rounded text-[10px] font-medium">
                <Trash2 className="w-3.5 h-3.5" /> Delete
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
