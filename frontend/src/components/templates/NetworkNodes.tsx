import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Monitor, Cpu, HardDrive, ShieldCheck, Globe, Trash2, Settings, ArrowLeftRight } from 'lucide-react';

// NIC handle position type
type HandlePosition = 'right' | 'left' | 'bottom';

export const VMNode = memo(({ data }: any) => {
  // Track handle positions for each NIC
  const [nicPositions, setNicPositions] = useState<Record<string, HandlePosition>>({});

  const togglePosition = (nic: string) => {
    setNicPositions(prev => {
      const current = prev[nic] || 'right';
      const next = current === 'right' ? 'left' : current === 'left' ? 'bottom' : 'right';
      return { ...prev, [nic]: next };
    });
  };

  const getHandleStyle = (position: HandlePosition) => {
    switch(position) {
      case 'left':
        return { position: 'relative' as const, top: 0, left: -4, background: '#a855f7', width: 8, height: 8, border: '2px solid white' };
      case 'bottom':
        return { position: 'relative' as const, top: 4, background: '#a855f7', width: 8, height: 8, border: '2px solid white' };
      default:
        return { position: 'relative' as const, top: 0, right: -4, background: '#a855f7', width: 8, height: 8, border: '2px solid white' };
    }
  };

  return (
    <div className="bg-secondary/40 backdrop-blur-md rounded-2xl border border-purple-500/30 shadow-2xl overflow-hidden min-w-[200px]">
      <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 px-4 py-2 border-b border-purple-500/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-bold text-primary truncate max-w-[100px]">{data.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {data.onOpenSettings && (
            <button
              onClick={(e) => { e.stopPropagation(); data.onOpenSettings(data.vm_moid, data.name); }}
              className="p-1 hover:bg-purple-500/20 rounded transition-all"
              title="VM Settings"
            >
              <Settings className="w-3.5 h-3.5 text-purple-400" />
            </button>
          )}
        </div>
      </div>
      
      <div className="p-3 space-y-2">
        <div className="flex gap-4 text-[10px] text-secondary font-bold">
          <div className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {data.cpu} vCPU</div>
          <div className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {Math.round(data.memory_mb/1024)}GB</div>
        </div>
        
        <div className="space-y-1">
          {data.nics?.map((nic: string, idx: number) => {
            const pos = nicPositions[nic] || 'right';
            return (
             <div key={idx} className={`relative flex items-center bg-slate-900/40 rounded-lg px-2 py-1.5 border border-white/5 group ${pos === 'left' ? 'flex-row-reverse' : ''}`}>
                {/* Position toggle button */}
                <button 
                  onClick={(e) => { e.stopPropagation(); togglePosition(nic); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-purple-500/20 rounded transition-all mr-1"
                  title="Toggle connector side (Right → Left → Bottom)"
                >
                  <ArrowLeftRight className="w-3 h-3 text-purple-400" />
                </button>
                
                <span className="text-[10px] text-slate-400 font-medium flex-1">{nic}</span>
                
                <div className="flex items-center gap-1">
                  {/* Settings Button */}
                  {data.onOpenNICSettings && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); data.onOpenNICSettings(data.id, nic); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-purple-500/20 rounded transition-all"
                      title="NIC Settings"
                    >
                      <Settings className="w-3 h-3 text-purple-400" />
                    </button>
                  )}
                  
                  {data.onDeleteNIC && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); data.onDeleteNIC(data.id, data.name, data.vm_moid, nic); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/20 rounded transition-all"
                      title="Delete NIC"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  )}
                  <Handle
                    type="source"
                    position={pos === 'left' ? Position.Left : pos === 'bottom' ? Position.Bottom : Position.Right}
                    id={nic}
                    style={getHandleStyle(pos)}
                  />
                </div>
             </div>
            );
          })}
          
          <button 
            onClick={() => data.onAddNIC && data.onAddNIC(data.id, data.name)}
            className="w-full py-1.5 border border-dashed border-purple-500/30 rounded-lg text-[9px] font-black text-purple-400 hover:bg-purple-500/10 transition-all uppercase tracking-widest mt-1"
          >
            + Add Interface
          </button>
        </div>
      </div>
    </div>
  );
});

export const NetworkNode = memo(({ data }: any) => {
  const nodeColor = data.color || (data.is_isolated ? '#10b981' : '#3b82f6');
  const connectionCount = data.connectionCount || 0;

  return (
    <div 
      className="bg-secondary/40 backdrop-blur-md rounded-3xl border shadow-2xl p-4 min-w-[180px] text-center relative group"
      style={{ borderColor: `${nodeColor}4d` }} // 30% opacity
    >
      {/* Connection Count Badge */}
      {connectionCount > 0 && (
        <div 
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg border-2 border-white"
          style={{ backgroundColor: nodeColor }}
        >
          {connectionCount}
        </div>
      )}

      {/* Settings & Delete Buttons */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        {data.onOpenSettings && (
          <button
            onClick={(e) => { e.stopPropagation(); data.onOpenSettings(); }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-all"
            style={{ color: nodeColor }}
            title="Network Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
        {data.onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); data.onDelete(); }}
            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-all"
            title="Delete Network"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={{ left: -4, background: nodeColor, width: 10, height: 10, border: '2px solid white' }}
      />
      
      <div 
        className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center border shadow-lg mb-3"
        style={{ 
          backgroundColor: `${nodeColor}1a`, // 10% opacity
          borderColor: `${nodeColor}33`,     // 20% opacity
          color: nodeColor 
        }}
      >
        {data.is_isolated ? <ShieldCheck className="w-6 h-6" /> : <Globe className="w-6 h-6" />}
      </div>
      
      <h3 className="text-sm font-black text-primary mb-1">{data.label}</h3>
      <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">
        {data.is_isolated ? 'Isolated VLAN' : `Static: ${data.vlan || 'LAN'}`}
      </p>
    </div>
  );
});
