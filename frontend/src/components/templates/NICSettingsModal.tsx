import React, { useState, useEffect } from 'react';
import { X, Save, Settings } from 'lucide-react';
import clsx from 'clsx';

interface NICSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: any) => void;
  initialSettings: {
    nicName: string;
    vmName: string;
    model: string;
    mac?: string;
    mtu?: number;
    rate_limit?: number;
    multiqueue?: number;
    firewall: boolean;
    disconnect: boolean;
  };
  provider?: string;
}

const NIC_MODELS = [
  { value: 'virtio', label: 'VirtIO (paravirtualized)', provider: 'proxmox' },
  { value: 'e1000', label: 'Intel E1000', provider: 'all' },
  { value: 'e1000e', label: 'Intel E1000E', provider: 'all' },
  { value: 'rtl8139', label: 'Realtek RTL8139', provider: 'proxmox' },
  { value: 'vmxnet3', label: 'VMware vmxnet3', provider: 'all' }
];

export const NICSettingsModal: React.FC<NICSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialSettings,
  provider = 'proxmox'
}) => {
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    if (isOpen) {
      setSettings(initialSettings);
    }
  }, [isOpen, initialSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(settings);
    onClose();
  };
  
  const isProxmox = provider.toLowerCase() === 'proxmox';
  const isVsphere = provider.toLowerCase() === 'vsphere' || provider.toLowerCase() === 'vmware';

  const supportedModels = NIC_MODELS.filter(m => 
    m.provider === 'all' || 
    (isProxmox && m.provider === 'proxmox') ||
    (isVsphere && m.provider === 'vsphere')
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl w-[600px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-800/50">
          <div className="flex items-center gap-2 text-white">
            <Settings className="w-5 h-5 text-purple-400" />
            <span className="font-bold">Edit Network Device: {settings.nicName}</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            
            {/* Model */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Model</label>
              <select
                value={settings.model}
                onChange={(e) => setSettings({...settings, model: e.target.value})}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                {supportedModels.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* MAC Address */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">MAC Address</label>
              <input
                type="text"
                value={settings.mac || ''}
                onChange={(e) => setSettings({...settings, mac: e.target.value})}
                placeholder="auto"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-600"
              />
            </div>
            
            {/* MTU - Shown for all, but typically only impactful if supported by underlying infra */}
            <div className={clsx("space-y-2", !isProxmox && "opacity-50 cursor-not-allowed")}>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">MTU {isVsphere && '(Not Supported)'}</label>
              <input
                type="number"
                disabled={!isProxmox}
                value={settings.mtu || ''}
                onChange={(e) => setSettings({...settings, mtu: e.target.value ? parseInt(e.target.value) : undefined})}
                placeholder="1500"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-600 disabled:opacity-50"
              />
            </div>

            {/* Rate Limit - Proxmox Only */}
            {isProxmox && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rate Limit (MB/s)</label>
              <input
                type="number"
                step="0.1"
                value={settings.rate_limit || ''}
                onChange={(e) => setSettings({...settings, rate_limit: e.target.value ? parseFloat(e.target.value) : undefined})}
                placeholder="Unlimited"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-600"
              />
            </div>
            )}

             {/* Multiqueue - Proxmox Only */}
             {isProxmox && (
             <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Multiqueue</label>
              <input
                type="number"
                value={settings.multiqueue || ''}
                onChange={(e) => setSettings({...settings, multiqueue: e.target.value ? parseInt(e.target.value) : undefined})}
                placeholder="0"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-600"
              />
            </div>
             )}

          </div>

          <div className="border-t border-white/10 pt-6 flex gap-6">
             {/* Firewall - Proxmox Only */}
             {isProxmox && (
             <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${settings.firewall ? 'bg-purple-500 border-purple-500' : 'border-slate-500 group-hover:border-purple-400'}`}>
                {settings.firewall && <Settings className="w-3 h-3 text-white" />} 
              </div>
              <input 
                type="checkbox" 
                className="hidden"
                checked={settings.firewall}
                onChange={(e) => setSettings({...settings, firewall: e.target.checked})}
              />
              <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Firewall</span>
            </label>
             )}

            {/* Disconnect */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${settings.disconnect ? 'bg-purple-500 border-purple-500' : 'border-slate-500 group-hover:border-purple-400'}`}>
                {settings.disconnect && <Settings className="w-3 h-3 text-white" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden"
                checked={settings.disconnect}
                onChange={(e) => setSettings({...settings, disconnect: e.target.checked})}
              />
              <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Disconnect (Link Down)</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-slate-800/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
