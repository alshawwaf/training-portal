import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    trend?: {
        value: number;
        label?: string;
    };
    color: 'purple' | 'emerald' | 'blue' | 'amber' | 'rose';
    sparklineData?: number[];
}

const colorMap = {
    purple: {
        gradient: 'from-purple-600 to-pink-600',
        bgGradient: 'from-purple-500/10 to-pink-500/5',
        sparkline: '#a855f7',
        text: 'text-purple-400',
    },
    emerald: {
        gradient: 'from-emerald-600 to-teal-600',
        bgGradient: 'from-emerald-500/10 to-teal-500/5',
        sparkline: '#10b981',
        text: 'text-emerald-400',
    },
    blue: {
        gradient: 'from-blue-600 to-cyan-600',
        bgGradient: 'from-blue-500/10 to-cyan-500/5',
        sparkline: '#3b82f6',
        text: 'text-blue-400',
    },
    amber: {
        gradient: 'from-amber-600 to-orange-600',
        bgGradient: 'from-amber-500/10 to-orange-500/5',
        sparkline: '#f59e0b',
        text: 'text-amber-400',
    },
    rose: {
        gradient: 'from-rose-600 to-red-600',
        bgGradient: 'from-rose-500/10 to-red-500/5',
        sparkline: '#f43f5e',
        text: 'text-rose-400',
    },
};

const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
    if (!data || data.length < 2) return null;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const width = 80;
    const height = 32;
    const padding = 2;
    
    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * (width - padding * 2);
        const y = height - padding - ((val - min) / range) * (height - padding * 2);
        return `${x},${y}`;
    }).join(' ');
    
    return (
        <svg width={width} height={height} className="opacity-60">
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
            />
        </svg>
    );
};

const StatCard: React.FC<StatCardProps> = ({
    label,
    value,
    icon: Icon,
    trend,
    color,
    sparklineData,
}) => {
    const colors = colorMap[color];
    
    return (
        <div className={`relative overflow-hidden card p-6 bg-gradient-to-br ${colors.bgGradient} hover:border-gray-600/50 transition-all duration-300 group`}>
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-sm text-secondary mb-1">{label}</p>
                    <div className="flex items-baseline gap-3">
                        <p className="text-4xl font-bold text-primary tracking-tight">{value}</p>
                        {trend && (
                            <div className={`flex items-center gap-1 text-sm ${
                                trend.value > 0 ? 'text-emerald-400' : trend.value < 0 ? 'text-rose-400' : 'text-secondary'
                            }`}>
                                {trend.value > 0 ? (
                                    <TrendingUp className="w-4 h-4" />
                                ) : trend.value < 0 ? (
                                    <TrendingDown className="w-4 h-4" />
                                ) : (
                                    <Minus className="w-4 h-4" />
                                )}
                                <span className="font-medium">
                                    {trend.value > 0 && '+'}{trend.value}%
                                </span>
                            </div>
                        )}
                    </div>
                    {trend?.label && (
                        <p className="text-xs text-secondary mt-1">{trend.label}</p>
                    )}
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${colors.gradient} shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                    </div>
                    {sparklineData && (
                        <Sparkline data={sparklineData} color={colors.sparkline} />
                    )}
                </div>
            </div>
            {/* Decorative element */}
            <div className={`absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br ${colors.gradient} opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity`} />
        </div>
    );
};

export default StatCard;
