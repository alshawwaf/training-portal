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
            title="Class Configuration"
            icon={<Settings className="w-6 h-6 text-purple-500" />}
            maxWidth="3xl"
        >
            <form onSubmit={handleUpdate} className="space-y-8">
                {/* Header Information Card */}
                <div className="glass-light p-6 rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-500/5 to-blue-500/5">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] pl-1">Course Identity</label>
                                <div className="relative group">
                                    <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary group-focus-within:text-purple-500 transition-colors" />
                                    <input
                                        type="text"
                                        value={form.name || ''}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="input pl-12 bg-secondary/20 border-theme/40 focus:border-purple-500 rounded-2xl p-4 text-primary font-bold placeholder:text-secondary/40"
                                        placeholder="Enter definitive class name..."
                                        required
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] pl-1">Course Description</label>
                                <textarea
                                    value={form.description || ''}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="input bg-secondary/20 border-theme/40 focus:border-purple-500 rounded-2xl p-4 text-primary font-medium min-h-[100px] resize-none"
                                    placeholder="Optional architectural or course description..."
                                />
                            </div>
                        </div>

                        <div className="w-full md:w-64 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] pl-1">Lifecycle Status</label>
                                <div className="relative">
                                    <select
                                        value={form.status || 'draft'}
                                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                                        className="input bg-secondary/20 border-theme/40 focus:border-purple-500 rounded-2xl p-4 text-primary font-bold appearance-none cursor-pointer"
                                    >
                                        {Object.entries(statusConfig).map(([key, config]) => (
                                            <option key={key} value={key}>{config.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary pointer-events-none" />
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
                                        <Key className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Enrollment Key</p>
                                        <p className="text-sm font-mono font-black text-purple-600 dark:text-purple-400 uppercase">{form.passcode || 'UNTITLED'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Logistics */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.25em]">Scheduling & Scale</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Start Date</label>
                                <DatePicker
                                    selected={startDate}
                                    onChange={(date) => setStartDate(date)}
                                    showTimeSelect
                                    dateFormat="MM/dd/yyyy h:mm aa"
                                    className="input bg-secondary/20 border-theme/50 rounded-2xl p-4 text-xs font-bold"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">End Date</label>
                                <DatePicker
                                    selected={endDate}
                                    onChange={(date) => setEndDate(date)}
                                    showTimeSelect
                                    dateFormat="MM/dd/yyyy h:mm aa"
                                    minDate={startDate || undefined}
                                    className="input bg-secondary/20 border-theme/50 rounded-2xl p-4 text-xs font-bold"
                                />
                            </div>
                        </div>

                        <div className="p-6 rounded-[2rem] bg-secondary/10 border border-theme flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                    <Users className="w-6 h-6 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-primary uppercase tracking-tight">Active Seats</p>
                                    <p className="text-xs text-secondary font-medium">Define maximum concurrent attendees</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-secondary/20 p-2 rounded-xl border border-theme">
                                <input
                                    type="number"
                                    min="1"
                                    max="200"
                                    value={form.max_users || 1}
                                    onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) })}
                                    className="w-16 bg-transparent text-center text-lg font-black text-primary focus:outline-none"
                                />
                                <span className="text-[10px] font-black text-secondary uppercase pr-2">Users</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Template Selection */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-emerald-500" />
                                <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.25em]">Architectural Base</h3>
                            </div>
                        </div>

                        <div className="relative group">
                            <button
                                type="button"
                                onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                className={clsx(
                                    "w-full flex items-center justify-between p-4 rounded-[2rem] border transition-all duration-300",
                                    isTemplateDropdownOpen 
                                        ? "bg-secondary border-purple-500/50 shadow-2xl ring-4 ring-purple-500/10" 
                                        : "bg-secondary/30 border-theme hover:border-purple-500/30 hover:bg-secondary/50 shadow-lg"
                                )}
                            >
                                <div className="flex items-center gap-5">
                                    <div className={clsx(
                                        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-xl",
                                        selectedTemplate ? "bg-purple-600 text-white shadow-purple-500/20" : "bg-secondary/50 text-secondary"
                                    )}>
                                        <SelectedProviderIcon className="w-7 h-7" />
                                    </div>
                                    <div className="text-left">
                                        {selectedTemplate ? (
                                            <>
                                                <div className="text-sm font-black text-primary uppercase tracking-tight">{selectedTemplate.name}</div>
                                                <div className="text-[10px] font-black text-purple-500 uppercase tracking-widest mt-0.5">{selectedTemplate.provider} Infrastructure</div>
                                            </>
                                        ) : (
                                            <span className="text-sm font-bold text-secondary">Select Infrastructure Blueprint...</span>
                                        )}
                                    </div>
                                </div>
                                <ChevronDown className={clsx("w-6 h-6 text-secondary transition-transform duration-300", isTemplateDropdownOpen && "rotate-180")} />
                            </button>

                            {isTemplateDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-3 p-2 bg-primary border border-theme rounded-[2rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-[60] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
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
                                                        "w-full flex items-center justify-between p-4 rounded-2xl transition-all border",
                                                        form.template_id === template.id 
                                                            ? "bg-purple-600/10 border-purple-500/40" 
                                                            : "bg-transparent border-transparent hover:bg-secondary/50 hover:border-theme"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={clsx(
                                                            "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
                                                            form.template_id === template.id ? "bg-purple-600 text-white" : "bg-secondary text-secondary"
                                                        )}>
                                                            <ItemIcon className="w-5 h-5" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="text-xs font-black text-primary uppercase tracking-tight">{template.name}</div>
                                                            <div className="text-[9px] font-bold text-secondary uppercase opacity-60 line-clamp-1">{template.description || 'Global Architectural Standard'}</div>
                                                        </div>
                                                    </div>
                                                    {form.template_id === template.id && (
                                                        <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20 scale-110">
                                                            <Check className="w-4 h-4 text-white stroke-[3px]" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                        {templates.length === 0 && (
                                            <div className="p-8 text-center">
                                                <Info className="w-8 h-8 text-secondary/30 mx-auto mb-3" />
                                                <p className="text-xs font-bold text-secondary uppercase">No blueprints available</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Premium Detail Card for Selected Template */}
                        {selectedTemplate && (
                            <div className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 border-dashed animate-in fade-in duration-500">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 rounded-2xl bg-emerald-500/10">
                                        <Info className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Architecture Summary</h4>
                                        <p className="text-[11px] font-medium text-secondary leading-relaxed">
                                            This blueprint provisioned by <span className="text-primary font-bold">{selectedTemplate.provider}</span> includes optimized resource allocation for <span className="text-primary font-bold">intensive training workloads</span>. Correct validation ensured.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4 pt-6 mt-4 border-t border-theme">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-8 py-4 bg-secondary/30 text-secondary hover:text-primary hover:bg-secondary/50 rounded-2xl font-bold transition-all border border-transparent hover:border-theme"
                    >
                        Discard Changes
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl font-black shadow-xl shadow-purple-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 tracking-widest uppercase italic"
                    >
                        {isSubmitting ? (
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Save Architectural Changes
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditClassModal;
