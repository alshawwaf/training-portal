import React, { useState, useEffect, useMemo } from 'react';
import { 
  Server, Database, Monitor, RefreshCw, Search, 
  PowerOff, Pause, Trash2, Copy, Play, RotateCcw,
  Cpu, MemoryStick, Globe, Box, Container,
  CheckCircle2, Clock, Grid3X3, List, X
} from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { VMwareIcon, ProxmoxIcon } from '../components/ProviderIcons';
import Modal from '../components/Modal';
import clsx from 'clsx';

// Types
interface ResourceInfo {
  name: string;
  moid: string;
  power_state: string;
  guest?: string;
  guest_os?: string;
  num_cpu?: number;
  cpu?: number;
  memory_mb: number;
  is_template: boolean;
  node?: string;
  type?: string;
}

interface ConnectionInfo {
  id: number;
  name: string;
  provider: string;
  host: string;
  is_active: boolean;
}

const InfrastructureExplorer: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // State
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ 
    status: string; 
    message: string; 
    count?: number;
    details?: {
      vms: number;
      templates: number;
      containers: number;
      running: number;
      stopped: number;
      provider: string;
      host: string;
      syncDuration?: number;
    };
  }>({ status: 'idle', message: '' });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResource, setSelectedResource] = useState<ResourceInfo | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'vm' | 'template' | 'container'>('template');
  
  // Inventory data
  const [resources, setResources] = useState<ResourceInfo[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => { loadConnections(); }, []);
  useEffect(() => { 
    if (selectedConnection) {
      // Clear old data immediately when switching connections
      setResources([]);
      setLastSync(null);
      setSelectedResource(null);
      loadInventory(); 
    } else {
      // Clear everything when deselecting
      setResources([]);
      setLastSync(null);
      setSelectedResource(null);
    }
  }, [selectedConnection]);

  const loadConnections = async () => {
    try {
      const res = await api.get('/infrastructure-connections/');
      setConnections(res.data);
    } catch (err) { console.error('Failed to load connections:', err); }
  };

  const loadInventory = async () => {
    if (!selectedConnection) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/infrastructure-connections/${selectedConnection}/inventory`);
      if (res.data.success && res.data.data) {
        const data = res.data.data;
        setResources(data.vms || []);
        setLastSync(data.last_sync || null);
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to load inventory', 'error');
    } finally { setIsLoading(false); }
  };

  const syncInventory = async () => {
    if (!selectedConnection) return;
    const startTime = Date.now();
    const conn = connections.find(c => c.id === selectedConnection);
    
    setIsSyncing(true);
    setSyncModalOpen(true);
    setSyncProgress({ status: 'syncing', message: `Connecting to ${conn?.name || 'infrastructure'}...` });
    
    try {
      await new Promise(r => setTimeout(r, 500)); // Brief pause for UX
      setSyncProgress({ status: 'syncing', message: 'Fetching VMs and templates...' });
      const result = await api.post(`/infrastructure-connections/${selectedConnection}/sync`);
      
      // Load updated inventory to get detailed stats
      const inventoryRes = await api.get(`/infrastructure-connections/${selectedConnection}/inventory`);
      const allVms = inventoryRes.data.data?.vms || [];
      
      // Calculate detailed breakdown
      const vms = allVms.filter((r: ResourceInfo) => !r.is_template && r.type !== 'lxc').length;
      const templates = allVms.filter((r: ResourceInfo) => r.is_template).length;
      const containers = allVms.filter((r: ResourceInfo) => r.type === 'lxc').length;
      const running = allVms.filter((r: ResourceInfo) => r.power_state === 'poweredOn' || r.power_state === 'running').length;
      const stopped = allVms.filter((r: ResourceInfo) => r.power_state === 'poweredOff' || r.power_state === 'stopped').length;
      
      const syncDuration = (Date.now() - startTime) / 1000;
      
      setSyncProgress({ 
        status: 'success', 
        message: `Sync completed in ${syncDuration.toFixed(1)}s`, 
        count: result.data.vm_count || allVms.length,
        details: {
          vms,
          templates,
          containers,
          running,
          stopped,
          provider: conn?.provider || 'Unknown',
          host: conn?.host || 'Unknown',
          syncDuration
        }
      });
      
      setResources(allVms);
      setLastSync(inventoryRes.data.data?.last_sync);
      
      // Auto-close after 3 seconds on success
      setTimeout(() => {
        setSyncModalOpen(false);
        setSyncProgress({ status: 'idle', message: '' });
      }, 3000);
      
    } catch (err: any) {
      setSyncProgress({ 
        status: 'error', 
        message: err.response?.data?.detail || 'Sync failed. Please check connection settings.',
        details: {
          vms: 0,
          templates: 0,
          containers: 0,
          running: 0,
          stopped: 0,
          provider: conn?.provider || 'Unknown',
          host: conn?.host || 'Unknown'
        }
      });
    } finally { 
      setIsSyncing(false); 
    }
  };


  // Toggle connection selection
  const handleConnectionClick = (connId: number) => {
    if (selectedConnection === connId) {
      setSelectedConnection(null); // Deselect
    } else {
      setSelectedConnection(connId); // Select
    }
  };

  // Current connection
  const currentConnection = useMemo(() => 
    connections.find(c => c.id === selectedConnection), 
    [connections, selectedConnection]
  );

  // Filtered resources
  const filteredResources = useMemo(() => {
    return resources.filter(r => {
      if (searchTerm && !r.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterType === 'template' && !r.is_template) return false;
      if (filterType === 'vm' && (r.is_template || r.type === 'lxc')) return false;
      if (filterType === 'container' && r.type !== 'lxc') return false;
      return true;
    });
  }, [resources, searchTerm, filterType]);

  // Stats
  const stats = useMemo(() => {
    const running = resources.filter(r => r.power_state === 'poweredOn' || r.power_state === 'running').length;
    const stopped = resources.filter(r => r.power_state === 'poweredOff' || r.power_state === 'stopped').length;
    const templates = resources.filter(r => r.is_template).length;
    const containers = resources.filter(r => r.type === 'lxc').length;
    return { total: resources.length, running, stopped, templates, containers };
  }, [resources]);

  // VM Actions
  const handleVmPower = async (resource: ResourceInfo, action: 'start' | 'stop' | 'suspend' | 'reset') => {
    if (!selectedConnection || !isAdmin) return;
    setActionLoading(`${action}-${resource.moid}`);
    try {
      await api.post(`/infrastructure-connections/${selectedConnection}/vms/${resource.moid}/power`, { action });
      showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} initiated`, 'success');
      setTimeout(loadInventory, 2000);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Action failed', 'error');
    } finally { setActionLoading(null); }
  };

  const handleVmDelete = async (resource: ResourceInfo) => {
    if (!selectedConnection || !isAdmin) return;
    if (!confirm(`Delete "${resource.name}"? This cannot be undone.`)) return;
    setActionLoading(`delete-${resource.moid}`);
    try {
      await api.delete(`/infrastructure-connections/${selectedConnection}/vms/${resource.moid}`);
      showToast('Resource deleted', 'success');
      setSelectedResource(null);
      await loadInventory();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Delete failed', 'error');
    } finally { setActionLoading(null); }
  };

  const handleVmClone = async (resource: ResourceInfo) => {
    if (!selectedConnection || !isAdmin) return;
    const newName = prompt('Enter name for cloned VM:', `${resource.name}-clone`);
    if (!newName) return;
    setActionLoading(`clone-${resource.moid}`);
    try {
      await api.post(`/infrastructure-connections/${selectedConnection}/vms/${resource.moid}/clone`, { new_name: newName });
      showToast('Clone initiated', 'success');
      setTimeout(loadInventory, 5000);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Clone failed', 'error');
    } finally { setActionLoading(null); }
  };

  const getProviderIcon = (provider: string) => {
    if (provider?.toLowerCase().includes('proxmox')) return <ProxmoxIcon className="w-5 h-5" />;
    return <VMwareIcon className="w-5 h-5" />;
  };

  const isPoweredOn = (r: ResourceInfo) => r.power_state === 'poweredOn' || r.power_state === 'running';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">Template Library</h1>
          <p className="text-secondary text-sm font-medium">Browse and manage your vSphere/Proxmox template images</p>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-xs text-secondary">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Last sync: {new Date(lastSync).toLocaleString()}
            </span>
          )}
          <button
            onClick={syncInventory}
            disabled={!selectedConnection || isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 shadow-lg shadow-violet-500/20"
          >
            <RefreshCw className={clsx("w-4 h-4", isSyncing && "animate-spin")} />
            Sync
          </button>
        </div>
      </div>

      {/* Connection Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {connections.map(conn => (
          <button
            key={conn.id}
            onClick={() => handleConnectionClick(conn.id)}
            className={clsx(
              "group relative p-4 rounded-2xl border transition-all duration-300 text-left",
              selectedConnection === conn.id
                ? "bg-gradient-to-br from-violet-500/20 to-purple-500/20 border-violet-500/50 ring-2 ring-violet-500/30"
                : "glass border-theme hover:border-violet-500/30 hover:bg-slate-800/50"
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={clsx(
                "p-2 rounded-xl transition-colors",
                selectedConnection === conn.id ? "bg-violet-500/20" : "bg-slate-800"
              )}>
                {getProviderIcon(conn.provider)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-primary text-sm truncate">{conn.name}</p>
                <p className="text-[10px] text-secondary truncate">{conn.host}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={clsx(
                "text-[10px] font-bold uppercase tracking-wider",
                conn.provider.toLowerCase().includes('proxmox') ? "text-orange-400" : "text-blue-400"
              )}>
                {conn.provider}
              </span>
              {conn.is_active && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>
          </button>
        ))}
        {connections.length === 0 && (
          <div className="col-span-full text-center py-8 text-secondary">
            <Server className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No connections configured</p>
            <p className="text-xs mt-1">Add a connection in Settings → On-Premise</p>
          </div>
        )}
      </div>

      {/* Stats Bar - Only show when connection selected */}
      {selectedConnection && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Templates" value={stats.templates} icon={<Copy className="w-5 h-5" />} color="indigo" />
          <StatCard label="VMs (Read-only)" value={stats.total - stats.templates - stats.containers} icon={<Monitor className="w-5 h-5" />} color="slate" />
          <StatCard label="Containers" value={stats.containers} icon={<Container className="w-5 h-5" />} color="orange" />
        </div>
      )}

      {/* Filters & Search - Only show when connection selected */}
      {selectedConnection && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 glass border border-theme rounded-xl text-primary placeholder:text-secondary focus:outline-none focus:border-violet-500/50 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2 glass border border-theme rounded-xl p-1">
            <FilterButton active={filterType === 'template'} onClick={() => setFilterType('template')}>Templates</FilterButton>
            <FilterButton active={filterType === 'all'} onClick={() => setFilterType('all')}>All Resources</FilterButton>
          </div>

          <div className="flex items-center gap-1 glass border border-theme rounded-xl p-1 ml-auto">
            <button onClick={() => setViewMode('grid')} className={clsx("p-2 rounded-lg transition-colors", viewMode === 'grid' ? "bg-violet-500/20 text-violet-400" : "text-secondary hover:text-primary")}>
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={clsx("p-2 rounded-lg transition-colors", viewMode === 'list' ? "bg-violet-500/20 text-violet-400" : "text-secondary hover:text-primary")}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Resource Grid/List - Only show when connection selected */}
      {selectedConnection && (
        <div className={clsx(
          viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "space-y-2"
        )}>
          {isLoading ? (
            <div className="col-span-full flex items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : filteredResources.length > 0 ? (
            filteredResources.map(resource => (
              viewMode === 'grid' 
                ? <ResourceCard key={resource.moid} resource={resource} isAdmin={isAdmin} onSelect={setSelectedResource} isPoweredOn={isPoweredOn(resource)} />
                : <ResourceRow key={resource.moid} resource={resource} isAdmin={isAdmin} onSelect={setSelectedResource} isPoweredOn={isPoweredOn(resource)} onPower={handleVmPower} actionLoading={actionLoading} />
            ))
          ) : (
            <div className="col-span-full text-center py-16 text-secondary">
              <Box className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-semibold">No resources found</p>
              <p className="text-xs mt-1">Try adjusting your filters or sync the inventory</p>
            </div>
          )}
        </div>
      )}

      {/* Resource Detail Modal */}
      {selectedResource && (
        <ResourceDetailModal
          resource={selectedResource}
          provider={currentConnection?.provider || ''}
          isAdmin={isAdmin}
          onClose={() => setSelectedResource(null)}
          onPower={handleVmPower}
          onClone={handleVmClone}
          onDelete={handleVmDelete}
          actionLoading={actionLoading}
        />
      )}

      {/* Sync Progress Modal */}
      <Modal
        isOpen={syncModalOpen}
        onClose={() => !isSyncing && setSyncModalOpen(false)}
        title="Syncing Infrastructure"
        icon={<RefreshCw className={clsx("w-5 h-5 text-violet-500", isSyncing && "animate-spin")} />}
        maxWidth="sm"
      >
        <div className="py-6 text-center space-y-4">
          {syncProgress.status === 'syncing' && (
            <>
              <div className="w-16 h-16 mx-auto rounded-full bg-violet-500/10 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
              </div>
              <p className="text-primary font-medium">{syncProgress.message}</p>
              <p className="text-xs text-secondary">This may take a moment depending on your infrastructure size...</p>
            </>
          )}
          
          {syncProgress.status === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <p className="text-primary font-medium">{syncProgress.message}</p>
              <p className="text-3xl font-black text-emerald-500">{syncProgress.count} resources</p>
              
              {/* Detailed Breakdown */}
              {syncProgress.details && (
                <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700 text-left">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-3">Resource Breakdown</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <p className="text-lg font-black text-blue-400">{syncProgress.details.vms}</p>
                      <p className="text-[10px] text-secondary">VMs</p>
                    </div>
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                      <p className="text-lg font-black text-indigo-400">{syncProgress.details.templates}</p>
                      <p className="text-[10px] text-secondary">Templates</p>
                    </div>
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <p className="text-lg font-black text-orange-400">{syncProgress.details.containers}</p>
                      <p className="text-[10px] text-secondary">Containers</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                      <span className="text-xs text-emerald-400 font-semibold">{syncProgress.details.running} Running</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-slate-500" />
                      <span className="text-xs text-slate-400 font-semibold">{syncProgress.details.stopped} Stopped</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-700 text-[10px] text-secondary">
                    <p><span className="text-slate-500">Provider:</span> <span className="text-cyan-400">{syncProgress.details.provider}</span></p>
                    <p><span className="text-slate-500">Host:</span> <span className="text-cyan-400">{syncProgress.details.host}</span></p>
                  </div>
                </div>
              )}
            </>
          )}
          
          {syncProgress.status === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center">
                <X className="w-8 h-8 text-rose-500" />
              </div>
              <p className="text-rose-400 font-medium">{syncProgress.message}</p>
              
              {/* Connection Info on Error */}
              {syncProgress.details && (
                <div className="mt-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700 text-left text-[10px]">
                  <p className="text-slate-500">Provider: <span className="text-cyan-400">{syncProgress.details.provider}</span></p>
                  <p className="text-slate-500">Host: <span className="text-cyan-400">{syncProgress.details.host}</span></p>
                </div>
              )}
              
              <button
                onClick={() => setSyncModalOpen(false)}
                className="mt-4 px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-semibold transition-colors"
              >
                Close
              </button>
            </>
          )}

        </div>
      </Modal>
    </div>
  );
};

// Stat Card Component
const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className="glass border border-theme rounded-2xl p-4">
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-xl bg-${color}-500/10 text-${color}-400`}>{icon}</div>
      <div>
        <p className="text-2xl font-black text-primary">{value}</p>
        <p className="text-xs text-secondary font-medium">{label}</p>
      </div>
    </div>
  </div>
);

// Filter Button Component
const FilterButton: React.FC<{ active: boolean; onClick: () => void; color?: string; children: React.ReactNode }> = ({ active, onClick, color, children }) => (
  <button
    onClick={onClick}
    className={clsx(
      "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
      active 
        ? color === 'emerald' ? "bg-emerald-500/20 text-emerald-400" 
          : color === 'rose' ? "bg-rose-500/20 text-rose-400"
          : "bg-violet-500/20 text-violet-400"
        : "text-secondary hover:text-primary"
    )}
  >
    {children}
  </button>
);

// Resource Card Component
const ResourceCard: React.FC<{ resource: ResourceInfo; isAdmin: boolean; onSelect: (r: ResourceInfo) => void; isPoweredOn: boolean }> = ({ resource, onSelect, isPoweredOn }) => (
  <button
    onClick={() => onSelect(resource)}
    className="group glass border border-theme rounded-2xl p-4 text-left hover:border-violet-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/10"
  >
    <div className="flex items-start justify-between mb-3">
      <div className={clsx(
        "p-2 rounded-xl",
        resource.is_template ? "bg-indigo-500/10 text-indigo-400" :
        resource.type === 'lxc' ? "bg-orange-500/10 text-orange-400" :
        isPoweredOn ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700 text-slate-400"
      )}>
        {resource.is_template ? <Copy className="w-5 h-5" /> : 
         resource.type === 'lxc' ? <Container className="w-5 h-5" /> :
         <Monitor className="w-5 h-5" />}
      </div>
      <div className={clsx(
        "w-2.5 h-2.5 rounded-full",
        isPoweredOn ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" : "bg-slate-600"
      )} />
    </div>
    <h3 className="font-bold text-primary text-sm mb-1 truncate group-hover:text-violet-400 transition-colors">
      {resource.name.replace(/_/g, ' ')}
    </h3>
    <div className="flex items-center gap-2 text-[10px] text-secondary">
      {resource.node && <span className="px-1.5 py-0.5 rounded bg-slate-800">{resource.node}</span>}
      <span>{resource.type === 'lxc' ? 'Container' : resource.is_template ? 'Template' : 'VM'}</span>
    </div>
    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-theme text-xs text-secondary">
      <span className="flex items-center gap-1">
        <Cpu className="w-3.5 h-3.5 text-blue-400" />
        {resource.num_cpu || resource.cpu || 1}
      </span>
      <span className="flex items-center gap-1">
        <MemoryStick className="w-3.5 h-3.5 text-purple-400" />
        {((resource.memory_mb || 1024) / 1024).toFixed(1)}GB
      </span>
    </div>
  </button>
);

// Resource Row Component
const ResourceRow: React.FC<{ 
  resource: ResourceInfo; 
  isAdmin: boolean; 
  onSelect: (r: ResourceInfo) => void; 
  isPoweredOn: boolean;
  onPower: (r: ResourceInfo, action: 'start' | 'stop') => void;
  actionLoading: string | null;
}> = ({ resource, onSelect, isPoweredOn, onPower, actionLoading }) => (
  <div className="group glass border border-theme rounded-xl p-3 flex items-center gap-4 hover:border-violet-500/30 transition-colors">
    <div className={clsx(
      "p-2 rounded-lg",
      isPoweredOn ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700 text-slate-400"
    )}>
      {resource.type === 'lxc' ? <Container className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
    </div>
    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(resource)}>
      <p className="font-semibold text-primary text-sm truncate group-hover:text-violet-400">{resource.name}</p>
      <p className="text-xs text-secondary">{resource.node || 'Unknown node'} • {resource.type === 'lxc' ? 'Container' : 'VM'}</p>
    </div>
    <div className="flex items-center gap-3 text-xs text-secondary">
      <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" />{resource.num_cpu || 1}</span>
      <span className="flex items-center gap-1"><MemoryStick className="w-3.5 h-3.5" />{((resource.memory_mb || 1024) / 1024).toFixed(1)}GB</span>
    </div>
    <div className={clsx("px-2 py-1 rounded-lg text-xs font-semibold", isPoweredOn ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700 text-slate-400")}>
      {isPoweredOn ? 'Running' : 'Stopped'}
    </div>
    <button
      onClick={(e) => { e.stopPropagation(); onPower(resource, isPoweredOn ? 'stop' : 'start'); }}
      disabled={resource.is_template || !!actionLoading}
      className={clsx(
        "p-2 rounded-lg transition-colors disabled:opacity-50",
        isPoweredOn ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white"
      )}
    >
      {actionLoading?.includes(resource.moid) ? <RefreshCw className="w-4 h-4 animate-spin" /> : isPoweredOn ? <PowerOff className="w-4 h-4" /> : <Play className="w-4 h-4" />}
    </button>
  </div>
);

// Resource Detail Modal
const ResourceDetailModal: React.FC<{
  resource: ResourceInfo;
  provider: string;
  isAdmin: boolean;
  onClose: () => void;
  onPower: (r: ResourceInfo, action: 'start' | 'stop' | 'suspend' | 'reset') => void;
  onClone: (r: ResourceInfo) => void;
  onDelete: (r: ResourceInfo) => void;
  actionLoading: string | null;
}> = ({ resource, provider, isAdmin, onClose, onPower, onClone, onDelete, actionLoading }) => {
  const isPoweredOn = resource.power_state === 'poweredOn' || resource.power_state === 'running';
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass border border-theme rounded-3xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-theme p-6">
          <div className="flex items-start gap-4">
            <div className={clsx(
              "p-3 rounded-2xl",
              resource.is_template ? "bg-indigo-500/20 text-indigo-400" :
              isPoweredOn ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400"
            )}>
              {resource.type === 'lxc' ? <Container className="w-8 h-8" /> : 
               resource.is_template ? <Copy className="w-8 h-8" /> : 
               <Monitor className="w-8 h-8" />}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black text-primary">{resource.name.replace(/_/g, ' ')}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={clsx("px-2 py-0.5 rounded-lg text-xs font-bold", isPoweredOn ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400")}>
                  {isPoweredOn ? 'Running' : 'Stopped'}
                </span>
                <span className="text-xs text-secondary">{provider}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailItem icon={<Cpu className="w-4 h-4 text-blue-400" />} label="vCPU" value={`${resource.num_cpu || resource.cpu || 1} cores`} />
            <DetailItem icon={<MemoryStick className="w-4 h-4 text-purple-400" />} label="Memory" value={`${((resource.memory_mb || 1024) / 1024).toFixed(1)} GB`} />
            <DetailItem icon={<Globe className="w-4 h-4 text-cyan-400" />} label="Guest OS" value={resource.guest || resource.guest_os || 'Unknown'} />
            <DetailItem icon={<Server className="w-4 h-4 text-amber-400" />} label="Node" value={resource.node || 'N/A'} />
            <DetailItem icon={<Box className="w-4 h-4 text-pink-400" />} label="Type" value={resource.type === 'lxc' ? 'LXC Container' : resource.is_template ? 'Template' : 'Virtual Machine'} />
            <DetailItem icon={<Database className="w-4 h-4 text-indigo-400" />} label="ID" value={resource.moid} />
          </div>

          {/* Actions */}
          {isAdmin && (
            <div className="pt-4 border-t border-theme">
              <p className="text-xs text-secondary font-bold uppercase tracking-wider mb-3">Actions</p>
              <div className="flex flex-wrap gap-2">
                {resource.is_template ? (
                  <ActionBtn icon={Copy} label="Clone to VM" color="indigo" loading={actionLoading === `clone-${resource.moid}`} onClick={() => onClone(resource)} />
                ) : (
                  <>
                    {!isPoweredOn ? (
                      <ActionBtn icon={Play} label="Power On" color="emerald" loading={actionLoading === `start-${resource.moid}`} onClick={() => onPower(resource, 'start')} />
                    ) : (
                      <>
                        <ActionBtn icon={PowerOff} label="Power Off" color="rose" loading={actionLoading === `stop-${resource.moid}`} onClick={() => onPower(resource, 'stop')} />
                        <ActionBtn icon={RotateCcw} label="Reset" color="amber" loading={actionLoading === `reset-${resource.moid}`} onClick={() => onPower(resource, 'reset')} />
                        <ActionBtn icon={Pause} label="Suspend" color="orange" loading={actionLoading === `suspend-${resource.moid}`} onClick={() => onPower(resource, 'suspend')} />
                      </>
                    )}
                    <ActionBtn icon={Copy} label="Clone" color="indigo" loading={actionLoading === `clone-${resource.moid}`} onClick={() => onClone(resource)} />
                    <ActionBtn icon={Trash2} label="Delete" color="rose" loading={actionLoading === `delete-${resource.moid}`} onClick={() => onDelete(resource)} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-theme p-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 glass border border-theme rounded-xl text-sm font-semibold text-secondary hover:text-primary transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Detail Item
const DetailItem: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
    <div className="p-2 rounded-lg bg-slate-900">{icon}</div>
    <div>
      <p className="text-[10px] text-secondary uppercase tracking-wider font-bold">{label}</p>
      <p className="text-sm text-primary font-medium truncate">{value}</p>
    </div>
  </div>
);

// Action Button
const ActionBtn: React.FC<{ icon: React.ElementType; label: string; color: string; loading?: boolean; onClick: () => void }> = ({ icon: Icon, label, color, loading, onClick }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={clsx(
      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
      `bg-${color}-500/10 text-${color}-400 hover:bg-${color}-500 hover:text-white`,
      loading && "opacity-50"
    )}
  >
    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
    {label}
  </button>
);

export default InfrastructureExplorer;
