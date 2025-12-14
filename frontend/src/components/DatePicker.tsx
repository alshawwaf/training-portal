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
        <div className={clsx("w-full", className)}>
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
            
            {/* Global Styles Check - ensure distinct styles for dark mode */}
            <style>{`
                .react-datepicker {
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    background-color: #1a1b26 !important;
                    font-family: inherit !important;
                    font-size: 0.8rem !important;
                }
                .react-datepicker__header {
                    background-color: transparent !important;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
                    padding-top: 0 !important;
                }
                .react-datepicker__day-name {
                    color: #94a3b8 !important;
                    margin: 0.2rem !important;
                    width: 1.7rem !important;
                }
                .react-datepicker__day {
                    color: #e2e8f0 !important;
                    margin: 0.1rem !important;
                    width: 1.7rem !important;
                    height: 1.7rem !important;
                    line-height: 1.7rem !important;
                    font-size: 0.8rem !important;
                }
                .react-datepicker__day--selected,
                .react-datepicker__day--keyboard-selected {
                    background-color: #3b82f6 !important;
                    color: white !important;
                }
                .react-datepicker__time-container {
                    border-left: 1px solid rgba(255, 255, 255, 0.05) !important;
                    width: 80px !important;
                }
                .react-datepicker__time-container .react-datepicker__time .react-datepicker__time-box {
                    width: 80px !important;
                }
                .react-datepicker__time-container .react-datepicker__time {
                    background-color: transparent !important;
                }
                .react-datepicker__time-list-item {
                    padding: 5px 0 !important;
                    height: auto !important;
                    font-size: 0.75rem !important;
                }
                .react-datepicker__time-list-item:hover {
                    background-color: rgba(59, 130, 246, 0.1) !important;
                }
                .react-datepicker__time-list-item--selected {
                    background-color: #3b82f6 !important;
                }
            `}</style>
        </div>
    );
};

export default DatePicker;
