import React, { useState, useEffect } from 'react';
import { 
  Server, Database, HardDrive, Network, Monitor, 
  ChevronDown, ChevronRight, RefreshCw, Search,
  Power, PowerOff, Pause, AlertCircle, Trash2
} from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';


interface DatacenterInfo {
  name: string;
  status: string;
}

interface ClusterInfo {
  name: string;
  hosts: number;
  status: string;
}

interface HostInfo {
  name: string;
  state: string;
  status: string;
}

interface NetworkInfo {
  name: string;
  type: string;
}

interface VMInfo {
  name: string;
  moid: string;
  power_state: string;
  guest_os: string;
  cpu: number;
  memory_mb: number;
  is_template: boolean;
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
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Inventory data
  const [datacenters, setDatacenters] = useState<DatacenterInfo[]>([]);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [vms, setVms] = useState<VMInfo[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Collapse states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    datacenters: true,
    clusters: true,
    hosts: true,
    networks: false,
    vms: true
  });

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      loadInventory();
    }
  }, [selectedConnection]);

  const loadConnections = async () => {
    try {
      const res = await api.get('/infrastructure-connections/');
      const vsphereConnections = res.data.filter((c: ConnectionInfo) => 
        c.provider?.toLowerCase() === 'vsphere'
      );
      setConnections(vsphereConnections);
      
      // Auto-select first active connection
      const activeConn = vsphereConnections.find((c: ConnectionInfo) => c.is_active);
      if (activeConn) {
        setSelectedConnection(activeConn.id);
      } else if (vsphereConnections.length > 0) {
        setSelectedConnection(vsphereConnections[0].id);
      }
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  const loadInventory = async () => {
    if (!selectedConnection) return;
    
    setIsLoading(true);
    setError(null);
    
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
      } else {
        setError(res.data.message || 'No inventory data available. Try syncing first.');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load inventory');
    } finally {
      setIsLoading(false);
    }
  };

  const syncInventory = async () => {
    if (!selectedConnection) return;
    
    setIsSyncing(true);
    setError(null);
    
    try {
      await api.post(`/infrastructure-connections/${selectedConnection}/sync`);
      await loadInventory();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteConnection = async () => {
    if (!selectedConnection) return;
    
    const conn = connections.find(c => c.id === selectedConnection);
    if (!window.confirm(`Delete "${conn?.name}" connection? Templates using it may break.`)) return;
    
    setIsDeleting(true);
    try {
      await api.delete(`/infrastructure-connections/${selectedConnection}`);
      showToast('Connection deleted', 'success');
      setSelectedConnection(null);
      await loadConnections();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getPowerIcon = (state: string) => {
    switch (state?.toLowerCase()) {
      case 'poweredon':
        return <Power className="w-4 h-4 text-emerald-500" />;
      case 'poweredoff':
        return <PowerOff className="w-4 h-4 text-red-500" />;
      case 'suspended':
        return <Pause className="w-4 h-4 text-amber-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase();
    if (statusLower === 'green' || statusLower === 'connected') {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400">Healthy</span>;
    } else if (statusLower === 'yellow') {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">Warning</span>;
    } else if (statusLower === 'red' || statusLower === 'disconnected') {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">Critical</span>;
    }
    return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400">{status}</span>;
  };

  const filterItems = <T extends { name: string }>(items: T[]): T[] => {
    if (!searchTerm) return items;
    return items.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredVMs = filterItems(vms);
  const filteredDatacenters = filterItems(datacenters);
  const filteredClusters = filterItems(clusters);
  const filteredHosts = filterItems(hosts);
  const filteredNetworks = filterItems(networks);

  const renderCollapsibleSection = (
    id: string,
    title: string,
    icon: React.ReactNode,
    count: number,
    children: React.ReactNode,
    color: string
  ) => (
    <div className="border border-theme rounded-xl overflow-hidden bg-secondary/30">
      <button
        onClick={() => toggleSection(id)}
        className={`w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            {icon}
          </div>
          <span className="font-semibold text-primary">{title}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">
            {count}
          </span>
        </div>
        {expandedSections[id] ? (
          <ChevronDown className="w-5 h-5 text-secondary" />
        ) : (
          <ChevronRight className="w-5 h-5 text-secondary" />
        )}
      </button>
      
      {expandedSections[id] && (
        <div className="border-t border-theme">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Infrastructure Explorer</h1>
          <p className="text-secondary mt-1">Browse vSphere inventory by type</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Connection Selector */}
          <select
            value={selectedConnection || ''}
            onChange={(e) => setSelectedConnection(Number(e.target.value))}
            className="px-4 py-2 rounded-lg bg-secondary border border-theme text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Connection</option>
            {connections.map(conn => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.host})
              </option>
            ))}
          </select>
          
          {/* Sync Button */}
          <button
            onClick={syncInventory}
            disabled={!selectedConnection || isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDeleteConnection}
            disabled={!selectedConnection || isDeleting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete this connection"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
        <input
          type="text"
          placeholder="Search inventory..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary border border-theme text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Last Sync Info */}
      {lastSync && (
        <p className="text-xs text-secondary">
          Last synced: {new Date(lastSync).toLocaleString()}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Inventory Sections */}
      {!isLoading && selectedConnection && (
        <div className="space-y-4">
          {/* Datacenters */}
          {renderCollapsibleSection(
            'datacenters',
            'Datacenters',
            <Database className="w-5 h-5 text-purple-400" />,
            filteredDatacenters.length,
            <div className="divide-y divide-theme">
              {filteredDatacenters.map((dc, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-secondary/30">
                  <span className="text-primary">{dc.name}</span>
                  {getStatusBadge(dc.status)}
                </div>
              ))}
              {filteredDatacenters.length === 0 && (
                <p className="p-4 text-secondary text-sm">No datacenters found</p>
              )}
            </div>,
            'bg-purple-500/20'
          )}

          {/* Clusters */}
          {renderCollapsibleSection(
            'clusters',
            'Clusters',
            <Server className="w-5 h-5 text-blue-400" />,
            filteredClusters.length,
            <div className="divide-y divide-theme">
              {filteredClusters.map((cluster, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-secondary/30">
                  <div>
                    <span className="text-primary">{cluster.name}</span>
                    <span className="ml-2 text-xs text-secondary">({cluster.hosts} hosts)</span>
                  </div>
                  {getStatusBadge(cluster.status)}
                </div>
              ))}
              {filteredClusters.length === 0 && (
                <p className="p-4 text-secondary text-sm">No clusters found</p>
              )}
            </div>,
            'bg-blue-500/20'
          )}

          {/* Hosts */}
          {renderCollapsibleSection(
            'hosts',
            'ESXi Hosts',
            <HardDrive className="w-5 h-5 text-cyan-400" />,
            filteredHosts.length,
            <div className="divide-y divide-theme">
              {filteredHosts.map((host, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-secondary/30">
                  <span className="text-primary">{host.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-secondary">{host.state}</span>
                    {getStatusBadge(host.status)}
                  </div>
                </div>
              ))}
              {filteredHosts.length === 0 && (
                <p className="p-4 text-secondary text-sm">No hosts found</p>
              )}
            </div>,
            'bg-cyan-500/20'
          )}

          {/* Networks */}
          {renderCollapsibleSection(
            'networks',
            'Networks',
            <Network className="w-5 h-5 text-green-400" />,
            filteredNetworks.length,
            <div className="divide-y divide-theme">
              {filteredNetworks.map((net, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-secondary/30">
                  <span className="text-primary">{net.name}</span>
                  <span className="text-xs text-secondary">{net.type}</span>
                </div>
              ))}
              {filteredNetworks.length === 0 && (
                <p className="p-4 text-secondary text-sm">No networks found</p>
              )}
            </div>,
            'bg-green-500/20'
          )}

          {/* VMs */}
          {renderCollapsibleSection(
            'vms',
            'Virtual Machines',
            <Monitor className="w-5 h-5 text-amber-400" />,
            filteredVMs.length,
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-secondary uppercase">Name</th>
                    <th className="text-left p-3 text-xs font-medium text-secondary uppercase">Power</th>
                    <th className="text-left p-3 text-xs font-medium text-secondary uppercase">Guest OS</th>
                    <th className="text-left p-3 text-xs font-medium text-secondary uppercase">CPU</th>
                    <th className="text-left p-3 text-xs font-medium text-secondary uppercase">Memory</th>
                    <th className="text-left p-3 text-xs font-medium text-secondary uppercase">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {filteredVMs.map((vm, i) => (
                    <tr key={i} className="hover:bg-secondary/30">
                      <td className="p-3 text-primary font-medium">{vm.name}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getPowerIcon(vm.power_state)}
                          <span className="text-xs text-secondary capitalize">
                            {vm.power_state?.replace('powered', '')}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-secondary text-sm">{vm.guest_os || 'Unknown'}</td>
                      <td className="p-3 text-secondary">{vm.cpu} vCPU</td>
                      <td className="p-3 text-secondary">{(vm.memory_mb / 1024).toFixed(1)} GB</td>
                      <td className="p-3">
                        {vm.is_template ? (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-500/20 text-indigo-400">Template</span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400">VM</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredVMs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-secondary text-sm">
                        No VMs found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>,
            'bg-amber-500/20'
          )}
        </div>
      )}

      {/* No Connection Selected */}
      {!selectedConnection && !isLoading && (
        <div className="text-center py-12">
          <Server className="w-12 h-12 text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-medium text-primary mb-2">No Connection Selected</h3>
          <p className="text-secondary">
            Select a vSphere connection above or configure one in Settings → Infrastructure Connections
          </p>
        </div>
      )}
    </div>
  );
};

export default InfrastructureExplorer;
