import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Server, Database, HardDrive, Network, Monitor, Folder,
  ChevronDown, ChevronRight, RefreshCw, Search, X, Minus, Square, 
  Power, PowerOff, Pause, Trash2, Copy, Play, RotateCcw,
  Cpu, MemoryStick, Globe, Info
} from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

// Types
interface DatacenterInfo { name: string; status: string; }
interface ClusterInfo { name: string; hosts: number; status: string; }
interface HostInfo { name: string; state: string; status: string; }
interface NetworkInfo { name: string; type: string; }
interface VMInfo { name: string; moid: string; power_state: string; guest_os: string; cpu: number; memory_mb: number; is_template: boolean; }
interface ConnectionInfo { id: number; name: string; provider: string; host: string; is_active: boolean; }

type TreeNodeType = 'connection' | 'folder' | 'datacenter' | 'cluster' | 'host' | 'network' | 'vm' | 'datastore';

interface TreeNode {
  id: string;
  name: string;
  type: TreeNodeType;
  icon?: React.ReactNode;
  children?: TreeNode[];
  data?: any;
  count?: number;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(280);
  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Inventory data
  const [datacenters, setDatacenters] = useState<DatacenterInfo[]>([]);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [vms, setVms] = useState<VMInfo[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Resizable panel handlers
  const handleMouseDown = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    setPanelWidth(Math.min(Math.max(180, newWidth), 500));
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => { loadConnections(); }, []);
  useEffect(() => { if (selectedConnection) loadInventory(); }, [selectedConnection]);

  const loadConnections = async () => {
    try {
      const res = await api.get('/infrastructure-connections/');
      const vsphereConnections = res.data.filter((c: ConnectionInfo) => c.provider?.toLowerCase() === 'vsphere');
      setConnections(vsphereConnections);
      const activeConn = vsphereConnections.find((c: ConnectionInfo) => c.is_active);
      if (activeConn) setSelectedConnection(activeConn.id);
      else if (vsphereConnections.length > 0) setSelectedConnection(vsphereConnections[0].id);
    } catch (err) { console.error('Failed to load connections:', err); }
  };

  const loadInventory = async () => {
    if (!selectedConnection) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/infrastructure-connections/${selectedConnection}/inventory`);
      if (res.data.success && res.data.data) {
        const data = res.data.data;
        setDatacenters(data.datacenters || []);
        setClusters(data.clusters || []);
        setHosts(data.hosts || []);
        setNetworks(data.networks || []);
        setVms(data.vms || []);
        setLastSync(data.last_sync || null);
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to load inventory', 'error');
    } finally { setIsLoading(false); }
  };

  const syncInventory = async () => {
    if (!selectedConnection) return;
    setIsSyncing(true);
    try {
      await api.post(`/infrastructure-connections/${selectedConnection}/sync`);
      await loadInventory();
      showToast('Inventory synced', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Sync failed', 'error');
    } finally { setIsSyncing(false); }
  };

  // VM Actions
  const handleVmPower = async (vm: VMInfo, action: 'start' | 'stop' | 'suspend' | 'reset') => {
    if (!selectedConnection || !isAdmin) return;
    setActionLoading(`${action}-${vm.moid}`);
    try {
      await api.post(`/infrastructure-connections/${selectedConnection}/vms/${vm.moid}/power`, { action });
      showToast(`VM ${action} initiated`, 'success');
      setTimeout(loadInventory, 2000);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Action failed', 'error');
    } finally { setActionLoading(null); }
  };

  const handleVmClone = async (vm: VMInfo) => {
    if (!selectedConnection || !isAdmin) return;
    const newName = prompt('Enter name for cloned VM:', `${vm.name}-clone`);
    if (!newName) return;
    setActionLoading(`clone-${vm.moid}`);
    try {
      await api.post(`/infrastructure-connections/${selectedConnection}/vms/${vm.moid}/clone`, { new_name: newName });
      showToast('Clone initiated', 'success');
      setTimeout(loadInventory, 5000);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Clone failed', 'error');
    } finally { setActionLoading(null); }
  };

  const handleVmDelete = async (vm: VMInfo) => {
    if (!selectedConnection || !isAdmin) return;
    if (!confirm(`Delete "${vm.name}"? This cannot be undone.`)) return;
    setActionLoading(`delete-${vm.moid}`);
    try {
      await api.delete(`/infrastructure-connections/${selectedConnection}/vms/${vm.moid}`);
      showToast('VM deleted', 'success');
      setSelectedNode(null);
      await loadInventory();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Delete failed', 'error');
    } finally { setActionLoading(null); }
  };

  // Build tree structure
  const treeData = useMemo((): TreeNode[] => {
    if (!selectedConnection) return [];
    const conn = connections.find(c => c.id === selectedConnection);
    if (!conn) return [];

    const filterBySearch = <T extends { name: string }>(items: T[]): T[] => {
      if (!searchTerm) return items;
      return items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
    };

    const filteredDCs = filterBySearch(datacenters);
    const filteredClusters = filterBySearch(clusters);
    const filteredHosts = filterBySearch(hosts);
    const filteredNetworks = filterBySearch(networks);
    const filteredVMs = filterBySearch(vms);

    return [{
      id: `conn-${conn.id}`,
      name: conn.name,
      type: 'connection',
      icon: <Server className="w-4 h-4 text-cyan-400" />,
      children: [
        {
          id: 'datacenters', name: 'Datacenters', type: 'folder', count: filteredDCs.length,
          icon: <Database className="w-4 h-4 text-purple-400" />,
          children: filteredDCs.map((dc, i) => ({
            id: `dc-${i}`, name: dc.name, type: 'datacenter' as TreeNodeType, data: dc,
            icon: <Database className="w-4 h-4 text-purple-400" />
          }))
        },
        {
          id: 'clusters', name: 'Clusters', type: 'folder', count: filteredClusters.length,
          icon: <Server className="w-4 h-4 text-blue-400" />,
          children: filteredClusters.map((c, i) => ({
            id: `cluster-${i}`, name: c.name, type: 'cluster' as TreeNodeType, data: c,
            icon: <Server className="w-4 h-4 text-blue-400" />
          }))
        },
        {
          id: 'hosts', name: 'ESXi Hosts', type: 'folder', count: filteredHosts.length,
          icon: <HardDrive className="w-4 h-4 text-cyan-400" />,
          children: filteredHosts.map((h, i) => ({
            id: `host-${i}`, name: h.name, type: 'host' as TreeNodeType, data: h,
            icon: <HardDrive className="w-4 h-4 text-cyan-400" />
          }))
        },
        {
          id: 'vms', name: 'Virtual Machines', type: 'folder', count: filteredVMs.length,
          icon: <Monitor className="w-4 h-4 text-amber-400" />,
          children: filteredVMs.map(vm => ({
            id: `vm-${vm.moid}`, name: vm.name, type: 'vm' as TreeNodeType, data: vm,
            icon: vm.is_template 
              ? <Copy className="w-4 h-4 text-indigo-400" />
              : <Monitor className={clsx("w-4 h-4", vm.power_state === 'poweredOn' ? "text-green-400" : "text-slate-500")} />
          }))
        },
        {
          id: 'networks', name: 'Networks', type: 'folder', count: filteredNetworks.length,
          icon: <Network className="w-4 h-4 text-green-400" />,
          children: filteredNetworks.map((n, i) => ({
            id: `net-${i}`, name: n.name, type: 'network' as TreeNodeType, data: n,
            icon: <Network className="w-4 h-4 text-green-400" />
          }))
        }
      ]
    }];
  }, [selectedConnection, connections, datacenters, clusters, hosts, networks, vms, searchTerm]);

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTreeNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode?.id === node.id;

    return (
      <div key={node.id}>
        <div
          className={clsx(
            "flex items-center gap-1 px-2 py-1 cursor-pointer rounded transition-colors",
            isSelected ? "bg-blue-600/30 text-white" : "hover:bg-slate-700/50 text-slate-300"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => { setSelectedNode(node); if (hasChildren) toggleNode(node.id); }}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }} className="p-0.5">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
            </button>
          ) : <span className="w-4" />}
          {node.icon}
          <span className="text-sm truncate flex-1">{node.name.replace(/_/g, ' ')}</span>
          {node.count !== undefined && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{node.count}</span>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>{node.children!.map(child => renderTreeNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  const renderDetailsPanel = () => {
    if (!selectedNode) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500">
          <Info className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">Select an item to view details</p>
        </div>
      );
    }

    const { type, data, name, children } = selectedNode;

    // FOLDER VIEW - Show list of child items
    if (type === 'folder' && children && children.length > 0) {
      return (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{name}</h3>
            <span className="text-xs text-slate-500">{children.length} items</span>
          </div>
          
          <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto">
            {children.map(child => (
              <div
                key={child.id}
                onClick={() => setSelectedNode(child)}
                className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg cursor-pointer transition-colors group"
              >
                {child.icon}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate group-hover:text-blue-400">
                    {child.name.replace(/_/g, ' ')}
                  </p>
                  {child.data && (
                    <p className="text-xs text-slate-500 truncate">
                      {child.data.status && `Status: ${child.data.status}`}
                      {child.data.state && `State: ${child.data.state}`}
                      {child.data.type && `Type: ${child.data.type}`}
                      {child.data.power_state && (child.data.power_state === 'poweredOn' ? '● Online' : '○ Offline')}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // VM DETAILS
    if (type === 'vm' && data) {
      const vm = data as VMInfo;
      const isPoweredOn = vm.power_state === 'poweredOn';
      return (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{name.replace(/_/g, ' ')}</h3>
            {vm.is_template && <span className="px-2 py-1 text-xs bg-indigo-500/20 text-indigo-400 rounded">Template</span>}
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Power className={clsx("w-4 h-4", isPoweredOn ? "text-green-400" : "text-red-400")} />
              <span>{isPoweredOn ? 'Powered On' : 'Powered Off'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Globe className="w-4 h-4" />
              <span className="truncate">{vm.guest_os || 'Unknown OS'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span>{vm.cpu} vCPU</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <MemoryStick className="w-4 h-4 text-purple-400" />
              <span>{(vm.memory_mb / 1024).toFixed(1)} GB RAM</span>
            </div>
          </div>

          {/* Collapsible Details */}
          <DetailSection title="Identifiers">
            <DetailRow label="MOID" value={vm.moid} />
            <DetailRow label="Name" value={vm.name} />
          </DetailSection>

          {/* Admin Actions */}
          {isAdmin && !vm.is_template && (
            <div className="pt-3 border-t border-slate-700 space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">Actions</p>
              <div className="flex flex-wrap gap-2">
                {!isPoweredOn ? (
                  <ActionButton icon={Play} label="Power On" color="green" loading={actionLoading === `start-${vm.moid}`} onClick={() => handleVmPower(vm, 'start')} />
                ) : (
                  <>
                    <ActionButton icon={PowerOff} label="Power Off" color="red" loading={actionLoading === `stop-${vm.moid}`} onClick={() => handleVmPower(vm, 'stop')} />
                    <ActionButton icon={RotateCcw} label="Reset" color="amber" loading={actionLoading === `reset-${vm.moid}`} onClick={() => handleVmPower(vm, 'reset')} />
                    <ActionButton icon={Pause} label="Suspend" color="orange" loading={actionLoading === `suspend-${vm.moid}`} onClick={() => handleVmPower(vm, 'suspend')} />
                  </>
                )}
                <ActionButton icon={Copy} label="Clone" color="blue" loading={actionLoading === `clone-${vm.moid}`} onClick={() => handleVmClone(vm)} />
                <ActionButton icon={Trash2} label="Delete" color="red" loading={actionLoading === `delete-${vm.moid}`} onClick={() => handleVmDelete(vm)} />
              </div>
            </div>
          )}
        </div>
      );
    }

    // DATACENTER DETAILS
    if (type === 'datacenter' && data) {
      return (
        <div className="p-4 space-y-4">
          <h3 className="text-lg font-bold text-white">{name.replace(/_/g, ' ')}</h3>
          <DetailSection title="Properties" defaultOpen>
            <DetailRow label="Name" value={data.name} />
            <DetailRow label="Status" value={data.status} badge />
          </DetailSection>
        </div>
      );
    }

    // CLUSTER DETAILS
    if (type === 'cluster' && data) {
      return (
        <div className="p-4 space-y-4">
          <h3 className="text-lg font-bold text-white">{name.replace(/_/g, ' ')}</h3>
          <DetailSection title="Properties" defaultOpen>
            <DetailRow label="Name" value={data.name} />
            <DetailRow label="Hosts" value={data.hosts} />
            <DetailRow label="Status" value={data.status} badge />
          </DetailSection>
        </div>
      );
    }

    // HOST DETAILS
    if (type === 'host' && data) {
      return (
        <div className="p-4 space-y-4">
          <h3 className="text-lg font-bold text-white">{name.replace(/_/g, ' ')}</h3>
          <DetailSection title="Properties" defaultOpen>
            <DetailRow label="Name" value={data.name} />
            <DetailRow label="State" value={data.state} />
            <DetailRow label="Status" value={data.status} badge />
          </DetailSection>
        </div>
      );
    }

    // NETWORK DETAILS
    if (type === 'network' && data) {
      return (
        <div className="p-4 space-y-4">
          <h3 className="text-lg font-bold text-white">{name.replace(/_/g, ' ')}</h3>
          <DetailSection title="Properties" defaultOpen>
            <DetailRow label="Name" value={data.name} />
            <DetailRow label="Type" value={data.type} />
          </DetailSection>
        </div>
      );
    }

    // CONNECTION / Generic fallback
    return (
      <div className="p-4 space-y-4">
        <h3 className="text-lg font-bold text-white">{name.replace(/_/g, ' ')}</h3>
        <p className="text-sm text-slate-500">Type: {type}</p>
        {children && children.length > 0 && (
          <p className="text-xs text-slate-500">Contains {children.length} categories</p>
        )}
      </div>
    );
  };

  // Collapsible detail section component
  const DetailSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen = false, children }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-left transition-colors"
        >
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{title}</span>
          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>
        {isOpen && <div className="p-3 space-y-2 bg-slate-900/50">{children}</div>}
      </div>
    );
  };

  // Detail row component
  const DetailRow: React.FC<{ label: string; value: any; badge?: boolean }> = ({ label, value, badge }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      {badge ? (
        <span className={clsx(
          "px-2 py-0.5 text-xs rounded-full",
          value?.toLowerCase() === 'green' || value?.toLowerCase() === 'connected' ? "bg-green-500/20 text-green-400" :
          value?.toLowerCase() === 'yellow' ? "bg-amber-500/20 text-amber-400" :
          value?.toLowerCase() === 'red' ? "bg-red-500/20 text-red-400" : "bg-slate-500/20 text-slate-400"
        )}>{value || 'Unknown'}</span>
      ) : (
        <span className="text-white truncate max-w-[200px]">{value || '-'}</span>
      )}
    </div>
  );

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Window Chrome */}
      <div className="bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 border border-slate-300 dark:border-slate-700 rounded-t-xl">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <Folder className="w-5 h-5 text-amber-500" />
            <span className="font-semibold text-slate-900 dark:text-white">Infrastructure Explorer</span>
            {lastSync && <span className="text-[10px] text-slate-500">Last sync: {new Date(lastSync).toLocaleString()}</span>}
          </div>
          <div className="flex items-center gap-1">
            <select
              value={selectedConnection || ''}
              onChange={(e) => setSelectedConnection(Number(e.target.value))}
              className="text-xs px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-white"
            >
              <option value="">Select Connection</option>
              {connections.map(conn => <option key={conn.id} value={conn.id}>{conn.name}</option>)}
            </select>
            <button onClick={syncInventory} disabled={!selectedConnection || isSyncing}
              className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
              <RefreshCw className={clsx("w-4 h-4", isSyncing && "animate-spin")} />
            </button>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-2" />
            <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"><Minus className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /></button>
            <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"><Square className="w-3 h-3 text-slate-500 dark:text-slate-400" /></button>
            <button className="p-1 hover:bg-red-600 rounded"><X className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /></button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div ref={containerRef} className="flex-1 flex bg-slate-100 dark:bg-slate-900 border-x border-b border-slate-300 dark:border-slate-700 rounded-b-xl overflow-hidden">
        {/* Tree Panel */}
        <div style={{ width: panelWidth }} className="flex flex-col bg-slate-50 dark:bg-slate-900/50 shrink-0">
          {/* Search */}
          <div className="p-2 border-b border-slate-300 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
              </div>
            ) : treeData.length > 0 ? (
              treeData.map(node => renderTreeNode(node))
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm">
                <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No connection selected</p>
              </div>
            )}
          </div>
        </div>

        {/* Resizable Divider */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1 bg-slate-300 dark:bg-slate-700 hover:bg-blue-500 cursor-col-resize transition-colors shrink-0 group"
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-0.5 h-8 bg-slate-400 dark:bg-slate-600 group-hover:bg-blue-400 rounded-full transition-colors" />
          </div>
        </div>

        {/* Details Panel */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-900 overflow-y-auto">{renderDetailsPanel()}</div>
      </div>
    </div>
  );
};

// Action Button Component
const ActionButton: React.FC<{
  icon: React.ElementType;
  label: string;
  color: 'green' | 'red' | 'amber' | 'orange' | 'blue' | 'purple';
  loading?: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, color, loading, onClick }) => {
  const colors = {
    green: 'bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white',
    red: 'bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white',
    amber: 'bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white',
    orange: 'bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white',
    blue: 'bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white',
    purple: 'bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white',
  };
  return (
    <button onClick={onClick} disabled={loading}
      className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all", colors[color], loading && "opacity-50")}>
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
};

export default InfrastructureExplorer;
