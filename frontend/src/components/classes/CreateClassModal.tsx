import React, { useState } from 'react';
import { Layers, Key, ChevronDown, Check, Sparkles } from 'lucide-react';
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
            icon={<Sparkles className="w-4 h-4 text-blue-400" />}
            maxWidth="md"
        >
            <form onSubmit={handleCreate} className="space-y-4">
                {/* Row 1: Name + Passcode */}
                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Class Name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm font-medium placeholder:text-gray-400"
                            placeholder="e.g. Advanced Cybersecurity"
                            required
                            autoFocus
                        />
                    </div>
                    <div className="w-32">
                        <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Passcode</label>
                        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
                            <Key className="w-3.5 h-3.5 text-blue-500" />
                            <input 
                                type="text"
                                value={form.passcode}
                                onChange={(e) => setForm({...form, passcode: e.target.value})}
                                className="flex-1 bg-transparent border-none text-sm font-mono font-bold text-blue-600 dark:text-blue-400 p-0 focus:ring-0 w-full"
                                placeholder="CODE"
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* Row 2: Description (optional) */}
                <div>
                    <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Description (optional)</label>
                    <input
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-400"
                        placeholder="Brief description..."
                    />
                </div>

                {/* Row 3: Schedule */}
                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Start Date</label>
                        <DatePicker
                            selected={startDate}
                            onChange={(date) => date && setStartDate(date)}
                            showTimeSelect
                            dateFormat="MM/dd/yy"
                            className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">End Date</label>
                        <DatePicker
                            selected={endDate}
                            onChange={(date) => date && setEndDate(date)}
                            showTimeSelect
                            dateFormat="MM/dd/yy"
                            minDate={startDate}
                            className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm"
                        />
                    </div>
                </div>

                {/* Row 4: Template Selection */}
                <div>
                    <label className="text-[9px] font-bold text-secondary uppercase mb-1 block">Blueprint</label>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                            className={clsx(
                                "w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all",
                                isTemplateDropdownOpen 
                                    ? "bg-white dark:bg-slate-800 border-blue-500/50 shadow-lg" 
                                    : "bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-600 hover:border-blue-400"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <div className={clsx(
                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                    selectedTemplate ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-slate-700 text-secondary"
                                )}>
                                    <SelectedProviderIcon className="w-4 h-4" />
                                </div>
                                <div className="text-left">
                                    {selectedTemplate ? (
                                        <>
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{selectedTemplate.name}</div>
                                            <div className="text-[10px] text-blue-500">{selectedTemplate.provider}</div>
                                        </>
                                    ) : (
                                        <span className="text-sm text-secondary">Select a blueprint...</span>
                                    )}
                                </div>
                            </div>
                            <ChevronDown className={clsx("w-4 h-4 text-secondary transition-transform", isTemplateDropdownOpen && "rotate-180")} />
                        </button>

                        {isTemplateDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
                                <div className="max-h-48 overflow-y-auto">
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
                                                    "w-full flex items-center gap-3 px-3 py-2 transition-colors",
                                                    form.template_id === template.id.toString()
                                                        ? "bg-blue-50 dark:bg-blue-500/10" 
                                                        : "hover:bg-gray-50 dark:hover:bg-slate-700"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-7 h-7 rounded-lg flex items-center justify-center",
                                                    form.template_id === template.id.toString() ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-slate-700 text-secondary"
                                                )}>
                                                    <ItemIcon className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{template.name}</div>
                                                    <div className="text-[10px] text-secondary">{template.description || template.provider}</div>
                                                </div>
                                                {form.template_id === template.id.toString() && (
                                                    <Check className="w-4 h-4 text-blue-500" />
                                                )}
                                            </button>
                                        );
                                    })}
                                    {templates.length === 0 && (
                                        <div className="p-4 text-center text-sm text-secondary">No blueprints available</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 5: Options */}
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.allow_multi_env}
                            onChange={() => setForm({ ...form, allow_multi_env: !form.allow_multi_env })}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Allow multiple environments per user
                    </label>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center gap-3 pt-3 border-t border-gray-200 dark:border-slate-700">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    
                    <div className="flex-1 flex items-center justify-end gap-2">
                        <select
                            value={form.status === 'active' ? 'now' : 'later'}
                            onChange={(e) => setForm({ ...form, status: e.target.value === 'now' ? 'active' : 'draft' })}
                            className="px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium text-gray-900 dark:text-white"
                        >
                            <option value="now">Provision Now</option>
                            <option value="later">Provision Later (Draft)</option>
                        </select>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium text-sm shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] disabled:opacity-50"
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
