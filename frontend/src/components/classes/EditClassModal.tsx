import React, { useState, useEffect } from 'react';
import { 
    Layers, Users, Key, Save, ChevronDown, Check, Calendar, 
    BookOpen, Settings, Info, RefreshCw
} from 'lucide-react';
import Modal from '../Modal';
import DatePicker from '../DatePicker';
import { getProviderIcon } from '../ProviderIcons';
import type { ClassModel, Template } from '../../types/class';
import { statusConfig } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';
import clsx from 'clsx';

interface EditClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    classData: ClassModel | null;
    templates: Template[];
}

const EditClassModal: React.FC<EditClassModalProps> = ({ isOpen, onClose, onSuccess, classData, templates }) => {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
    
    // Initial State is empty, populated via useEffect when classData changes
    const [form, setForm] = useState<Partial<ClassModel>>({});
    
    // Date objects for DatePicker
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);

    useEffect(() => {
        if (classData && isOpen) {
            setForm({
                ...classData,
                template_id: classData.template_id || (classData.template ? classData.template.id : undefined)
            });
            setStartDate(classData.start_date ? new Date(classData.start_date) : null);
            setEndDate(classData.end_date ? new Date(classData.end_date) : null);
        }
    }, [classData, isOpen]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!classData) return;

        setIsSubmitting(true);
        try {
            // Prepare payload
            const payload = {
                ...form,
                start_date: startDate ? startDate.toISOString() : form.start_date,
                end_date: endDate ? endDate.toISOString() : form.end_date
            };

            await api.put(`/classes/${classData.id}`, payload);
            showToast('Class updated successfully', 'success');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to update class:', error);
            showToast('Failed to update class', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!classData) return null;

    // Get selected display template
    const selectedTemplate = templates.find(t => t.id === form.template_id);
    const SelectedProviderIcon = selectedTemplate ? getProviderIcon(selectedTemplate.provider) : Layers;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Class"
            icon={<Settings className="w-5 h-5 text-purple-500" />}
            maxWidth="xl"
        >
            <form onSubmit={handleUpdate} className="space-y-4">
                {/* Compact Header Section */}
                <div className="bg-secondary/10 p-3 rounded-xl border border-theme/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-3">
                            <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-1 block">Class Name</label>
                                <div className="relative">
                                    <BookOpen className="absolute left-3 top-2.5 w-4 h-4 text-secondary" />
                                    <input
                                        type="text"
                                        value={form.name || ''}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-purple-500/50 outline-none"
                                        placeholder="Class name..."
                                        required
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-1 block">Description</label>
                                <textarea
                                    value={form.description || ''}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs min-h-[50px] resize-none focus:ring-2 focus:ring-purple-500/50 outline-none"
                                    placeholder="Optional description..."
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-1 block">Status</label>
                                <div className="relative">
                                    <select
                                        value={form.status || 'draft'}
                                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                                        className="w-full pl-3 pr-8 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm font-bold appearance-none cursor-pointer focus:ring-2 focus:ring-purple-500/50 outline-none"
                                    >
                                        {Object.entries(statusConfig).map(([key, config]) => (
                                            <option key={key} value={key}>{config.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-secondary pointer-events-none" />
                                </div>
                            </div>

                            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Key className="w-4 h-4 text-purple-500" />
                                    <div>
                                        <p className="text-[9px] font-bold text-purple-500 uppercase">Enrollment Key</p>
                                        <p className="text-sm font-mono font-bold text-primary">{form.passcode || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Scheduling */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">Scheduling & Scale</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Start Date</label>
                                <DatePicker
                                    selected={startDate}
                                    onChange={(date) => setStartDate(date)}
                                    showTimeSelect
                                    dateFormat="MM/dd/yy"
                                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">End Date</label>
                                <DatePicker
                                    selected={endDate}
                                    onChange={(date) => setEndDate(date)}
                                    showTimeSelect
                                    dateFormat="MM/dd/yy"
                                    minDate={startDate || undefined}
                                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs"
                                />
                            </div>
                        </div>

                        <div className="p-3 rounded-xl bg-secondary/5 border border-theme flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Users className="w-5 h-5 text-blue-500" />
                                <div>
                                    <p className="text-xs font-bold text-primary italic uppercase tracking-tighter">Active Seats</p>
                                    <p className="text-[9px] text-secondary">Max concurrent attendees</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-theme">
                                <input
                                    type="number"
                                    min="1"
                                    max="200"
                                    value={form.max_users || 1}
                                    onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) })}
                                    className="w-10 bg-transparent text-center text-sm font-bold text-primary outline-none"
                                />
                                <span className="text-[9px] font-bold text-secondary uppercase">Pax</span>
                            </div>
                        </div>
                    </div>

                    {/* Infrastructure */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-500" />
                            <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">Architectural Base</h3>
                        </div>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                className={clsx(
                                    "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                                    isTemplateDropdownOpen 
                                        ? "bg-white dark:bg-slate-900 border-purple-500" 
                                        : "bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-purple-500/50"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={clsx(
                                        "w-10 h-10 rounded-lg flex items-center justify-center shadow-sm",
                                        selectedTemplate ? "bg-purple-600 text-white" : "bg-secondary/50 text-secondary"
                                    )}>
                                        <SelectedProviderIcon className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        {selectedTemplate ? (
                                            <>
                                                <div className="text-xs font-bold text-primary uppercase">{selectedTemplate.name}</div>
                                                <div className="text-[9px] font-bold text-purple-500 uppercase">{selectedTemplate.provider}</div>
                                            </>
                                        ) : (
                                            <span className="text-xs font-bold text-secondary">Select Blueprint...</span>
                                        )}
                                    </div>
                                </div>
                                <ChevronDown className={clsx("w-4 h-4 text-secondary transition-transform", isTemplateDropdownOpen && "rotate-180")} />
                            </button>

                            {isTemplateDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50">
                                    <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                        {templates.map(template => {
                                            const ItemIcon = getProviderIcon(template.provider);
                                            return (
                                                <button
                                                    key={template.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setForm({...form, template_id: template.id});
                                                        setIsTemplateDropdownOpen(false);
                                                    }}
                                                    className={clsx(
                                                        "w-full flex items-center justify-between p-2 rounded-lg transition-colors border-none",
                                                        form.template_id === template.id 
                                                            ? "bg-purple-500/10" 
                                                            : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={clsx(
                                                            "w-8 h-8 rounded-lg flex items-center justify-center",
                                                            form.template_id === template.id ? "bg-purple-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-secondary"
                                                        )}>
                                                            <ItemIcon className="w-4 h-4" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="text-xs font-bold text-primary truncate w-32">{template.name}</div>
                                                            <div className="text-[9px] text-secondary uppercase italic">{template.provider}</div>
                                                        </div>
                                                    </div>
                                                    {form.template_id === template.id && (
                                                        <Check className="w-4 h-4 text-purple-600" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {selectedTemplate && (
                            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[10px] text-secondary">
                                <div className="flex items-center gap-2 mb-1">
                                    <Info className="w-3 h-3 text-emerald-500" />
                                    <span className="font-bold text-emerald-600 uppercase tracking-tighter">Architecture Summary</span>
                                </div>
                                Optimized <span className="text-primary font-bold">{selectedTemplate.provider}</span> resource allocation for training workloads.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions - Compact */}
                <div className="flex items-center gap-3 pt-3 mt-2 border-t border-theme">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-secondary hover:text-primary transition-colors"
                    >
                        Discard
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Update Class
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditClassModal;
