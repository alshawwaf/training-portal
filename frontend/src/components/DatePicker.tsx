import React from 'react';
import ReactDatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface DatePickerProps {
    selected: Date | null;
    onChange: (date: Date | null) => void;
    label?: string;
    placeholder?: string;
    minDate?: Date;
    showTimeSelect?: boolean;
    dateFormat?: string;
    className?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({ 
    selected, 
    onChange, 
    label, 
    placeholder, 
    minDate, 
    showTimeSelect = true, 
    dateFormat = "MMMM d, yyyy h:mm aa",
    className 
}) => {
    return (
        <div className={clsx("w-full custom-datepicker-wrapper", className)}>
            {label && <label className="input-label mb-1.5 block">{label}</label>}
            <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none group-focus-within:text-blue-500 transition-colors z-10">
                    <Calendar className="w-4 h-4" />
                </div>
                <ReactDatePicker
                    selected={selected}
                    onChange={onChange}
                    placeholderText={placeholder}
                    minDate={minDate}
                    showTimeSelect={showTimeSelect}
                    dateFormat={dateFormat}
                    className="w-full bg-elevated border border-theme rounded-lg py-1.5 pl-9 pr-3 text-sm text-primary placeholder-secondary/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm"
                    calendarClassName="!bg-elevated !border-theme !font-sans !shadow-xl !rounded-xl overflow-hidden"
                    dayClassName={date => "hover:!bg-blue-500/20 !text-primary hover:!text-blue-400 !rounded-lg transition-colors"}
                    timeClassName={time => "!text-primary hover:!bg-blue-500/20 !rounded-lg"}
                    wrapperClassName="w-full"
                    popperClassName="!z-[9999]"
                    portalId="root"
                    previousMonthButtonLabel={<ChevronLeft className="w-4 h-4 text-secondary" />}
                    nextMonthButtonLabel={<ChevronRight className="w-4 h-4 text-secondary" />}
                    
                    // Custom Header
                    renderCustomHeader={({
                        date,
                        decreaseMonth,
                        increaseMonth,
                        prevMonthButtonDisabled,
                        nextMonthButtonDisabled,
                    }) => (
                        <div className="flex items-center justify-between px-4 py-3 border-b border-theme bg-secondary/5">
                            <button
                                onClick={decreaseMonth}
                                disabled={prevMonthButtonDisabled}
                                className="p-1 hover:bg-secondary/10 rounded-full text-secondary hover:text-primary transition-colors disabled:opacity-30"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <h3 className="text-sm font-semibold text-primary">
                                {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </h3>
                            <button
                                onClick={increaseMonth}
                                disabled={nextMonthButtonDisabled}
                                className="p-1 hover:bg-secondary/10 rounded-full text-secondary hover:text-primary transition-colors disabled:opacity-30"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                />
            </div>
            
            {/* Theme-aware DatePicker Styles - targets popper which renders outside DOM tree */}
            <style>{`
                /* Force popper to be on top */
                .react-datepicker-popper {
                    z-index: 9999 !important;
                }

                /* BASE STYLES - Apply to ALL modes first, then override */
                .react-datepicker {
                    border: 1px solid #374151 !important;
                    background-color: #1f2937 !important;
                    font-family: inherit !important;
                    font-size: 0.875rem !important;
                    border-radius: 12px !important;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
                    overflow: hidden !important;
                }
                .react-datepicker__header {
                    background-color: #111827 !important;
                    border-bottom: 1px solid #374151 !important;
                    padding: 12px !important;
                }
                .react-datepicker__current-month {
                    color: #f9fafb !important;
                    font-weight: 600 !important;
                    font-size: 1rem !important;
                    margin-bottom: 8px !important;
                }
                .react-datepicker__day-names {
                    display: flex !important;
                    justify-content: space-around !important;
                }
                .react-datepicker__day-name {
                    color: #9ca3af !important;
                    font-weight: 600 !important;
                    width: 2.2rem !important;
                    font-size: 0.75rem !important;
                }
                .react-datepicker__month {
                    margin: 8px !important;
                }
                .react-datepicker__week {
                    display: flex !important;
                    justify-content: space-around !important;
                }
                .react-datepicker__day {
                    color: #f3f4f6 !important;
                    width: 2.2rem !important;
                    height: 2.2rem !important;
                    line-height: 2.2rem !important;
                    margin: 2px !important;
                    border-radius: 8px !important;
                    font-weight: 500 !important;
                }
                .react-datepicker__day:hover {
                    background-color: #374151 !important;
                    color: #60a5fa !important;
                }
                .react-datepicker__day--selected,
                .react-datepicker__day--keyboard-selected {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
                    color: #ffffff !important;
                    font-weight: 600 !important;
                }
                .react-datepicker__day--today {
                    background-color: #1e40af !important;
                    color: #ffffff !important;
                    font-weight: 700 !important;
                }
                .react-datepicker__day--outside-month {
                    color: #6b7280 !important;
                }
                .react-datepicker__navigation-icon::before {
                    border-color: #9ca3af !important;
                }
                .react-datepicker__navigation:hover .react-datepicker__navigation-icon::before {
                    border-color: #60a5fa !important;
                }
                .react-datepicker__time-container {
                    border-left: 1px solid #374151 !important;
                    width: 95px !important;
                }
                .react-datepicker__time-container .react-datepicker__time {
                    background-color: #1f2937 !important;
                }
                .react-datepicker__time-container .react-datepicker__time-box {
                    width: 95px !important;
                }
                .react-datepicker__header--time {
                    background-color: #111827 !important;
                    padding: 10px !important;
                }
                .react-datepicker-time__header {
                    color: #f9fafb !important;
                    font-weight: 600 !important;
                }
                .react-datepicker__time-list-item {
                    color: #f3f4f6 !important;
                    padding: 8px 12px !important;
                    height: auto !important;
                    font-size: 0.8rem !important;
                }
                .react-datepicker__time-list-item:hover {
                    background-color: #374151 !important;
                    color: #60a5fa !important;
                }
                .react-datepicker__time-list-item--selected {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
                    color: #ffffff !important;
                }
                .react-datepicker__triangle {
                    display: none !important;
                }

                /* LIGHT MODE OVERRIDES - Only when html does NOT have .dark class */
                html:not(.dark) .react-datepicker {
                    background-color: #ffffff !important;
                    border: 1px solid #e5e7eb !important;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15) !important;
                }
                html:not(.dark) .react-datepicker__header {
                    background-color: #f9fafb !important;
                    border-bottom: 1px solid #e5e7eb !important;
                }
                html:not(.dark) .react-datepicker__current-month {
                    color: #111827 !important;
                }
                html:not(.dark) .react-datepicker__day-name {
                    color: #6b7280 !important;
                }
                html:not(.dark) .react-datepicker__day {
                    color: #1f2937 !important;
                }
                html:not(.dark) .react-datepicker__day:hover {
                    background-color: #e0e7ff !important;
                    color: #4f46e5 !important;
                }
                html:not(.dark) .react-datepicker__day--today {
                    background-color: #dbeafe !important;
                    color: #1d4ed8 !important;
                }
                html:not(.dark) .react-datepicker__day--outside-month {
                    color: #d1d5db !important;
                }
                html:not(.dark) .react-datepicker__navigation-icon::before {
                    border-color: #6b7280 !important;
                }
                html:not(.dark) .react-datepicker__time-container {
                    border-left: 1px solid #e5e7eb !important;
                }
                html:not(.dark) .react-datepicker__time-container .react-datepicker__time {
                    background-color: #ffffff !important;
                }
                html:not(.dark) .react-datepicker__header--time {
                    background-color: #f9fafb !important;
                }
                html:not(.dark) .react-datepicker-time__header {
                    color: #111827 !important;
                }
                html:not(.dark) .react-datepicker__time-list-item {
                    color: #1f2937 !important;
                }
                html:not(.dark) .react-datepicker__time-list-item:hover {
                    background-color: #e0e7ff !important;
                    color: #4f46e5 !important;
                }
            `}</style>
        </div>
    );
};

export default DatePicker;
