import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export interface DateRange {
    start: string | null;
    end: string | null;
}

interface DateRangePickerProps {
    value: DateRange;
    onChange: (range: DateRange) => void;
    className?: string;
}

const presets = [
    { label: 'Today', days: 0 },
    { label: 'Last 7 Days', days: 7 },
    { label: 'Last 30 Days', days: 30 },
    { label: 'This Month', days: -1 }, // Special handling
    { label: 'All Time', days: null },
];

const DateRangePicker: React.FC<DateRangePickerProps> = ({ value, onChange, className = '' }) => {
    const [showPresets, setShowPresets] = React.useState(false);
    
    const handlePreset = (days: number | null) => {
        if (days === null) {
            onChange({ start: null, end: null });
        } else if (days === -1) {
            // This month
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            onChange({
                start: start.toISOString().split('T')[0],
                end: now.toISOString().split('T')[0]
            });
        } else if (days === 0) {
            const today = new Date().toISOString().split('T')[0];
            onChange({ start: today, end: today });
        } else {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - days);
            onChange({
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0]
            });
        }
        setShowPresets(false);
    };

    const getPresetLabel = () => {
        if (!value.start && !value.end) return 'All Time';
        if (value.start === value.end) {
            const today = new Date().toISOString().split('T')[0];
            if (value.start === today) return 'Today';
        }
        return 'Custom Range';
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {/* Preset Dropdown */}
            <div className="relative">
                <button
                    onClick={() => setShowPresets(!showPresets)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
                >
                    <Calendar className="w-4 h-4 text-secondary" />
                    <span>{getPresetLabel()}</span>
                    <ChevronDown className="w-4 h-4 text-secondary" />
                </button>
                
                {showPresets && (
                    <div className="absolute top-full left-0 mt-1 w-44 bg-elevated border border-theme rounded-lg shadow-xl z-50 overflow-hidden">
                        {presets.map(preset => (
                            <button
                                key={preset.label}
                                onClick={() => handlePreset(preset.days)}
                                className="w-full px-4 py-2.5 text-left text-sm text-primary hover:bg-secondary/50 transition-colors"
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Custom Date Inputs */}
            <div className="flex items-center gap-2">
                <input
                    type="date"
                    value={value.start || ''}
                    onChange={e => onChange({ ...value, start: e.target.value || null })}
                    className="px-3 py-2 bg-secondary/50 border border-theme rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="Start Date"
                />
                <span className="text-secondary">to</span>
                <input
                    type="date"
                    value={value.end || ''}
                    onChange={e => onChange({ ...value, end: e.target.value || null })}
                    className="px-3 py-2 bg-secondary/50 border border-theme rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="End Date"
                />
            </div>
        </div>
    );
};

export default DateRangePicker;
