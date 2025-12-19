import React from 'react';
import Modal from '../Modal';
import { Server, CheckCircle2 } from 'lucide-react';
import { AwsIcon, AzureIcon, GcpIcon, ProxmoxIcon, VMwareIcon } from '../ProviderIcons';
import clsx from 'clsx';

interface ProviderOption {
    id: string;
    name: string;
    description: string;
    icon: any;
    color: string;
    configured: boolean; // In a real app, check if creds exist
    type: 'onprem' | 'cloud';
}

interface ProviderSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (providerId: string) => void;
}

const ProviderSelectionModal: React.FC<ProviderSelectionModalProps> = ({ isOpen, onClose, onSelect }) => {
    // In a real implementation, 'configured' would be dynamic based on system settings
    const providers: ProviderOption[] = [
        { 
            id: 'vSphere', 
            name: 'VMware vSphere', 
            description: 'Enterprise virtualization and private cloud orchestration.', 
            icon: VMwareIcon, 
            color: 'blue', 
            configured: true,
            type: 'onprem'
        },
        { 
            id: 'Proxmox', 
            name: 'Proxmox VE', 
            description: 'Open-source server virtualization management platform.', 
            icon: ProxmoxIcon, 
            color: 'orange', 
            configured: true,
            type: 'onprem'
        },
        { 
            id: 'AWS', 
            name: 'Amazon Web Services', 
            description: 'Scalable cloud computing services.', 
            icon: AwsIcon, 
            color: 'amber', 
            configured: false,
            type: 'cloud'
        },
        { 
            id: 'Azure', 
            name: 'Microsoft Azure', 
            description: 'Cloud computing service created by Microsoft.', 
            icon: AzureIcon, 
            color: 'sky', 
            configured: false,
            type: 'cloud'
        },
        { 
            id: 'GCP', 
            name: 'Google Cloud', 
            description: 'Suite of cloud computing services.', 
            icon: GcpIcon, 
            color: 'red', 
            configured: false,
            type: 'cloud'
        }
    ];

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Select Infrastructure" 
            icon={<Server className="w-6 h-6 text-purple-500" />}
            maxWidth="4xl"
        >
            <div className="space-y-8 p-2">
                <div className="text-center space-y-2 mb-8">
                    <h3 className="text-2xl font-black text-primary tracking-tight">Where should this blueprint be deployed?</h3>
                    <p className="text-secondary font-medium">Choose the underlying infrastructure provider for your new environment template.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {providers.map(provider => (
                        <button
                            key={provider.id}
                            onClick={() => onSelect(provider.id)}
                            className="group relative flex flex-col items-start text-left p-6 glass rounded-[2rem] border border-theme transition-all duration-300 hover:scale-[1.02] hover:border-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/10 active:scale-[0.98]"
                        >
                            <div className={clsx(
                                "p-4 rounded-2xl mb-6 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-lg",
                                `bg-${provider.color}-500/10 text-${provider.color}-500 border border-${provider.color}-500/20`
                            )}>
                                <provider.icon className="w-8 h-8" />
                            </div>
                            
                            <h4 className="text-lg font-black text-primary tracking-tight mb-2 group-hover:text-blue-500 transition-colors">
                                {provider.name}
                            </h4>
                            <p className="text-sm text-secondary font-medium leading-relaxed opacity-80 mb-6">
                                {provider.description}
                            </p>

                            <div className="mt-auto w-full flex items-center justify-between pt-4 border-t border-theme/50">
                                <span className={clsx(
                                    "text-[10px] font-black uppercase tracking-widest",
                                    provider.configured ? "text-emerald-500" : "text-secondary opacity-50"
                                )}>
                                    {provider.configured ? "Ready to Deploy" : "Not Configured"}
                                </span>
                                {provider.configured && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                            </div>

                            {/* Hover Glow */}
                            <div className={clsx(
                                "absolute inset-0 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10",
                                `bg-gradient-to-br from-${provider.color}-500/5 to-transparent`
                            )} />
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

export default ProviderSelectionModal;
