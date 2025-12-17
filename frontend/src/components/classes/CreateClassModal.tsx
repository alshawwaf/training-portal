import React, { useState } from 'react';
import { Layers, Calendar, Users, Key, Save, ChevronDown, Check } from 'lucide-react';
import Modal from '../Modal';
import DatePicker from '../DatePicker';
import { ProviderIcon } from '../ProviderIcons';
import type { Template } from '../../types/class';
import { useToast } from '../../context/ToastContext';
import api from '../../api';

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
        end_date: new Date(Date.now() + 7*24*60*60*1000),
        status: 'draft',
        description: '',
    };

    const [form, setForm] = useState(defaultForm);

    // Filter templates for dropdown
    const availableTemplates = templates || [];
    
    // Get selected template object for display
    const selectedTemplate = availableTemplates.find(t => t.id.toString() === form.template_id);

    const resetForm = () => {
        setForm(defaultForm);
        setIsTemplateDropdownOpen(false);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!form.name || !form.template_id) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            // Convert Date objects to ISO strings for API
            const payload = {
                ...form,
                start_date: form.start_date.toISOString(),
                end_date: form.end_date.toISOString(),
                // Keep template_id as string/number as required by backend (usually int)
                template_id: Number(form.template_id)
            };

            await api.post('/classes/', payload);
            showToast('Class created successfully', 'success');
            onSuccess();
            onClose();
            resetForm();
        } catch (error) {
            console.error('Failed to create class:', error);
            showToast('Failed to create class', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { onClose(); resetForm(); }}
            title="Create New Class"
            icon={<Layers className="w-6 h-6 text-blue-400" />}
            maxWidth="2xl"
        >
            <form onSubmit={handleCreate} className="space-y-6">
                {/* Class Name - Always on top */}
                <div>
                    <label className="label">Class Name</label>
                    <div className="relative">
                        <Layers className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="input pl-10"
                            placeholder="e.g. Advanced Security Workshop"
                            required
                        />
                    </div>
                </div>

                {/* Template Selection - Custom Dropdown */}
                <div className="relative z-50">
                    <label className="label">Class Template</label>
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
                                {availableTemplates.map(template => (
                                    <button
                                        key={template.id}
                                        type="button"
                                        onClick={() => {
                                            setForm({...form, template_id: template.id.toString(), blueprint_id: template.id.toString()});
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
                                        {form.template_id === template.id.toString() && (
                                            <Check className="w-5 h-5 text-blue-400" />
                                        )}
                                    </button>
                                ))}
                                {availableTemplates.length === 0 && (
                                    <div className="p-4 text-center text-secondary text-sm">No templates available</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Class Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Passcode */}
                    <div>
                        <label className="label">Access Code</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                            <input
                                type="text"
                                value={form.passcode}
                                onChange={(e) => setForm({ ...form, passcode: e.target.value })}
                                className="input pl-10 font-mono"
                                required
                            />
                        </div>
                    </div>

                    {/* Start Date */}
                    <div>
                        <label className="label">Start Date & Time</label>
                        <DatePicker
                            selected={form.start_date}
                            onChange={(date) => setForm({ ...form, start_date: date || new Date() })}
                            showTimeSelect
                            dateFormat="MM/dd/yyyy h:mm aa"
                            placeholderText="Select start date"
                            icon={<Calendar className="w-5 h-5 text-gray-500" />}
                        />
                    </div>

                    {/* End Date */}
                    <div>
                        <label className="label">End Date & Time</label>
                        <DatePicker
                            selected={form.end_date}
                            onChange={(date) => setForm({ ...form, end_date: date || new Date() })}
                            showTimeSelect
                            dateFormat="MM/dd/yyyy h:mm aa"
                            placeholderText="Select end date"
                            minDate={form.start_date}
                            icon={<Calendar className="w-5 h-5 text-gray-500" />}
                        />
                    </div>

                    {/* Max Users */}
                    <div>
                        <label className="label">Max Students</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                            <input
                                type="number"
                                min="1"
                                max="200"
                                value={form.max_users}
                                onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) })}
                                className="input pl-10"
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-theme">
                    <button
                        type="button"
                        onClick={() => { onClose(); resetForm(); }}
                        className="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-2 rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <>Creating...</>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Create Class
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default CreateClassModal;
