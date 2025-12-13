import React from 'react';
import { Search, X, Filter } from 'lucide-react';
import DateRangePicker, { DateRange } from './DateRangePicker';

interface FilterOption {
    value: string;
    label: string;
}

interface FilterConfig {
    key: string;
    label: string;
    options: FilterOption[];
    value: string;
}

interface FilterBarProps {
    searchValue: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;
    dateRange: DateRange;
    onDateRangeChange: (range: DateRange) => void;
    filters: FilterConfig[];
    onFilterChange: (key: string, value: string) => void;
    onClearFilters?: () => void;
    className?: string;
}

const FilterBar: React.FC<FilterBarProps> = ({
    searchValue,
    onSearchChange,
    searchPlaceholder = 'Search...',
    dateRange,
    onDateRangeChange,
    filters,
    onFilterChange,
    onClearFilters,
    className = ''
}) => {
    const hasActiveFilters = 
        searchValue || 
        dateRange.start || 
        dateRange.end || 
        filters.some(f => f.value !== 'all');

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Main Filter Row */}
            <div className="flex flex-wrap items-center gap-4">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[250px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                    <input
                        type="text"
                        value={searchValue}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                    />
                    {searchValue && (
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-secondary hover:text-primary"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Date Range Picker */}
                <DateRangePicker
                    value={dateRange}
                    onChange={onDateRangeChange}
                />

                {/* Clear Filters Button */}
                {hasActiveFilters && onClearFilters && (
                    <button
                        onClick={onClearFilters}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Filter Dropdowns Row */}
            {filters.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                    <Filter className="w-4 h-4 text-secondary" />
                    {filters.map(filter => (
                        <div key={filter.key} className="flex items-center gap-2">
                            <label className="text-xs text-secondary uppercase tracking-wide">
                                {filter.label}:
                            </label>
                            <select
                                value={filter.value}
                                onChange={e => onFilterChange(filter.key, e.target.value)}
                                className="px-3 py-2 bg-secondary/50 border border-theme rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
                            >
                                {filter.options.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FilterBar;
