import React, { useState, useCallback, useEffect } from 'react';
import { 
  ReactFlow,
  addEdge, 
  Background, 
  Controls, 
  applyEdgeChanges, 
  applyNodeChanges,
  ConnectionMode,
  type Connection, 
  type Edge, 
  type Node, 
  type NodeChange,
  type EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { VMNode, NetworkNode } from '../components/templates/NetworkNodes';
import VMSettingsPanel from '../components/templates/VMSettingsPanel';
import NetworkSettingsPanel from '../components/templates/NetworkSettingsPanel';
import { 
  Save, RefreshCw, Layers, ArrowLeft, Trash2, 
  Settings, Plus, Search, X, ChevronRight, ChevronDown, Globe, ShieldCheck, Zap,
  Download, Upload
} from 'lucide-react';
import clsx from 'clsx';
import { NICSettingsModal } from '../components/templates/NICSettingsModal';

const nodeTypes = {
  vm: VMNode,
  network: NetworkNode
};

interface Props {
  templateId: number;
  onBack: () => void;
}

const NetworkDesigner: React.FC<Props> = ({ templateId, onBack }) => {
  const { showToast } = useToast();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  
  const [allNetworks, setAllNetworks] = useState<any[]>([]);
  const [availableInfraNetworks, setAvailableInfraNetworks] = useState<any[]>([]);
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [templateProvider, setTemplateProvider] = useState<string>('vsphere');
  const [isFetchingInfra, setIsFetchingInfra] = useState(false);
  const [infraSearchQuery, setInfraSearchQuery] = useState('');
  
  // Create Port Group form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [dvsList, setDvsList] = useState<any[]>([]);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    dvs_name: '',
    vlan_id: 0,
    promiscuous_mode: false,
    mac_changes: false,
    forged_transmits: false
  });
  const [isCreating, setIsCreating] = useState(false);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // VM Settings panel state
  const [selectedVMForSettings, setSelectedVMForSettings] = useState<{
    vmMoid: string;
    vmName: string;
  } | null>(null);

  // NIC Settings state
  const [nicSettings, setNicSettings] = useState<Record<string, any>>({});
  const [selectedNICForSettings, setSelectedNICForSettings] = useState<{
    vmId: number;
    vmName: string;
    nicName: string;
    // Current settings
    model: string;
    firewall: boolean;
    mtu?: number;
    mac?: string;
    rate_limit?: number;
    multiqueue?: number;
    disconnect: boolean;
  } | null>(null);

  // Network Settings panel state
  const [selectedNetworkForSettings, setSelectedNetworkForSettings] = useState<{
    id: number;
    name: string;
    color?: string;
    is_isolated?: boolean;
    isolation_mode?: string;
    vlan_id?: number;
    network_identifier?: string;
  } | null>(null);

  // Sync progress modal state
  const [syncModal, setSyncModal] = useState<{
    isOpen: boolean;
    isConfirming: boolean;
    logs: { message: string; status: 'success' | 'error' | 'info' }[];
  }>({ isOpen: false, isConfirming: true, logs: [] });

  // Undo/Redo history
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isUndoRedo, setIsUndoRedo] = useState(false);

  // Keyboard shortcuts panel
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Quick-connect wizard
  const [showQuickConnect, setShowQuickConnect] = useState(false);

  // Export/Import
  const importInputRef = React.useRef<HTMLInputElement>(null);

  // Export topology to JSON
  const exportTopology = useCallback(() => {
    const data = {
      version: '1.0',
      templateId,
      exportedAt: new Date().toISOString(),
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target
      })),
      networks: allNetworks
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology_${templateId}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Topology exported!', 'success');
  }, [nodes, edges, allNetworks, templateId, showToast]);

  // Import topology from JSON
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        if (!data.nodes || !data.edges) {
          showToast('Invalid topology file', 'error');
          return;
        }
        
        // Restore nodes with positions
        setNodes(data.nodes.map((n: any) => ({
          ...n,
          draggable: true,
          selectable: true
        })));
        
        // Restore edges
        setEdges(data.edges.map((e: any) => ({
          ...e,
          animated: true,
          style: { stroke: '#a855f7', strokeWidth: 3 }
        })));
        
        showToast('Topology imported!', 'success');
      } catch (err) {
        showToast('Failed to parse file', 'error');
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  }, [showToast]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback((params: Connection) => {
    // Only allow connecting VM NIC (source) to Network (target)
    setEdges((eds) => addEdge({ 
      ...params, 
      animated: true, 
      style: { stroke: '#a855f7', strokeWidth: 3 },
      deletable: true
    }, eds));
  }, []);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    // Toggle selection
    setSelectedEdgeId(prev => prev === edge.id ? null : edge.id);
    setSelectedNodeId(null);
  }, []);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(prev => prev === node.id ? null : node.id);
    setSelectedEdgeId(null);
    
    // If it's a network node, also open the settings modal
    if (node.type === 'network') {
      const netId = parseInt(node.id.replace('net-', ''));
      const netData = node.data as any;
      if (!isNaN(netId)) {
        setSelectedNetworkForSettings({
          id: netId,
          name: netData.label,
          color: netData.color,
          network_identifier: netData.network_identifier,
          is_isolated: netData.is_isolated,
          vlan: netData.vlan,
          isolation_mode: netData.isolation_mode
        });
      }
    }
  }, []);

  const deleteSelectedEdge = useCallback(() => {
    if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      showToast('Connection removed', 'success');
    }
  }, [selectedEdgeId, showToast]);

  // Save to history when edges change (not during undo/redo)
  useEffect(() => {
    if (!isUndoRedo && edges.length > 0) {
      const saveToHistory = () => {
        setHistory(prev => {
          const newHistory = [...prev.slice(0, historyIndex + 1), { nodes, edges }];
          setHistoryIndex(newHistory.length - 1);
          return newHistory.length > 50 ? newHistory.slice(1) : newHistory;
        });
      };
      const timeout = setTimeout(saveToHistory, 500);
      return () => clearTimeout(timeout);
    }
  }, [edges, nodes, isUndoRedo, historyIndex]);

  const handleAddNIC = useCallback(async (vmId: number, vmName: string) => {
    try {
        showToast(`Adding interface to ${vmName}...`, 'info');
        
        const tplRes = await api.get(`/templates/${templateId}`);
        const vm = tplRes.data.vms.find((v: any) => v.id === vmId);
        if (!vm) throw new Error('VM not found');

        await api.post(`/networks/vms/${vm.vm_moid}/nics`, {
            template_id: templateId
        });
        
        showToast('Interface added!', 'success');
        setReloadTrigger(prev => prev + 1);
    } catch (e: any) {
        showToast(e.response?.data?.detail || 'Failed to add interface', 'error');
    }
  }, [templateId, showToast]);

  const handleDeleteNIC = useCallback(async (_vmId: number, vmName: string, vmMoid: string, nicName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Interface',
      message: `Delete interface "${nicName}" from ${vmName}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          showToast(`Deleting ${nicName} from ${vmName}...`, 'info');
          
          const tplRes = await api.get(`/templates/${templateId}`);
          const template = tplRes.data;
          
          await api.delete(`/networks/vms/${vmMoid}/nics/${nicName}`, {
            params: { connection_id: template.connection_id }
          });
          
          showToast('Interface deleted!', 'success');
          setReloadTrigger(prev => prev + 1);
        } catch (e: any) {
          showToast(e.response?.data?.detail || 'Failed to delete interface', 'error');
        }
      }
    });
  }, [templateId, showToast]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch template, all defined networks, and detect NICs
      const [tplRes, netRes, nicsRes] = await Promise.all([
        api.get(`/templates/${templateId}`),
        api.get('/networks/'),
        api.get(`/networks/templates/${templateId}/detect-nics`)
      ]);

      const template = tplRes.data;
      const networks = netRes.data;
      const detectedNics = nicsRes.data.vms || [];
      
      setAllNetworks(networks);
      setConnectionId(template.connection_id);
      setTemplateProvider(template.provider?.toLowerCase() || 'vsphere');
      
      // Fetch infrastructure networks for this connection
      if (template.connection_id) {
          const connId = Number(template.connection_id);
          setIsFetchingInfra(true);
          api.get(`/networks/available?connection_id=${connId}`)
            .then(res => setAvailableInfraNetworks(res.data))
            .catch(err => console.error("Failed to fetch infra networks", err))
            .finally(() => setIsFetchingInfra(false));
      }

      // Create VM nodes with actual NICs
      const vmNodes: Node[] = template.vms.map((vm: any, idx: number) => {
        // Find detected NICs for this VM
        const vmNics = detectedNics.find((v: any) => v.id === vm.id);
        const nicsData = vmNics?.nics || [{ name: 'Network adapter 1', adapter_type: undefined }];
        const nics = nicsData.map((n: any) => n.name);
        
        // Build a map of NIC name to detected adapter type
        const detectedAdapterTypes: Record<string, string> = {};
        nicsData.forEach((n: any) => {
          if (n.adapter_type) {
            detectedAdapterTypes[n.name] = n.adapter_type;
          }
        });
        
        return {
          id: `vm-${vm.id}`,
          type: 'vm',
          position: { x: 50, y: 100 + (idx * 250) },
          data: { 
            id: vm.id, 
            name: vm.vm_name, 
            vm_moid: vm.vm_moid,
            cpu: vm.cpu, 
            memory_mb: vm.memory_mb, 
            is_primary: vm.is_primary,
            nics: nics,
            onAddNIC: handleAddNIC,
            onDeleteNIC: handleDeleteNIC,
            onOpenSettings: (vmMoid: string, vmName: string) => setSelectedVMForSettings({ vmMoid, vmName }),
            onOpenNICSettings: (vmId: number, nicName: string) => {
                // Use saved settings, or detected adapter type, or provider-appropriate default
                const isProxmox = template.provider?.toLowerCase() === 'proxmox';
                const defaultModel = isProxmox ? 'virtio' : (detectedAdapterTypes[nicName] || 'vmxnet3');
                
                const settings = nicSettings[`${vmId}-${nicName}`] || {
                    model: detectedAdapterTypes[nicName] || defaultModel,
                    firewall: false,
                    disconnect: false,
                    mtu: undefined,
                    mac: '',
                    rate_limit: undefined,
                    multiqueue: undefined
                };
                setSelectedNICForSettings({
                    vmId,
                    vmName: vm.vm_name,
                    nicName,
                    ...settings
                });
            }
          }
        };
      });

      // First, collect network IDs that are actually mapped to this template's VMs
      const templateVMs = template.vms || [];
      const usedNetworkIds = new Set<number>();
      for (const vm of templateVMs) {
          if (vm.networks && Array.isArray(vm.networks)) {
              for (const mapping of vm.networks) {
                  if (mapping.network_id) {
                      usedNetworkIds.add(mapping.network_id);
                  }
              }
          }
      }

      // Create Network nodes - ONLY for networks that are actually used by this template
      const networkNodes: Node[] = (networks || [])
        .filter((n: any) => usedNetworkIds.has(n.id))
        .map((net: any, idx: number) => ({
          id: `net-${net.id}`,
          type: 'network',
          position: { x: 500, y: 100 + (idx * 200) },
          data: { 
            label: net.name, 
            is_isolated: net.is_isolated, 
            vlan: net.static_vlan,
            network_identifier: net.network_identifier,
            color: net.color,
            onOpenSettings: () => {
                setSelectedNetworkForSettings({
                    id: net.id,
                    name: net.name,
                    color: net.color,
                    network_identifier: net.network_identifier,
                    is_isolated: net.is_isolated,
                    vlan_id: net.static_vlan,
                    isolation_mode: net.isolation_mode
                });
            },
            onDelete: () => deleteNetwork(`net-${net.id}`)
          }
        }));

      // Restore saved positions from localStorage
      const allNodes = [...vmNodes, ...networkNodes];
      try {
        const savedPositions = localStorage.getItem(`network-designer-positions-${templateId}`);
        if (savedPositions) {
          const positions = JSON.parse(savedPositions);
          allNodes.forEach(node => {
            if (positions[node.id]) {
              node.position = positions[node.id];
            }
          });
        }
      } catch (e) {
        console.warn('Failed to restore node positions:', e);
      }

      setNodes(allNodes);

      // Load existing mappings as edges
      const existingEdges: Edge[] = [];
      
      for (const vm of templateVMs) {
          if (vm.networks && Array.isArray(vm.networks)) {
              for (const mapping of vm.networks) {
                  if (mapping.network_id) {
                      existingEdges.push({
                          id: `e-vm${vm.id}-net${mapping.network_id}-${mapping.nic_name}`,
                          source: `vm-${vm.id}`,
                          target: `net-${mapping.network_id}`,
                          sourceHandle: mapping.nic_name,
                          animated: true,
                          style: { stroke: '#a855f7', strokeWidth: 3 },
                          deletable: true
                      });
                  }
              }
          }
      }
      setEdges(existingEdges);

    } catch (e) {
      console.error('Failed to load design data:', e);
      showToast('Failed to load design data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [templateId, showToast, handleAddNIC, handleDeleteNIC, reloadTrigger]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load NIC settings from mappings
  useEffect(() => {
    if (allNetworks.length > 0) {
        // We need to fetch the existing mappings to populate nicSettings state
        api.get(`/networks/templates/${templateId}/vm-networks`)
           .then(res => {
               const settingsMap: Record<string, any> = {};
               res.data.vms.forEach((vm: any) => {
                   vm.network_mappings.forEach((m: any) => {
                       settingsMap[`${m.vm_id}-${m.nic_name}`] = {
                           model: m.adapter_type || 'virtio',
                           firewall: m.firewall || false,
                           mtu: m.mtu,
                           mac: m.mac_address,
                           rate_limit: m.rate_limit,
                           queues: m.queues,
                           disconnect: m.link_down || false
                       };
                   });
               });
               setNicSettings(settingsMap);
           })
           .catch(err => console.error("Failed to load NIC settings", err));
    }
  }, [templateId, allNetworks]); // Run once when networks loaded

  const addNetworkToDesigner = (net: any) => {
    // Check if node already exists
    if (nodes.find(n => n.id === `net-${net.id}`)) {
        showToast('Network already in designer', 'info');
        return;
    }

    const newNode: Node = {
        id: `net-${net.id}`,
        type: 'network',
        position: { x: 500, y: 100 },
        data: { 
          label: net.name, 
          is_isolated: net.is_isolated, 
          vlan: net.static_vlan,
          network_identifier: net.network_identifier,
          color: net.color,
          onOpenSettings: () => {
              setSelectedNetworkForSettings({
                  id: net.id,
                  name: net.name,
                  color: net.color,
                  network_identifier: net.network_identifier,
                  is_isolated: net.is_isolated,
                  vlan_id: net.static_vlan,
                  isolation_mode: net.isolation_mode
              });
          },
          onDelete: () => deleteNetwork(`net-${net.id}`)
        }
    };
    setNodes(nds => [...nds, newNode]);
    setIsSidebarOpen(false);
  };

  const updateNetworkSettings = async (nodeId: string, updates: any) => {
    try {
        const netId = parseInt(nodeId.split('-')[1]);
        
        // Map frontend fields (vlan_id) to backend fields (static_vlan)
        const apiUpdates = { ...updates };
        if (updates.vlan_id !== undefined) {
            apiUpdates.static_vlan = updates.vlan_id;
            delete apiUpdates.vlan_id;
        }

        await api.put(`/networks/${netId}`, apiUpdates);
        
        // Update all networks local state
        setAllNetworks(prev => prev.map(n => n.id === netId ? { ...n, ...updates, static_vlan: updates.vlan_id } : n));
        
        // Update nodes local state
        setNodes(nds => nds.map(n => {
            if (n.id === nodeId) {
                return {
                    ...n,
                    data: { ...n.data, ...updates, label: updates.name || n.data.label }
                };
            }
            return n;
        }));
        
        showToast('Settings updated', 'success');
    } catch (e) {
        showToast('Failed to update settings', 'error');
    }
  };

  const createNewNetwork = async (name: string, identifier: string) => {
    try {
        const res = await api.post('/networks/', {
            name,
            connection_id: connectionId,
            network_identifier: identifier,
            is_isolated: false // Default to linked
        });
        
        const newNet = res.data;
        setAllNetworks(prev => [...prev, newNet]);
        addNetworkToDesigner(newNet);
        showToast('Network created and added', 'success');
    } catch (e) {
        showToast('Failed to create network', 'error');
    }
  };

  const fetchDvsList = async () => {
    if (!connectionId) return;
    try {
      const res = await api.get(`/networks/switches?connection_id=${connectionId}`);
      setDvsList(res.data);
      if (res.data.length > 0 && !createFormData.dvs_name) {
        setCreateFormData(prev => ({ ...prev, dvs_name: res.data[0].name }));
      }
    } catch (e) {
      console.error('Failed to fetch DVS list:', e);
    }
  };

  const createPortGroup = async () => {
    if (!createFormData.name || !createFormData.dvs_name) {
      showToast('Name and DVS are required', 'error');
      return;
    }
    
    setIsCreating(true);
    try {
      await api.post('/networks/port-group', {
        connection_id: connectionId,
        ...createFormData
      });
      
      showToast(`Port group "${createFormData.name}" created in vSphere!`, 'success');
      
      // Reset form
      setCreateFormData({
        name: '',
        dvs_name: dvsList[0]?.name || '',
        vlan_id: 0,
        promiscuous_mode: false,
        mac_changes: false,
        forged_transmits: false
      });
      setShowCreateForm(false);
      
      // Refresh infra networks list
      setIsFetchingInfra(true);
      const infraRes = await api.get(`/networks/available?connection_id=${connectionId}`);
      setAvailableInfraNetworks(infraRes.data);
      setIsFetchingInfra(false);
      
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to create port group', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteNetwork = async (nodeId: string) => {
    const netId = parseInt(nodeId.split('-')[1]);
    const network = allNetworks.find(n => n.id === netId);
    
    setConfirmModal({
      isOpen: true,
      title: 'Delete Network',
      message: `Are you sure you want to delete the network "${network?.name || 'Unknown'}"? This will also remove all connections to this network.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          await api.delete(`/networks/${netId}`);
          
          // Remove from local state
          setAllNetworks(prev => prev.filter(n => n.id !== netId));
          
          // Remove node from designer
          setNodes(nds => nds.filter(n => n.id !== nodeId));
          
          // Remove all edges connected to this network
          setEdges(eds => eds.filter(e => e.target !== nodeId && e.source !== nodeId));
          
          // Clear selection
          setSelectedNodeId(null);
          
          showToast('Network deleted', 'success');
        } catch (e: any) {
          showToast(e.response?.data?.detail || 'Failed to delete network', 'error');
        }
      }
    });
  };

  const saveDesign = async () => {
    setIsSaving(true);
    try {
        // Collect all mappings from edges
        const mappings: Array<{vm_id: number, nic_name: string, network_id: number | null}> = [];
        
        for (const edge of edges) {
            if (edge.source.startsWith('vm-') && edge.target.startsWith('net-')) {
                const vmId = parseInt(edge.source.split('-')[1]);
                const netId = parseInt(edge.target.split('-')[1]);
                const nicName = edge.sourceHandle || 'Network adapter 1';

                mappings.push({
                    vm_id: vmId,
                    nic_name: nicName,
                    network_id: netId,
                    // Add extended settings
                    ...(nicSettings[`${vmId}-${nicName}`] || {})
                });
            }
        }
        
        // Also include NICs that have settings but might not be connected to a network (if we want to support that)
        // But the backend current expects a network_id for a mapping usually?
        // Actually, the backend model requires network_id. 
        // If we want to support "disconnected" NICs with settings, we need to handle that.
        // For now, only saving connected NICs is consistent with existing logic.
        
        // Save all mappings in one request
        
        // Save all mappings in one request
        await api.post(`/networks/templates/${templateId}/vm-networks`, { mappings });
        
        // Save node positions to localStorage for persistent layout
        const positions: Record<string, {x: number, y: number}> = {};
        nodes.forEach(node => {
          positions[node.id] = { x: node.position.x, y: node.position.y };
        });
        localStorage.setItem(`network-designer-positions-${templateId}`, JSON.stringify(positions));
        
        showToast('Network topology saved!', 'success');
    } catch (e) {
        showToast('Failed to save topology', 'error');
    } finally {
        setIsSaving(false);
    }
  };

  const syncEnvironments = async () => {
    // Open confirm modal first
    setSyncModal({ isOpen: true, isConfirming: true, logs: [] });
  };

  const executeSyncEnvironments = async () => {
    setSyncModal(prev => ({ ...prev, isConfirming: false, logs: [{ message: 'Starting sync...', status: 'info' }] }));
    setIsLoading(true);
    try {
        const response = await fetch(`${api.defaults.baseURL}/templates/${templateId}/sync-environments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.body) throw new Error("No response body");
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(Boolean);

            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    setSyncModal(prev => ({
                      ...prev,
                      logs: [...prev.logs, { message: data.message, status: data.status }]
                    }));
                } catch (err) {
                    console.error("Failed to parse sync update:", err);
                }
            }
        }
        setSyncModal(prev => ({
          ...prev,
          logs: [...prev.logs, { message: 'Sync completed!', status: 'success' }]
        }));
    } catch (e) {
        setSyncModal(prev => ({
          ...prev,
          logs: [...prev.logs, { message: 'Failed to sync environments', status: 'error' }]
        }));
        console.error(e);
    } finally {
        setIsLoading(false);
    }
  };

  // Auto-Layout: Arrange VMs on left, Networks on right
  const autoLayoutNodes = useCallback(() => {
    const vmNodes = nodes.filter(n => n.type === 'vm');
    const networkNodes = nodes.filter(n => n.type === 'network');
    
    const NODE_WIDTH = 220;
    const NODE_HEIGHT = 160;
    const HORIZONTAL_GAP = 350;
    const VERTICAL_GAP = 40;
    const START_X = 80;
    const START_Y = 120;
    
    // Arrange VMs in a column on the left
    const updatedVMs = vmNodes.map((node, index) => ({
      ...node,
      position: {
        x: START_X,
        y: START_Y + index * (NODE_HEIGHT + VERTICAL_GAP)
      }
    }));
    
    // Arrange Networks in a column on the right
    const networkStartY = START_Y + ((vmNodes.length - networkNodes.length) / 2) * (NODE_HEIGHT + VERTICAL_GAP);
    const updatedNetworks = networkNodes.map((node, index) => ({
      ...node,
      position: {
        x: START_X + NODE_WIDTH + HORIZONTAL_GAP,
        y: Math.max(START_Y, networkStartY) + index * (NODE_HEIGHT + VERTICAL_GAP)
      }
    }));
    
    setNodes([...updatedVMs, ...updatedNetworks]);
    showToast('Layout arranged: VMs → Networks', 'success');
  }, [nodes, showToast]);

  // Save state to history for undo/redo
  const saveToHistory = useCallback(() => {
    if (isUndoRedo) return;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: [...nodes], edges: [...edges] });
    // Keep last 20 states
    if (newHistory.length > 20) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [nodes, edges, history, historyIndex, isUndoRedo]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setIsUndoRedo(true);
      const prevState = history[historyIndex - 1];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(historyIndex - 1);
      setTimeout(() => setIsUndoRedo(false), 100);
      showToast('Undo', 'info');
    }
  }, [history, historyIndex, showToast]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setIsUndoRedo(true);
      const nextState = history[historyIndex + 1];
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(historyIndex + 1);
      setTimeout(() => setIsUndoRedo(false), 100);
      showToast('Redo', 'info');
    }
  }, [history, historyIndex, showToast]);

  // Quick-connect: Connect all unconnected NICs to a network
  const quickConnectAll = useCallback((networkId: number) => {
    const networkNode = nodes.find(n => n.type === 'network' && n.id === `net-${networkId}`);
    if (!networkNode) return;

    const vmNodes = nodes.filter(n => n.type === 'vm');
    const newEdges: Edge[] = [];

    vmNodes.forEach(vm => {
      const nics = ((vm.data as any)?.nics || []) as string[];
      nics.forEach((nic: string) => {
        const existingEdge = edges.find(e => e.source === vm.id && e.sourceHandle === nic);
        if (!existingEdge) {
          newEdges.push({
            id: `e-${vm.id}-${nic}-net-${networkId}`,
            source: vm.id,
            sourceHandle: nic,
            target: `net-${networkId}`,
            animated: true,
            style: { stroke: (networkNode.data as any)?.color as string || '#a855f7', strokeWidth: 3 }
          });
        }
      });
    });

    setEdges(prev => [...prev, ...newEdges]);
    setShowQuickConnect(false);
    showToast(`Connected ${newEdges.length} NICs to ${networkNode.data?.label}`, 'success');
  }, [nodes, edges, showToast]);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? - Show shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShowShortcuts(prev => !prev);
        return;
      }
      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Shift+Z or Ctrl+Y - Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      // Delete/Backspace - Delete selected node or edge
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't trigger if user is typing in an input
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        
        // Delete selected edge
        if (selectedEdgeId) {
          setEdges(eds => eds.filter(ed => ed.id !== selectedEdgeId));
          setSelectedEdgeId(null);
          showToast('Connection removed', 'success');
          return;
        }
        
        // Delete selected network node
        if (selectedNodeId && selectedNodeId.startsWith('net-')) {
          const networkId = parseInt(selectedNodeId.replace('net-', ''));
          if (!isNaN(networkId)) {
            // Show confirmation
            setConfirmModal({
              isOpen: true,
              title: 'Delete Network',
              message: 'Are you sure you want to delete this network? All connections will be removed.',
              onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                  await api.delete(`/networks/${networkId}`);
                  // Remove node and connected edges
                  setNodes(ns => ns.filter(n => n.id !== selectedNodeId));
                  setEdges(eds => eds.filter(ed => ed.target !== selectedNodeId));
                  setSelectedNodeId(null);
                  showToast('Network deleted', 'success');
                } catch (err: any) {
                  showToast(err.response?.data?.detail || 'Failed to delete network', 'error');
                }
              }
            });
          }
          return;
        }
      }
      // Escape - Close panels
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowQuickConnect(false);
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedNodeId, selectedEdgeId, showToast]);

  // Save to history when edges change (not during undo/redo)
  useEffect(() => {
    if (!isUndoRedo && edges.length > 0) {
      const timeout = setTimeout(saveToHistory, 500);
      return () => clearTimeout(timeout);
    }
  }, [edges, isUndoRedo, saveToHistory]);


  // Update edge styles based on selection and target network color
  const styledEdges = edges.map(e => {
    const targetNode = nodes.find(n => n.id === e.target);
    const networkColor = (targetNode?.data as any)?.color as string || '#a855f7';
    const networkLabel = (targetNode?.data as any)?.label as string || '';
    
    return {
      ...e,
      animated: true,
      label: networkLabel,
      labelStyle: { fill: '#fff', fontWeight: 600, fontSize: 10 },
      labelBgStyle: { fill: networkColor, fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: e.id === selectedEdgeId ? '#ef4444' : networkColor,
        strokeWidth: e.id === selectedEdgeId ? 4 : 3,
        strokeDasharray: e.id === selectedEdgeId ? '0' : '5 5'
      }
    };
  });

  return (
    <div className="h-[calc(100vh-140px)] w-full relative bg-slate-950 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl">
      {/* Designer Toolbar */}
      <div className="absolute top-6 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
            <button 
                onClick={onBack}
                className="p-3 bg-secondary/80 backdrop-blur-md rounded-2xl border border-white/10 hover:bg-secondary transition-all text-primary shadow-xl"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="bg-secondary/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 shadow-xl">
                <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-purple-500" />
                    <div>
                        <h2 className="text-sm font-black text-primary leading-tight tracking-tight">Topology Designer</h2>
                        <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Drag connections • Click to select • Delete to remove</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
            {selectedEdgeId && (
              <button 
                  onClick={deleteSelectedEdge}
                  className="flex items-center gap-2 p-3 bg-red-500/80 backdrop-blur-md rounded-2xl border border-red-400/20 hover:bg-red-500 transition-all text-white"
                  title="Delete selected connection"
              >
                  <Trash2 size={18} />
                  <span className="text-sm font-bold">Delete</span>
              </button>
            )}
            <button 
                onClick={loadData}
                className="p-4 bg-secondary/80 backdrop-blur-md rounded-2xl border border-white/10 hover:bg-secondary transition-all text-secondary"
                title="Refresh Data"
            >
                <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} />
            </button>
            <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="flex items-center gap-2 p-3 bg-blue-500/20 backdrop-blur-md rounded-2xl border border-blue-500/30 hover:bg-blue-500/30 transition-all text-blue-400"
                title="Add Network"
            >
                <Plus size={18} />
                <span className="text-xs font-bold">Add Network</span>
            </button>
            <button 
                onClick={syncEnvironments}
                disabled={isLoading || isSaving}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-2xl border border-blue-500/30 transition-all font-black text-xs uppercase tracking-widest shadow-xl disabled:opacity-50"
            >
                <RefreshCw className={isLoading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                Sync Active
            </button>
            <button 
                onClick={saveDesign}
                disabled={isSaving}
                className="flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-black text-sm shadow-2xl shadow-purple-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
                {isSaving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                SAVE TOPOLOGY
            </button>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="absolute bottom-6 right-6 z-10 pointer-events-auto flex items-center gap-2">
        {/* Undo/Redo Buttons */}
        <div className="flex items-center gap-1 bg-slate-800/90 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 shadow-xl">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
            title="Redo (Ctrl+Y)"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>

        {/* Export/Import Buttons */}
        <div className="flex items-center gap-1 bg-slate-800/90 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 shadow-xl">
          <button
            onClick={exportTopology}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Export Topology (JSON)"
          >
            <Download className="w-4 h-4 text-blue-400" />
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Import Topology (JSON/YAML)"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.yaml,.yml"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {/* Quick Connect Button */}
        <button
          onClick={() => setShowQuickConnect(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl border border-emerald-500/30 transition-all"
          title="Quick-connect all NICs"
        >
          <Zap className="w-4 h-4" />
          <span className="text-xs font-bold">Quick Connect</span>
        </button>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/20 rounded-3xl p-6 shadow-2xl max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-white">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="p-1 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5 text-secondary" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-white/10">
                <span className="text-secondary">Undo</span>
                <kbd className="px-2 py-1 bg-slate-800 rounded text-xs font-mono">Ctrl + Z</kbd>
              </div>
              <div className="flex justify-between py-2 border-b border-white/10">
                <span className="text-secondary">Redo</span>
                <kbd className="px-2 py-1 bg-slate-800 rounded text-xs font-mono">Ctrl + Y</kbd>
              </div>
              <div className="flex justify-between py-2 border-b border-white/10">
                <span className="text-secondary">Delete Selected</span>
                <kbd className="px-2 py-1 bg-slate-800 rounded text-xs font-mono">Delete / Backspace</kbd>
              </div>
              <div className="flex justify-between py-2 border-b border-white/10">
                <span className="text-secondary">Close Panels</span>
                <kbd className="px-2 py-1 bg-slate-800 rounded text-xs font-mono">Escape</kbd>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-secondary">Show Shortcuts</span>
                <kbd className="px-2 py-1 bg-slate-800 rounded text-xs font-mono">?</kbd>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Connect Modal */}
      {showQuickConnect && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/20 rounded-3xl p-6 shadow-2xl max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-400" />
                Quick Connect
              </h3>
              <button onClick={() => setShowQuickConnect(false)} className="p-1 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5 text-secondary" />
              </button>
            </div>
            <p className="text-secondary text-sm mb-4">Connect all unassigned NICs to a network:</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {allNetworks.map(net => (
                <button
                  key={net.id}
                  onClick={() => quickConnectAll(net.id)}
                  className="w-full flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: (net.color || '#3b82f6') + '20' }}
                    >
                      {net.is_isolated ? (
                        <ShieldCheck className="w-4 h-4" style={{ color: net.color || '#10b981' }} />
                      ) : (
                        <Globe className="w-4 h-4" style={{ color: net.color || '#3b82f6' }} />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">{net.name}</p>
                      <p className="text-[10px] text-secondary">{net.is_isolated ? 'Isolated VLAN' : 'Shared Network'}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-secondary" />
                </button>
              ))}
              {allNetworks.length === 0 && (
                <p className="text-center text-secondary py-4">No networks defined</p>
              )}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="h-full w-full flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
                <RefreshCw className="w-10 h-10 text-purple-500 animate-spin" />
                <p className="text-secondary font-black tracking-widest uppercase text-xs">Loading Blueprint Data</p>
            </div>
        </div>
      ) : (() => {
        // Add connection counts to network nodes and settings callbacks
        const processedNodes = nodes.map(node => {
          if (node.type === 'network') {
            const count = edges.filter(e => e.target === node.id).length;
            const networkData = allNetworks.find(n => `net-${n.id}` === node.id);
            return {
              ...node,
              data: { 
                ...node.data, 
                connectionCount: count,
                onOpenSettings: networkData ? () => setSelectedNetworkForSettings(networkData) : undefined,
                onDelete: () => deleteNetwork(node.id)
              }
            };
          }
          if (node.type === 'vm') {
            return {
              ...node,
              data: {
                ...node.data,
                onOpenSettings: (vmMoid: string, vmName: string) => setSelectedVMForSettings({ vmMoid, vmName }),
                onOpenNICSettings: (vmId: number, nicName: string) => {
                    const settings = nicSettings[`${vmId}-${nicName}`] || {
                        model: 'virtio',
                        firewall: false,
                        disconnect: false,
                        mtu: undefined,
                        mac: '',
                        rate_limit: undefined,
                        multiqueue: undefined
                    };
                    setSelectedNICForSettings({
                        vmId,
                        vmName: (node.data as any).name || '',
                        nicName,
                        ...settings
                    });
                }
              }
            };
          }
          return node;
        });

        return (
        <ReactFlow
          nodes={processedNodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onNodeClick={onNodeClick}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          className="bg-slate-50 dark:bg-slate-950"
          deleteKeyCode={['Delete', 'Backspace']}
        >
          <Background color="#cbd5e1" gap={20} size={1} className="dark:!bg-slate-950 [&>pattern>circle]:dark:!fill-slate-800 [&>pattern>circle]:!fill-slate-400/20" />
           <Controls className="!bg-slate-900/40 !backdrop-blur-md !border-white/10 !shadow-2xl !rounded-xl overflow-hidden [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!fill-blue-400 [&>button:hover]:!bg-white/10 [&>button]:!transition-colors" />
        </ReactFlow>
        );
      })()}


      {/* Add Network Modal */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-500/20">
                  <Plus className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Add Network</h2>
                  <p className="text-xs text-slate-400">Connect or create lab networks</p>
                </div>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)] space-y-6 custom-scrollbar">
              {/* Existing Networks Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white uppercase tracking-wide">Your Networks</label>
                  <span className="text-[10px] text-slate-500">{allNetworks.filter(n => n.connection_id === connectionId).length} defined</span>
                </div>
                
                <div className="grid gap-2 max-h-[200px] overflow-y-auto pr-1">
                  {allNetworks.filter(n => n.connection_id === connectionId).length === 0 ? (
                    <div className="p-6 bg-slate-800/50 border border-dashed border-slate-700 rounded-2xl text-center">
                      <Globe className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm text-slate-400">No networks defined yet</p>
                      <p className="text-xs text-slate-500 mt-1">Link one from vSphere below</p>
                    </div>
                  ) : (
                    allNetworks.filter(n => n.connection_id === connectionId).map(net => {
                      const isAdded = nodes.some(n => n.id === `net-${net.id}`);
                      return (
                        <button 
                          key={net.id}
                          onClick={() => { addNetworkToDesigner(net); setIsSidebarOpen(false); }}
                          disabled={isAdded}
                          className="w-full p-3 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 transition-all text-left flex items-center justify-between group disabled:opacity-40"
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-10 h-10 rounded-xl flex items-center justify-center border" 
                              style={{ backgroundColor: `${net.color || '#3b82f6'}15`, borderColor: `${net.color || '#3b82f6'}40`, color: net.color || '#3b82f6' }}
                            >
                              {net.is_isolated ? <ShieldCheck size={18} /> : <Globe size={18} />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{net.name}</p>
                              <p className="text-[10px] text-slate-400">{net.is_isolated ? 'Isolated VLAN' : net.network_identifier || 'Shared'}</p>
                            </div>
                          </div>
                          {isAdded ? (
                            <span className="text-[10px] font-bold text-emerald-400 uppercase">Added</span>
                          ) : (
                            <Plus size={16} className="text-slate-500 group-hover:text-blue-400 group-hover:scale-110 transition-all" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Link from Infrastructure Section */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <label className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-2">
                  <Globe size={12} className="text-blue-400" />
                  Link from {templateProvider === 'proxmox' ? 'Proxmox' : 'vSphere'}
                </label>
                
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="text"
                    placeholder={templateProvider === 'proxmox' ? 'Search network bridges...' : 'Search port groups...'}
                    value={infraSearchQuery}
                    onChange={(e) => setInfraSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                  />
                </div>
                
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                  {isFetchingInfra ? (
                    <div className="p-4 flex items-center justify-center gap-2 text-sm text-slate-400">
                      <RefreshCw size={14} className="animate-spin" /> Scanning {templateProvider === 'proxmox' ? 'Proxmox' : 'vSphere'}...
                    </div>
                  ) : (() => {
                    const filtered = availableInfraNetworks
                      .filter(infra => !allNetworks.some(n => n.network_identifier === infra.identifier))
                      .filter(infra => infra.name.toLowerCase().includes(infraSearchQuery.toLowerCase()));
                    
                    if (filtered.length === 0) {
                      return <div className="p-4 text-center text-sm text-slate-500">No unlinked networks found</div>;
                    }
                    
                    return filtered.slice(0, 10).map(infra => (
                      <button 
                        key={infra.identifier}
                        onClick={() => { createNewNetwork(infra.name, infra.identifier); setIsSidebarOpen(false); }}
                        className="w-full px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/15 hover:border-blue-500/40 transition-all text-left flex items-center justify-between group"
                      >
                        <span className="text-sm text-blue-300 truncate">{infra.name}</span>
                        <Plus size={14} className="text-blue-400 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                      </button>
                    ));
                  })()}
                </div>
              </div>

              {/* Create New Port Group - vSphere Only */}
              {templateProvider === 'vsphere' && (
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <button 
                  onClick={() => { setShowCreateForm(!showCreateForm); if (!showCreateForm) fetchDvsList(); }}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wide hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Zap size={12} className="text-emerald-400" />
                    Create New in vSphere
                  </span>
                  <ChevronDown size={14} className={clsx("transition-transform text-slate-500", showCreateForm && "rotate-180")} />
                </button>
                
                {showCreateForm && (
                  <div className="space-y-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Port Group Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g., Lab_Network_100"
                          value={createFormData.name}
                          onChange={(e) => setCreateFormData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">DVS</label>
                        {dvsList.length === 0 ? (
                          <p className="text-xs text-amber-400 py-2">No DVS found</p>
                        ) : (
                          <select 
                            value={createFormData.dvs_name}
                            onChange={(e) => setCreateFormData(prev => ({ ...prev, dvs_name: e.target.value }))}
                            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          >
                            {dvsList.map((dvs: any) => (
                              <option key={dvs.uuid} value={dvs.name}>{dvs.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">VLAN ID</label>
                        <input 
                          type="number" 
                          min={0} 
                          max={4094}
                          placeholder="0"
                          value={createFormData.vlan_id}
                          onChange={(e) => setCreateFormData(prev => ({ ...prev, vlan_id: parseInt(e.target.value) || 0 }))}
                          className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      <ChevronRight size={12} className={clsx("transition-transform", showAdvancedSettings && "rotate-90")} />
                      Security Settings
                    </button>
                    
                    {showAdvancedSettings && (
                      <div className="flex flex-wrap gap-x-6 gap-y-2 pl-4 border-l border-slate-700">
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                          <input type="checkbox" checked={createFormData.promiscuous_mode} onChange={(e) => setCreateFormData(prev => ({ ...prev, promiscuous_mode: e.target.checked }))} className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 text-emerald-500" />
                          Promiscuous
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                          <input type="checkbox" checked={createFormData.mac_changes} onChange={(e) => setCreateFormData(prev => ({ ...prev, mac_changes: e.target.checked }))} className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 text-emerald-500" />
                          MAC Changes
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                          <input type="checkbox" checked={createFormData.forged_transmits} onChange={(e) => setCreateFormData(prev => ({ ...prev, forged_transmits: e.target.checked }))} className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 text-emerald-500" />
                          Forged Transmits
                        </label>
                      </div>
                    )}
                    
                    <button 
                      onClick={() => { createPortGroup(); setIsSidebarOpen(false); }}
                      disabled={isCreating || !createFormData.name || !createFormData.dvs_name}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {isCreating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                      {isCreating ? 'Creating...' : 'Create Port Group'}
                    </button>
                  </div>
                )}
              </div>
              )}

              {/* Create New Network - Proxmox */}
              {templateProvider === 'proxmox' && (
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <button 
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wide hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Zap size={12} className="text-orange-400" />
                    Create New Network
                  </span>
                  <ChevronDown size={14} className={clsx("transition-transform text-slate-500", showCreateForm && "rotate-180")} />
                </button>
                
                {showCreateForm && (
                  <div className="space-y-4 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Network Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g., Internal_Lab"
                          value={createFormData.name}
                          onChange={(e) => setCreateFormData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Bridge (Optional)</label>
                        <select 
                          value={createFormData.dvs_name}
                          onChange={(e) => setCreateFormData(prev => ({ ...prev, dvs_name: e.target.value }))}
                          className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        >
                          <option value="">Isolated (No Bridge)</option>
                          {availableInfraNetworks.map((net: any) => (
                            <option key={net.identifier} value={net.identifier}>{net.name}</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-slate-500">Leave empty for isolated network, or select a bridge for external connectivity</p>
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">VLAN Tag (Optional)</label>
                        <input 
                          type="number" 
                          min={0} 
                          max={4094}
                          placeholder="0 = No VLAN"
                          value={createFormData.vlan_id || ''}
                          onChange={(e) => setCreateFormData(prev => ({ ...prev, vlan_id: parseInt(e.target.value) || 0 }))}
                          className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        />
                      </div>
                    </div>
                    
                    <button 
                      onClick={async () => {
                        if (!createFormData.name || !connectionId) return;
                        setIsCreating(true);
                        try {
                          await api.post('/networks/', {
                            connection_id: connectionId,
                            name: createFormData.name,
                            is_isolated: !createFormData.dvs_name,
                            isolation_mode: createFormData.dvs_name ? 'shared' : 'isolated',
                            network_identifier: createFormData.dvs_name || null,
                            static_vlan: createFormData.vlan_id || null
                          });
                          showToast(`Network "${createFormData.name}" created!`, 'success');
                          setCreateFormData({ name: '', dvs_name: '', vlan_id: 0, promiscuous_mode: false, mac_changes: false, forged_transmits: false });
                          setShowCreateForm(false);
                          // Refresh networks
                          const netRes = await api.get('/networks/');
                          setAllNetworks(netRes.data);
                        } catch (err: any) {
                          showToast(err.response?.data?.detail || 'Failed to create network', 'error');
                        } finally {
                          setIsCreating(false);
                        }
                      }}
                      disabled={isCreating || !createFormData.name}
                      className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {isCreating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                      {isCreating ? 'Creating...' : 'Create Network'}
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-3xl border border-theme shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-primary">{confirmModal.title}</h3>
              </div>
              <p className="text-secondary font-medium">{confirmModal.message}</p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 px-4 py-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl font-bold text-secondary transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VM Settings Panel Overlay */}
      {selectedVMForSettings && connectionId && (
        <div className="absolute top-6 left-6 z-50">
          <VMSettingsPanel
            vmMoid={selectedVMForSettings.vmMoid}
            vmName={selectedVMForSettings.vmName}
            connectionId={connectionId}
            onClose={() => setSelectedVMForSettings(null)}
            onRefresh={() => setReloadTrigger(prev => prev + 1)}
          />
        </div>
      )}

      {/* Network Settings Panel Overlay */}
      {selectedNetworkForSettings && (
        <div className="fixed top-20 right-8 z-[50]">
          <NetworkSettingsPanel
            network={selectedNetworkForSettings}
            connectedVMs={edges
              .filter(e => e.target === `net-${selectedNetworkForSettings.id}`)
              .map(e => {
                const vmNode = nodes.find(n => n.id === e.source);
                return { name: vmNode?.data?.label || 'Unknown VM', nicName: e.sourceHandle || 'NIC' };
              })}
            onClose={() => setSelectedNetworkForSettings(null)}
            onSave={(updates) => updateNetworkSettings(`net-${selectedNetworkForSettings.id}`, updates)}
            onDelete={() => {
              const nodeId = `net-${selectedNetworkForSettings.id}`;
              setSelectedNetworkForSettings(null);
              deleteNetwork(nodeId);
            }}
          />
        </div>
      )}

      {/* Sync Progress Modal */}
      {syncModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200 overflow-hidden">
            {syncModal.isConfirming ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                    <RefreshCw className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Sync Environments</h3>
                </div>
                <p className="text-slate-600 dark:text-secondary">
                  This will push all current network changes to <span className="font-bold text-blue-500">ALL active student environments</span> for classes using this template.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setSyncModal({ isOpen: false, isConfirming: true, logs: [] })}
                    className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-secondary transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeSyncEnvironments}
                    className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all"
                  >
                    Start Sync
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sync Progress</h3>
                  {!isLoading && (
                    <button
                      onClick={() => setSyncModal({ isOpen: false, isConfirming: true, logs: [] })}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-500" />
                    </button>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                  {syncModal.logs.map((log, idx) => (
                    <div 
                      key={idx}
                      className={clsx(
                        "flex items-start gap-2 text-sm py-1",
                        log.status === 'success' && "text-emerald-600 dark:text-emerald-400",
                        log.status === 'error' && "text-red-600 dark:text-red-400",
                        log.status === 'info' && "text-blue-600 dark:text-blue-400"
                      )}
                    >
                      <span className="mt-0.5">
                        {log.status === 'success' && '✓'}
                        {log.status === 'error' && '✗'}
                        {log.status === 'info' && '→'}
                      </span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-blue-500">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Syncing...</span>
                    </div>
                  )}
                </div>
                {!isLoading && (
                  <button
                    onClick={() => setSyncModal({ isOpen: false, isConfirming: true, logs: [] })}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-white transition-all"
                  >
                    Close
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* NIC Settings Modal */}
      {selectedNICForSettings && (
        <NICSettingsModal
          isOpen={!!selectedNICForSettings}
          onClose={() => setSelectedNICForSettings(null)}
          onSave={(settings) => {
            setNicSettings(prev => ({
                ...prev,
                [`${selectedNICForSettings.vmId}-${selectedNICForSettings.nicName}`]: {
                    adapter_type: settings.model, // Map model to adapter_type for backend
                    model: settings.model, // Keep model for frontend state
                    firewall: settings.firewall,
                    mtu: settings.mtu,
                    mac_address: settings.mac, // Map mac to mac_address for backend
                    mac: settings.mac, // Keep mac for frontend state
                    rate_limit: settings.rate_limit,
                    queues: settings.multiqueue, // Map multiqueue to queues for backend
                    multiqueue: settings.multiqueue, // Keep multiqueue for frontend state
                    link_down: settings.disconnect, // Map disconnect to link_down for backend
                    disconnect: settings.disconnect // Keep disconnect for frontend state
                }
            }));
            showToast('NIC settings updated (Save Topology to apply)', 'success');
          }}
          initialSettings={{
            nicName: selectedNICForSettings.nicName,
            vmName: selectedNICForSettings.vmName,
            model: selectedNICForSettings.model || 'virtio',
            firewall: selectedNICForSettings.firewall || false,
            mtu: selectedNICForSettings.mtu,
            mac: selectedNICForSettings.mac,
            rate_limit: selectedNICForSettings.rate_limit,
            multiqueue: selectedNICForSettings.multiqueue,
            disconnect: selectedNICForSettings.disconnect || false
          }}
          provider={templateProvider}
        />
      )}
    </div>
  );
};

export default NetworkDesigner;
