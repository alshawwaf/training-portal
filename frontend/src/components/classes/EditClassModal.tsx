import React, { useState, useEffect } from 'react';
import { 
    Layers, Users, Key, Save, ChevronDown, Check, Calendar, 
    BookOpen, Settings, RefreshCw, Copy
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
    const [form, setForm] = useState<Partial<ClassModel>>({});
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [copied, setCopied] = useState(false);

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
            showToast('Failed to update class', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!classData) return null;

    const selectedTemplate = templates.find(t => t.id === form.template_id);
    const SelectedProviderIcon = selectedTemplate ? getProviderIcon(selectedTemplate.provider) : Layers;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Class" icon={<Settings className="w-5 h-5 text-violet-500" />} maxWidth="lg">
            <form onSubmit={handleUpdate} className="space-y-5">
                {/* Class Name */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Class Name</label>
                    <div className="relative">
                        <BookOpen className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={form.name || ''}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                            placeholder="Enter class name"
                            required
                        />
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Description</label>
                    <textarea
                        value={form.description || ''}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm min-h-[70px] resize-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                        placeholder="Optional description..."
                    />
                </div>

                {/* Status + Passcode Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Status</label>
                        <div className="relative">
                            <select
                                value={form.status || 'draft'}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-medium appearance-none cursor-pointer focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                            >
                                {Object.entries(statusConfig).map(([key, config]) => (
                                    <option key={key} value={key}>{config.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Passcode</label>
                        <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(form.passcode || ''); setCopied(true); showToast('Passcode copied!', 'success'); setTimeout(() => setCopied(false), 2000); }}
                            className="group w-full flex items-center justify-between px-4 py-2.5 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-xl hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Key className="w-4 h-4 text-violet-500" />
                                <span className="text-sm font-mono font-bold text-violet-700 dark:text-violet-400">{form.passcode || '—'}</span>
                            </div>
                            {copied ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                            ) : (
                                <Copy className="w-3.5 h-3.5 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Dates Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> Start Date
                        </label>
                        <DatePicker
                            selected={startDate}
                            onChange={(date) => setStartDate(date)}
                            showTimeSelect
                            dateFormat="MMM d, yyyy"
                            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> End Date
                        </label>
                        <DatePicker
                            selected={endDate}
                            onChange={(date) => setEndDate(date)}
                            showTimeSelect
                            dateFormat="MMM d, yyyy"
                            minDate={startDate || undefined}
                            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm"
                        />
                    </div>
                </div>

                {/* Seats + Template Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Max Seats
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="200"
                            value={form.max_users || 1}
                            onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) })}
                            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" /> Template
                        </label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-violet-500/50 transition-all"
                            >
                                <div className="flex items-center gap-2">
                                    <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center", selectedTemplate ? "bg-violet-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-400")}>
                                        <SelectedProviderIcon className="w-4 h-4" />
                                    </div>
                                    <span className={clsx("text-sm font-medium", selectedTemplate ? "text-slate-900 dark:text-white" : "text-slate-400")}>{selectedTemplate?.name || 'Select...'}</span>
                                </div>
                                <ChevronDown className={clsx("w-4 h-4 text-slate-400 transition-transform", isTemplateDropdownOpen && "rotate-180")} />
                            </button>

                            {isTemplateDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                                    {templates.map(template => {
                                        const ItemIcon = getProviderIcon(template.provider);
                                        return (
                                            <button
                                                key={template.id}
                                                type="button"
                                                onClick={() => { setForm({...form, template_id: template.id}); setIsTemplateDropdownOpen(false); }}
                                                className={clsx("w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors", form.template_id === template.id && "bg-violet-50 dark:bg-violet-500/10")}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={clsx("w-6 h-6 rounded-lg flex items-center justify-center", form.template_id === template.id ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400")}>
                                                        <ItemIcon className="w-3.5 h-3.5" />
                                                    </div>
                                                    <span className="text-sm text-slate-900 dark:text-white">{template.name}</span>
                                                </div>
                                                {form.template_id === template.id && <Check className="w-4 h-4 text-violet-600" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Changes</>}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditClassModal;
