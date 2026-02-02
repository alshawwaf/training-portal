import React, { useState } from 'react';
import { Layers, Key, ChevronDown, Check, Sparkles, Calendar, Users, BookOpen, RefreshCw, HardDrive } from 'lucide-react';
import Modal from '../Modal';
import DatePicker from '../DatePicker';
import { getProviderIcon } from '../ProviderIcons';
import type { Template, ClassModel } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';
import clsx from 'clsx';
import ProgressModal from './ProgressModal';

interface Datastore {
    name: string;
    moid: string;
    type: string;
    capacity_gb: number;
    free_gb: number;
    used_percent: number;
    accessible: boolean;
}

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
    const [createdClassForProvisioning, setCreatedClassForProvisioning] = useState<ClassModel | null>(null);
    
    const defaultForm = {
        name: '',
        blueprint_id: '',
        template_id: '',
        max_users: 1,
        passcode: 'Cpwins!1',
        start_date: new Date(),
        end_date: new Date(Date.now() + 7*24*60*60*1000),
        status: 'draft',
        description: '',
        allow_multi_env: false,
    };

    const [form, setForm] = useState(defaultForm);
    const [startDate, setStartDate] = useState<Date>(new Date());
    const [endDate, setEndDate] = useState<Date>(new Date(Date.now() + 7*24*60*60*1000));
    const [datastores, setDatastores] = useState<Datastore[]>([]);
    const [loadingDatastores, setLoadingDatastores] = useState(false);
    const [selectedDatastore, setSelectedDatastore] = useState<string>('');

    React.useEffect(() => {
        if (isOpen) {
             setForm(defaultForm);
             setStartDate(new Date());
             setEndDate(new Date(Date.now() + 7*24*60*60*1000));
             setIsTemplateDropdownOpen(false);
             setDatastores([]);
             setSelectedDatastore('');
             setCreatedClassForProvisioning(null);
        }
    }, [isOpen]);

    // ... useEffect for datastores ...
    React.useEffect(() => {
        const fetchDatastores = async () => {
            if (!form.template_id) {
                setDatastores([]);
                return;
            }
            const template = templates.find(t => t.id.toString() === form.template_id);
            if (!template?.connection_id) return;

            setLoadingDatastores(true);
            try {
                const res = await api.get(`/infrastructure-connections/${template.connection_id}/datastores`);
                if (res.data.success) {
                    setDatastores(res.data.datastores || []);
                }
            } catch (err) {
                console.error('Failed to fetch datastores:', err);
            } finally {
                setLoadingDatastores(false);
            }
        };
        fetchDatastores();
    }, [form.template_id, templates]);

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
                template_id: Number(form.template_id),
                target_datastore: selectedDatastore || null
            };

            const res = await api.post('/classes/', payload);
            
            if (form.status === 'active') {
                setCreatedClassForProvisioning(res.data);
                showToast('Class created. Starting provisioning...', 'success');
            } else {
                showToast('Class draft created successfully', 'success');
                onSuccess();
                onClose();
            }
        } catch (error) {
            showToast('Failed to create class', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedTemplate = templates.find(t => t.id.toString() === form.template_id);
    const SelectedProviderIcon = selectedTemplate ? getProviderIcon(selectedTemplate.provider) : Layers;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Class" icon={<Sparkles className="w-5 h-5 text-violet-500" />} maxWidth="md">
            <form onSubmit={handleCreate} className="space-y-5">
                {/* Class Name */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" /> Class Name
                    </label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                        placeholder="e.g. Advanced Cybersecurity Training"
                        required
                        autoFocus
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Description (optional)</label>
                    <input
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                        placeholder="Brief description..."
                    />
                </div>

                {/* Passcode + Max Users */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5" /> Passcode
                        </label>
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-xl">
                            <input 
                                type="text"
                                value={form.passcode}
                                onChange={(e) => setForm({...form, passcode: e.target.value})}
                                className="flex-1 bg-transparent text-sm font-mono font-bold text-violet-700 dark:text-violet-400 outline-none"
                                placeholder="Enter code"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Max Seats
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="200"
                            value={form.max_users}
                            onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) || 1 })}
                            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> Start Date
                        </label>
                        <DatePicker
                            selected={startDate}
                            onChange={(date) => date && setStartDate(date)}
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
                            onChange={(date) => date && setEndDate(date)}
                            showTimeSelect
                            dateFormat="MMM d, yyyy"
                            minDate={startDate}
                            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm"
                        />
                    </div>
                </div>

                {/* Template Selection */}
                <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" /> Template
                    </label>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                            className={clsx(
                                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all",
                                isTemplateDropdownOpen 
                                    ? "bg-white dark:bg-slate-900 border-violet-500 ring-2 ring-violet-500/20" 
                                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-violet-500/50"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className={clsx(
                                    "w-9 h-9 rounded-lg flex items-center justify-center",
                                    selectedTemplate ? "bg-violet-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                                )}>
                                    <SelectedProviderIcon className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    {selectedTemplate ? (
                                        <>
                                            <div className="text-sm font-semibold text-slate-900 dark:text-white">{selectedTemplate.name}</div>
                                            <div className="text-xs text-violet-600 dark:text-violet-400">{selectedTemplate.provider}</div>
                                        </>
                                    ) : (
                                        <span className="text-sm text-slate-400">Select a template...</span>
                                    )}
                                </div>
                            </div>
                            <ChevronDown className={clsx("w-4 h-4 text-slate-400 transition-transform", isTemplateDropdownOpen && "rotate-180")} />
                        </button>

                        {isTemplateDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="max-h-48 overflow-y-auto">
                                    {templates.map(template => {
                                        const ItemIcon = getProviderIcon(template.provider);
                                        const isSelected = form.template_id === template.id.toString();
                                        return (
                                            <button
                                                key={template.id}
                                                type="button"
                                                onClick={() => {
                                                    setForm({...form, template_id: template.id.toString(), blueprint_id: template.id.toString()});
                                                    setIsTemplateDropdownOpen(false);
                                                }}
                                                className={clsx(
                                                    "w-full flex items-center gap-3 px-3 py-2.5 transition-colors",
                                                    isSelected ? "bg-violet-50 dark:bg-violet-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                                    isSelected ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                                )}>
                                                    <ItemIcon className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <div className="text-sm font-medium text-slate-900 dark:text-white">{template.name}</div>
                                                    <div className="text-xs text-slate-500">{template.description || template.provider}</div>
                                                </div>
                                                {isSelected && <Check className="w-4 h-4 text-violet-600" />}
                                            </button>
                                        );
                                    })}
                                    {templates.length === 0 && (
                                        <div className="p-4 text-center text-sm text-slate-400">No templates available</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Datastore (when template selected) */}
                {form.template_id && (
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <HardDrive className="w-3.5 h-3.5" /> Target Datastore
                        </label>
                        <div className="relative">
                            <select
                                value={selectedDatastore}
                                onChange={(e) => setSelectedDatastore(e.target.value)}
                                disabled={loadingDatastores}
                                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 hover:border-violet-500/50 outline-none transition-all"
                            >
                                <option value="">Use template's datastore</option>
                                {datastores.filter(ds => ds.accessible).map(ds => (
                                    <option key={ds.moid} value={ds.name}>
                                        {ds.name} — {ds.free_gb.toFixed(0)} GB free
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                        {loadingDatastores && (
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Loading datastores...
                            </p>
                        )}
                    </div>
                )}

                {/* Options */}
                <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <input
                        type="checkbox"
                        checked={form.allow_multi_env}
                        onChange={() => setForm({ ...form, allow_multi_env: !form.allow_multi_env })}
                        className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">Allow multiple environments</div>
                        <div className="text-xs text-slate-500">Let users create more than one environment</div>
                    </div>
                </label>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    
                    <div className="flex-1 flex items-center justify-end gap-3">
                        <select
                            value={form.status === 'active' ? 'now' : 'later'}
                            onChange={(e) => setForm({ ...form, status: e.target.value === 'now' ? 'active' : 'draft' })}
                            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-white appearance-none cursor-pointer"
                        >
                            <option value="later">Save as Draft</option>
                            <option value="now">Provision Now</option>
                        </select>

                        <button
                            type="submit"
                            disabled={isSubmitting || !form.name || !form.template_id}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <><RefreshCw className="w-4 h-4 animate-spin" /> Creating...</>
                            ) : (
                                <><Sparkles className="w-4 h-4" /> Create Class</>
                            )}
                        </button>
                    </div>
                </div>
            </form>

            {createdClassForProvisioning && (
                <ProgressModal
                    isOpen={true}
                    onClose={() => {
                        setCreatedClassForProvisioning(null);
                        onClose(); 
                        onSuccess(); 
                    }}
                    title="Provisioning Class"
                    subtitle={`Provisioning resources for ${createdClassForProvisioning.name}...`}
                    apiUrl={`/classes/${createdClassForProvisioning.id}/provision`}
                    method="POST"
                />
            )}
        </Modal>
    );
};

export default CreateClassModal;
