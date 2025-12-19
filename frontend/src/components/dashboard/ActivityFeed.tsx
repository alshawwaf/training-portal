import React from 'react';
import { 
    Activity, 
    CheckCircle, 
    AlertCircle, 
    Clock, 
    User, 
} from 'lucide-react';

interface ActivityItem {
    id: string;
    type: 'success' | 'warning' | 'info' | 'error';
    action: string;
    target: string;
    user?: string;
    timestamp: Date;
}

interface ActivityFeedProps {
    items: ActivityItem[];
    maxItems?: number;
}

const iconMap = {
    success: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    warning: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    info: { icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    error: { icon: AlertCircle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
};

const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

const ActivityFeed: React.FC<ActivityFeedProps> = ({ items, maxItems = 5 }) => {
    const displayItems = items.slice(0, maxItems);
    
    if (displayItems.length === 0) {
        return (
            <div className="text-center py-8">
                <Activity className="w-8 h-8 text-secondary mx-auto mb-2 opacity-50" />
                <p className="text-secondary text-sm">No recent activity</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-3">
            {displayItems.map((item) => {
                const config = iconMap[item.type];
                const Icon = config.icon;
                
                return (
                    <div 
                        key={item.id}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors"
                    >
                        <div className={`p-2 rounded-lg ${config.bg}`}>
                            <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-primary">
                                <span className="font-medium">{item.action}</span>
                                {' '}
                                <span className="text-secondary">{item.target}</span>
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                                {item.user && (
                                    <span className="text-xs text-secondary flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {item.user}
                                    </span>
                                )}
                                <span className="text-xs text-secondary flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatTimeAgo(item.timestamp)}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ActivityFeed;
