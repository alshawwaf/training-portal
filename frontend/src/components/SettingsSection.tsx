import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface SettingsSectionProps {
    title: string;
    icon: LucideIcon;
    color: string;
    density?: 'comfortable' | 'compact';
    children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ title, icon: Icon, color, density = 'comfortable', children }) => {
    const isCompact = density === 'compact';

    return (
        <div className="card-elevated overflow-hidden">
            <div className={`flex items-center gap-3 border-b border-theme bg-${color}-500/5 ${isCompact ? 'p-3' : 'p-5'}`}>
                <div className={`${isCompact ? 'p-1.5' : 'p-2'} bg-${color}-500/10 rounded-lg`}>
                    <Icon className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-${color}-400`} />
                </div>
                <h2 className={`${isCompact ? 'text-base' : 'text-lg'} font-semibold text-primary`}>
                    {title}
                </h2>
            </div>
            <div className={isCompact ? 'p-3' : 'p-5'}>
                {children}
            </div>
        </div>
    );
};

export default SettingsSection;
