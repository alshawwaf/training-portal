import React, { useState } from 'react';
import { Layers, Users, Key, ChevronDown, Check, Calendar, Sparkles, BookOpen, Info } from 'lucide-react';
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

            await api.post('/classes/', payload);
            showToast('Class created successfully', 'success');
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
            maxWidth="3xl"
        >
            <form onSubmit={handleCreate} className="space-y-8">
                 {/* Header Information Card */}
                 <div className="glass-light p-6 rounded-[2rem] border border-white/10 bg-gradient-to-br from-blue-500/5 to-purple-500/5">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] pl-1">Name & Description</label>
                                <div className="relative group">
                                    <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="input pl-12 bg-secondary/20 border-theme/40 focus:border-blue-500 rounded-2xl p-4 text-primary font-bold placeholder:text-secondary/40"
                                        placeholder="e.g. Advanced Cybersecurity Workshop 2025"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="input bg-secondary/20 border-theme/40 focus:border-blue-500 rounded-2xl p-4 text-sm text-primary placeholder:text-secondary/40"
                                    placeholder="Optional brief description..."
                                />
                            </div>
                        </div>

                        <div className="w-full md:w-64 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] pl-1">Access Control</label>
                                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between group-focus-within:border-blue-500/50 transition-colors">
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
                                                className="w-full bg-transparent border-none text-sm font-mono font-black text-blue-600 dark:text-blue-400 uppercase p-0 focus:ring-0 placeholder-blue-500/30"
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Logistics */}
                    <div className="space-y-6">
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

                        <div className="p-6 rounded-[2rem] bg-secondary/10 border border-theme flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                    <Users className="w-6 h-6 text-purple-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-primary uppercase tracking-tight">Capacity</p>
                                    <p className="text-xs text-secondary font-medium">Max concurrent students</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-secondary/20 p-2 rounded-xl border border-theme">
                                <input
                                    type="number"
                                    min="1"
                                    max="200"
                                    value={form.max_users}
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
                                        ? "bg-secondary border-blue-500/50 shadow-2xl ring-4 ring-blue-500/10 z-50" 
                                        : "bg-secondary/30 border-theme hover:border-blue-500/30 hover:bg-secondary/50 shadow-lg"
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
                                <div className="absolute top-full left-0 right-0 mt-3 p-2 bg-primary border border-theme rounded-[2rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-[60] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
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
                        className="px-8 py-4 bg-secondary/30 text-secondary hover:text-primary hover:bg-secondary/50 rounded-2xl font-bold transition-all border border-transparent hover:border-theme"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 tracking-widest uppercase italic"
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Initializing...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5" />
                                Provision Class
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default CreateClassModal;
