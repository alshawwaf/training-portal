
import React, { useState, useEffect } from 'react';
import { Layers, Calendar, Users, Key, Save, Edit, ChevronDown, Check } from 'lucide-react';
import Modal from '../Modal';
import DatePicker from '../DatePicker';
import { ProviderIcon } from '../ProviderIcons';
import type { ClassModel, Template } from '../../types/class';
import { statusConfig } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';

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

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Class"
            icon={<Edit className="w-6 h-6 text-blue-400" />}
            maxWidth="2xl"
        >
            <form onSubmit={handleUpdate} className="space-y-6">
                <div>
                    <label className="label">Class Name</label>
                    <div className="relative">
                         <Layers className="absolute left-3 top-3 w-5 h-5 text-secondary" />
                        <input
                            type="text"
                            value={form.name || ''}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="input pl-10"
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {/* Template Selection - Custom Dropdown */}
                    <div className="md:col-span-2 relative z-50">
                        <label className="label">Template</label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${
                                    isTemplateDropdownOpen 
                                        ? 'bg-secondary border-blue-500/50 ring-1 ring-blue-500/50' 
                                        : 'bg-secondary/50 border-theme hover:border-blue-400/50 hover:bg-secondary'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    {selectedTemplate ? (
                                        <>
                                            <div className="p-2 rounded-lg bg-secondary border border-theme">
                                            <ProviderIcon provider={selectedTemplate.provider} className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-medium text-primary">{selectedTemplate.name}</div>
                                            <div className="text-xs text-secondary capitalize">{selectedTemplate.provider} Template</div>
                                        </div>
                                        </>
                                    ) : (
                                        <span className="text-gray-500">Select a template...</span>
                                    )}
                                </div>
                                <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isTemplateDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isTemplateDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-primary border border-theme rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto z-50">
                                    {templates.map(template => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => {
                                                setForm({...form, template_id: template.id});
                                                setIsTemplateDropdownOpen(false);
                                            }}
                                            className="w-full flex items-center justify-between p-3 hover:bg-secondary transition-colors border-b border-theme last:border-0"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-secondary/50 border border-theme/50">
                                                    <ProviderIcon provider={template.provider} className="w-4 h-4" />
                                                </div>
                                                <div className="text-left">
                                                    <div className="font-medium text-primary">{template.name}</div>
                                                    <div className="text-xs text-secondary">{template.description || 'No description'}</div>
                                                </div>
                                            </div>
                                            {form.template_id === template.id && (
                                                <Check className="w-5 h-5 text-blue-400" />
                                            )}
                                        </button>
                                    ))}
                                    {templates.length === 0 && (
                                        <div className="p-4 text-center text-secondary text-sm">No templates available</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>


                    <div>
                        <label className="label">Status</label>
                        <div className="relative">
                            <select
                                value={form.status || 'draft'}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="input appearance-none"
                            >
                                {Object.entries(statusConfig).map(([key, config]) => (
                                    <option key={key} value={key}>{config.label}</option>
                                ))}
                            </select>
                           <ChevronDown className="absolute right-3 top-3 w-5 h-5 text-secondary pointer-events-none" />
                        </div>
                    </div>

                    <div>
                        <label className="label">Max Users</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-3 w-5 h-5 text-secondary" />
                            <input
                                type="number"
                                min="1"
                                max="200"
                                value={form.max_users || 1}
                                onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) })}
                                className="input pl-10"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Passcode</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-3 w-5 h-5 text-secondary" />
                            <input
                                type="text"
                                value={form.passcode || ''}
                                onChange={(e) => setForm({ ...form, passcode: e.target.value })}
                                className="input pl-10 font-mono"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Start Date</label>
                        <DatePicker
                            selected={startDate}
                            onChange={(date) => setStartDate(date)}
                            showTimeSelect
                            dateFormat="MM/dd/yyyy h:mm aa"
                            icon={<Calendar className="w-5 h-5 text-secondary" />}
                        />
                    </div>

                    <div>
                        <label className="label">End Date</label>
                        <DatePicker
                            selected={endDate}
                            onChange={(date) => setEndDate(date)}
                            showTimeSelect
                            dateFormat="MM/dd/yyyy h:mm aa"
                            minDate={startDate || undefined}
                            icon={<Calendar className="w-5 h-5 text-secondary" />}
                        />
                    </div>
                </div>

                <div>
                    <label className="label">Description</label>
                    <textarea
                        value={form.description || ''}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="input h-24 resize-none"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-theme">
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <>Saving...</>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditClassModal;
