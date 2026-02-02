import React from 'react';
import { Link } from 'react-router-dom';

interface QuickAction {
    label: string;
    description: string;
    icon: React.ElementType;
    to: string;
    color: string;
    gradient: string;
}

interface QuickActionsGridProps {
    actions: QuickAction[];
}

const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({ actions }) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {actions.map((action, index) => (
                <Link
                    key={index}
                    to={action.to}
                    className="group relative overflow-hidden card p-5 hover:border-gray-600/50 transition-all duration-300 hover:scale-[1.02]"
                >
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${action.gradient} shadow-lg mb-4`}>
                        <action.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-semibold text-primary text-sm mb-1 group-hover:text-blue-400 transition-colors">
                        {action.label}
                    </h3>
                    <p className="text-xs text-secondary line-clamp-2">
                        {action.description}
                    </p>
                    {/* Hover glow */}
                    <div className={`absolute -bottom-8 -right-8 w-24 h-24 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-20 rounded-full blur-2xl transition-opacity duration-300`} />
                </Link>
            ))}
        </div>
    );
};

export default QuickActionsGrid;
