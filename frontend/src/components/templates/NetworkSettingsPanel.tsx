import React, { useState, useCallback } from 'react';
import { 
    Globe, ShieldCheck, X, Save, RefreshCw, Palette, 
    Server, Link2, Tag, Settings2, Trash2
} from 'lucide-react';
import clsx from 'clsx';

interface NetworkSettingsPanelProps {
    network: {
        id: number;
        name: string;
        color?: string;
        is_isolated?: boolean;
        isolation_mode?: string;
        vlan_id?: number;
        network_identifier?: string;
    };
    connectedVMs: Array<{ name: string; nicName: string }>;
    onClose: () => void;
    onSave: (updates: Partial<NetworkSettingsPanelProps['network']>) => void;
    onDelete?: () => void;
}

// Color presets for networks
const COLOR_PRESETS = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#8b5cf6', // Violet
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
];

// Tab type
type TabType = 'general' | 'isolation' | 'connections';

const NetworkSettingsPanel: React.FC<NetworkSettingsPanelProps> = ({
    network,
    connectedVMs,
    onClose,
    onSave,
    onDelete
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('general');
    const [formData, setFormData] = useState({
        name: network.name,
        color: network.color || '#3b82f6',
        isolation_mode: network.isolation_mode || (network.is_isolated ? 'isolated' : 'shared'),
        vlan_id: network.vlan_id || undefined,
        network_identifier: network.network_identifier || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const hasChanges = 
        formData.name !== network.name ||
        formData.color !== (network.color || '#3b82f6') ||
        formData.isolation_mode !== (network.isolation_mode || (network.is_isolated ? 'isolated' : 'shared')) ||
        formData.vlan_id !== network.vlan_id ||
        formData.network_identifier !== (network.network_identifier || '');

    const handleSave = useCallback(() => {
        setIsSaving(true);
        onSave({
            name: formData.name,
            color: formData.color,
            isolation_mode: formData.isolation_mode,
            vlan_id: formData.vlan_id,
            network_identifier: formData.network_identifier,
        });
        setTimeout(() => setIsSaving(false), 500);
    }, [formData, onSave]);

    const tabs: { id: TabType; label: string; icon: React.ReactNode; badge?: string }[] = [
        { id: 'general', label: 'General', icon: <Settings2 className="w-3.5 h-3.5" /> },
        { id: 'isolation', label: 'Isolation', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
        { id: 'connections', label: 'VMs', icon: <Server className="w-3.5 h-3.5" />, badge: connectedVMs.length > 0 ? `${connectedVMs.length}` : undefined },
    ];

    return (
        <div className="w-[380px] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div 
                className="border-b border-white/10"
                style={{ background: `linear-gradient(135deg, ${formData.color}20 0%, transparent 100%)` }}
            >
                <div className="p-3 flex items-center gap-3">
                    <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center border"
                        style={{ 
                            backgroundColor: `${formData.color}20`,
                            borderColor: `${formData.color}40`
                        }}
                    >
                        {formData.isolation_mode === 'isolated' ? (
                            <ShieldCheck className="w-5 h-5" style={{ color: formData.color }} />
                        ) : (
                            <Globe className="w-5 h-5" style={{ color: formData.color }} />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{formData.name}</h3>
                        <p className="text-[10px] text-slate-400 uppercase">
                            {formData.isolation_mode === 'isolated' ? 'Isolated VLAN' : 'Shared Network'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg">
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Quick Stats */}
                <div className="px-3 pb-3 grid grid-cols-3 gap-2">
                    <div className="bg-slate-800/50 rounded-lg p-2 text-center border border-white/5">
                        <p className="text-lg font-black text-blue-400">{connectedVMs.length}</p>
                        <p className="text-[9px] text-slate-500 uppercase">VMs</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2 text-center border border-white/5">
                        <p className="text-lg font-black text-purple-400">{formData.vlan_id || '—'}</p>
                        <p className="text-[9px] text-slate-500 uppercase">VLAN</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2 text-center border border-white/5">
                        <p className="text-lg font-black" style={{ color: formData.color }}>
                            {formData.isolation_mode === 'isolated' ? '🔒' : '🌐'}
                        </p>
                        <p className="text-[9px] text-slate-500 uppercase">Mode</p>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-white/10 bg-slate-800/30">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-all relative",
                            activeTab === tab.id ? "text-purple-400" : "text-slate-500 hover:text-slate-300"
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                        {tab.badge && (
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-purple-500 rounded-full text-[9px] text-white flex items-center justify-center">
                                {tab.badge}
                            </span>
                        )}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-purple-500 rounded-full" />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="p-3 max-h-[350px] overflow-y-auto space-y-3">
                {/* GENERAL TAB */}
                {activeTab === 'general' && (
                    <>
                        {/* Network Name */}
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-2">
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block">Network Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>

                        {/* Color Picker */}
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <Palette className="w-4 h-4" style={{ color: formData.color }} />
                                Color
                            </div>
                            <div className="grid grid-cols-8 gap-2">
                                {COLOR_PRESETS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setFormData({...formData, color})}
                                        className={clsx(
                                            "w-8 h-8 rounded-lg transition-all",
                                            formData.color === color && "ring-2 ring-white ring-offset-2 ring-offset-slate-900"
                                        )}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Network Identifier */}
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-2">
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                <Link2 className="w-3 h-3" />
                                Infrastructure Network
                            </label>
                            <input
                                type="text"
                                value={formData.network_identifier}
                                onChange={e => setFormData({...formData, network_identifier: e.target.value})}
                                placeholder="e.g., VM Network, vSwitch0"
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>

                        {/* Danger Zone */}
                        {onDelete && (
                            <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                                <div className="flex items-center gap-2 text-[10px] font-black text-red-500/70 uppercase tracking-widest">
                                    <Trash2 className="w-3 h-3" />
                                    Danger Zone
                                </div>
                                <button
                                    onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete "${formData.name}"?`)) {
                                            onDelete();
                                        }
                                    }}
                                    className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete Network
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ISOLATION TAB */}
                {activeTab === 'isolation' && (
                    <>
                        {/* Isolation Mode */}
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                Isolation Mode
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {['shared', 'isolated', 'tagged'].map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setFormData({...formData, isolation_mode: mode})}
                                        className={clsx(
                                            "py-3 rounded-xl text-xs font-bold transition-all border",
                                            formData.isolation_mode === mode
                                                ? mode === 'isolated' 
                                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                                                    : mode === 'tagged'
                                                        ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                                                        : "bg-blue-500/20 text-blue-400 border-blue-500/50"
                                                : "bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600"
                                        )}
                                    >
                                        <div className="flex flex-col items-center gap-1">
                                            {mode === 'shared' && <Globe className="w-4 h-4" />}
                                            {mode === 'isolated' && <ShieldCheck className="w-4 h-4" />}
                                            {mode === 'tagged' && <Tag className="w-4 h-4" />}
                                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            
                            {/* Mode Description */}
                            <div className="p-2 bg-slate-700/50 rounded-lg">
                                <p className="text-[10px] text-slate-400">
                                    {formData.isolation_mode === 'shared' && '🌐 All students share the same network segment'}
                                    {formData.isolation_mode === 'isolated' && '🔒 Each student gets a unique VLAN (auto-allocated)'}
                                    {formData.isolation_mode === 'tagged' && '🏷️ Static VLAN tagging on infrastructure'}
                                </p>
                            </div>
                        </div>

                        {/* VLAN ID (for tagged mode) */}
                        {formData.isolation_mode === 'tagged' && (
                            <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-2">
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Tag className="w-3 h-3" />
                                    VLAN ID
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={4094}
                                    value={formData.vlan_id || ''}
                                    onChange={e => setFormData({...formData, vlan_id: parseInt(e.target.value) || undefined})}
                                    placeholder="1-4094"
                                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                            </div>
                        )}
                    </>
                )}

                {/* CONNECTIONS TAB */}
                {activeTab === 'connections' && (
                    <div className="space-y-2">
                        {connectedVMs.length === 0 ? (
                            <div className="text-center py-8">
                                <Server className="w-12 h-12 text-slate-700 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">No VMs connected</p>
                                <p className="text-[10px] text-slate-600 mt-1">Drag from NIC to this network to connect</p>
                            </div>
                        ) : (
                            connectedVMs.map((vm, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                            <Server className="w-4 h-4 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-white">{vm.name}</p>
                                            <p className="text-[10px] text-slate-500">{vm.nicName}</p>
                                        </div>
                                    </div>
                                    <div 
                                        className="w-2 h-2 rounded-full" 
                                        style={{ backgroundColor: formData.color }}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Footer with Save Button */}
            {hasChanges && (
                <div className="p-3 border-t border-white/10">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                    >
                        {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Apply Changes
                    </button>
                </div>
            )}
        </div>
    );
};

export default NetworkSettingsPanel;
