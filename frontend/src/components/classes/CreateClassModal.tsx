import React, { useState } from 'react';
import { Layers, Users, Key, ChevronDown, Check, Calendar, Sparkles, BookOpen, Info, Zap } from 'lucide-react';
import Modal from '../Modal';
import DatePicker from '../DatePicker';
import { getProviderIcon } from '../ProviderIcons';
import type { Template } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';
import clsx from 'clsx';

interface CreateClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    templates: Template[];
}

const CreateClassModal: React.FC<CreateClassModalProps> = ({ isOpen, onClose, onSuccess, templates }) => {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
    
    // Default form configuration
    const defaultForm = {
        name: '',
        blueprint_id: '',
        template_id: '',
        max_users: 1,
        passcode: 'Cpwins!1',
        start_date: new Date(),
        end_date: new Date(Date.now() + 7*24*60*60*1000), // +7 days
        status: 'draft',
        description: '',
        allow_multi_env: false,
    };

    const [form, setForm] = useState(defaultForm);
    const [startDate, setStartDate] = useState<Date>(new Date());
    const [endDate, setEndDate] = useState<Date>(new Date(Date.now() + 7*24*60*60*1000));

    // Reset form when opening
    React.useEffect(() => {
        if (isOpen) {
             setForm(defaultForm);
             setStartDate(new Date());
             setEndDate(new Date(Date.now() + 7*24*60*60*1000));
             setIsTemplateDropdownOpen(false);
        }
    }, [isOpen]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!form.name || !form.template_id) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                ...form,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                template_id: Number(form.template_id)
            };

            const res = await api.post('/classes/', payload);
            
            // If active (Provision Now), trigger provisioning
            if (form.status === 'active') {
                try {
                    // Trigger provisioning (fire and forget or basic await)
                    // Note: provisioning endpoint streams, but axios will wait for connection closing or we skip await if we want async
                    // Best transparency: Let it start and confirm.
                    api.post(`/classes/${res.data.id}/provision`).catch(err => {
                        console.error("Provisioning trigger error (background):", err);
                    });
                    showToast('Class created & provisioning started', 'success');
                } catch (provError) {
                    console.error("Provisioning failed to start:", provError);
                    showToast('Class created, but provisioning failed to start', 'warning');
                }
            } else {
                showToast('Class draft created successfully', 'success');
            }

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to create class:', error);
            showToast('Failed to create class', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Get selected template object for display
    const selectedTemplate = templates.find(t => t.id.toString() === form.template_id);
    const SelectedProviderIcon = selectedTemplate ? getProviderIcon(selectedTemplate.provider) : Layers;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Create New Class"
            icon={<Sparkles className="w-6 h-6 text-blue-400" />}
            maxWidth="2xl"
        >
            <form onSubmit={handleCreate} className="space-y-6">
                 {/* Header Information Card */}
                 <div className="glass-light p-5 rounded-2xl border border-white/10 dark:border-white/5 bg-gradient-to-br from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] pl-1">Name & Description</label>
                                <div className="relative group">
                                    <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="input pl-12 bg-secondary/10 dark:bg-black/20 border-theme/40 focus:border-blue-500 rounded-2xl p-4 text-primary font-bold placeholder:text-secondary/40"
                                        placeholder="e.g. Advanced Cybersecurity Workshop 2025"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="input bg-secondary/10 dark:bg-black/20 border-theme/40 focus:border-blue-500 rounded-2xl p-4 text-sm text-primary placeholder:text-secondary/40"
                                    placeholder="Optional brief description..."
                                />
                            </div>
                        </div>

                        <div className="w-full md:w-64 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] pl-1">Access Control</label>
                                <div className="p-4 rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 flex items-center justify-between group-focus-within:border-blue-500/50 transition-colors">
                                    <div className="flex items-center gap-3 w-full">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                            <Key className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Passcode</p>
                                            <input 
                                                type="text"
                                                value={form.passcode}
                                                onChange={(e) => setForm({...form, passcode: e.target.value})}
                                                className="w-full bg-transparent border-none text-sm font-mono font-black text-blue-600 dark:text-blue-400 p-0 focus:ring-0 placeholder-blue-500/30"
                                                placeholder="CODE"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column: Logistics */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-4 h-4 text-purple-500" />
                            <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.25em]">Schedule</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">Start</label>
                                <DatePicker
                                    selected={startDate}
                                    onChange={(date) => date && setStartDate(date)}
                                    showTimeSelect
                                    dateFormat="MM/dd/yyyy h:mm aa"
                                    className="input bg-secondary/20 border-theme/50 rounded-2xl p-4 text-xs font-bold"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-widest pl-1">End</label>
                                <DatePicker
                                    selected={endDate}
                                    onChange={(date) => date && setEndDate(date)}
                                    showTimeSelect
                                    dateFormat="MM/dd/yyyy h:mm aa"
                                    minDate={startDate}
                                    className="input bg-secondary/20 border-theme/50 rounded-2xl p-4 text-xs font-bold"
                                />
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-secondary/10 border border-theme flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                    <Layers className="w-6 h-6 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-primary uppercase tracking-tight">Multiple Envs</p>
                                    <p className="text-xs text-secondary font-medium">Allow same user multi-env</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setForm({ ...form, allow_multi_env: !form.allow_multi_env })}
                                className={clsx(
                                    "relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none",
                                    form.allow_multi_env ? "bg-blue-600" : "bg-secondary/40"
                                )}
                            >
                                <div className={clsx(
                                    "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow-sm",
                                    form.allow_multi_env ? "translate-x-6" : "translate-x-0"
                                )} />
                            </button>
                        </div>
                    </div>

                    {/* Right Column: Template Selection */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-emerald-500" />
                                <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.25em]">Blueprint</h3>
                            </div>
                        </div>

                        <div className="relative group">
                            <button
                                type="button"
                                onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                className={clsx(
                                    "w-full flex items-center justify-between p-4 rounded-[2rem] border transition-all duration-300",
                                    isTemplateDropdownOpen 
                                        ? "bg-secondary dark:bg-secondary-bg border-blue-500/50 shadow-2xl ring-4 ring-blue-500/10 z-50" 
                                        : "bg-secondary/10 dark:bg-black/20 border-theme hover:border-blue-500/30 hover:bg-secondary/20 shadow-lg"
                                )}
                            >
                                <div className="flex items-center gap-5">
                                    <div className={clsx(
                                        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-xl",
                                        selectedTemplate ? "bg-blue-600 text-white shadow-blue-500/20" : "bg-secondary/50 text-secondary"
                                    )}>
                                        <SelectedProviderIcon className="w-7 h-7" />
                                    </div>
                                    <div className="text-left">
                                        {selectedTemplate ? (
                                            <>
                                                <div className="text-sm font-black text-primary uppercase tracking-tight">{selectedTemplate.name}</div>
                                                <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-0.5">{selectedTemplate.provider}</div>
                                            </>
                                        ) : (
                                            <span className="text-sm font-bold text-secondary">Select Infrastructure Blueprint...</span>
                                        )}
                                    </div>
                                </div>
                                <ChevronDown className={clsx("w-6 h-6 text-secondary transition-transform duration-300", isTemplateDropdownOpen && "rotate-180")} />
                            </button>

                            {isTemplateDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-3 p-2 bg-secondary border border-theme/50 rounded-[2rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-[60] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                        {templates.map(template => {
                                            const ItemIcon = getProviderIcon(template.provider);
                                            return (
                                                <button
                                                    key={template.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setForm({...form, template_id: template.id.toString(), blueprint_id: template.id.toString()});
                                                        setIsTemplateDropdownOpen(false);
                                                    }}
                                                    className={clsx(
                                                        "w-full flex items-center justify-between p-4 rounded-2xl transition-all border",
                                                        form.template_id === template.id.toString()
                                                            ? "bg-blue-600/10 border-blue-500/40" 
                                                            : "bg-transparent border-transparent hover:bg-secondary/50 hover:border-theme"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={clsx(
                                                            "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
                                                            form.template_id === template.id.toString() ? "bg-blue-600 text-white" : "bg-secondary text-secondary"
                                                        )}>
                                                            <ItemIcon className="w-5 h-5" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="text-xs font-black text-primary uppercase tracking-tight">{template.name}</div>
                                                            <div className="text-[9px] font-bold text-secondary uppercase opacity-60 line-clamp-1">{template.description || 'Standard Template'}</div>
                                                        </div>
                                                    </div>
                                                    {form.template_id === template.id.toString() && (
                                                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 scale-110">
                                                            <Check className="w-4 h-4 text-white stroke-[3px]" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                        {templates.length === 0 && (
                                            <div className="p-8 text-center">
                                                <Layers className="w-8 h-8 text-secondary/30 mx-auto mb-3" />
                                                <p className="text-xs font-bold text-secondary uppercase">No blueprints available</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {selectedTemplate && (
                            <div className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 border-dashed animate-in fade-in duration-500">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 rounded-2xl bg-emerald-500/10">
                                        <Info className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Blueprint Active</h4>
                                        <p className="text-[11px] font-medium text-secondary leading-relaxed">
                                            Selected <span className="text-primary font-bold">{selectedTemplate.name}</span> provisioned by <span className="text-primary font-bold">{selectedTemplate.provider}</span>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-4 pt-6 mt-4 border-t border-theme">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 bg-secondary/30 text-secondary hover:text-primary hover:bg-secondary/50 rounded-xl font-bold transition-all border border-transparent hover:border-theme"
                    >
                        Cancel
                    </button>
                    
                    <div className="flex-1 flex items-center justify-end gap-3">
                        {/* Provisioning Option Dropdown */}
                        <div className="relative">
                            <select
                                value={form.status === 'active' ? 'now' : 'later'}
                                onChange={(e) => setForm({ ...form, status: e.target.value === 'now' ? 'active' : 'draft' })}
                                className="appearance-none pl-10 pr-10 py-3 bg-secondary dark:bg-gray-800 border border-theme/50 hover:border-blue-500/50 rounded-xl text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer transition-all min-w-[200px]"
                            >
                                <option value="now" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Provision Now (Active)</option>
                                <option value="later" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Provision Later (Draft)</option>
                            </select>
                            {form.status === 'active' ? (
                                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                            ) : (
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                            )}
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    Create Class
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default CreateClassModal;
