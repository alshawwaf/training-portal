import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { Save, ArrowLeft, Server, Calendar, Users, Key, Layers } from 'lucide-react';
import { useToast } from '../context/ToastContext';



const EditClass: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        blueprint_id: '1',
        max_users: 1,
        passcode: '',
        start_date: '',
        end_date: '',
    });

    useEffect(() => {
        fetchClass();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchClass = async () => {
        try {
            const res = await api.get(`/classes/${id}`);
            const cls = res.data;
            setFormData({
                name: cls.name,
                blueprint_id: cls.blueprint_id,
                max_users: cls.max_users,
                passcode: cls.passcode,
                start_date: cls.start_date.slice(0, 16),
                end_date: cls.end_date.slice(0, 16),
            });
        } catch {
            showToast('Failed to load class', 'error');
            navigate('/classes');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.put(`/classes/${id}`, formData);
            showToast('Class updated successfully', 'success');
            navigate('/classes');
        } catch (error) {
            console.error("Failed to update class", error);
            showToast('Failed to update class', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const blueprints = [
        { id: '1', name: 'Base Environment', description: 'Standard training setup', icon: '🖥️' },
        { id: '2', name: 'Advanced Security Lab', description: 'Multi-VM security testing', icon: '🔒' },
        { id: '3', name: 'Network Simulation', description: 'Complex network topology', icon: '🌐' },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => navigate('/classes')}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-white">Edit Class</h1>
                    <p className="text-gray-400 mt-1">Update the class configuration</p>
                </div>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Basic Information */}
                <div className="card-elevated p-6 space-y-6">
                    <div className="flex items-center gap-3 pb-4 border-b border-gray-700/50">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Server className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Basic Information</h2>
                            <p className="text-sm text-gray-500">General class details</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2">
                            <label className="input-label">Class Name</label>
                            <input 
                                type="text"
                                required
                                className="input"
                                placeholder="e.g., Security Fundamentals Q1 2025"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>
                        
                        <div>
                            <label className="input-label flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Max Students
                            </label>
                            <input 
                                type="number"
                                min={1}
                                max={200}
                                className="input"
                                value={formData.max_users}
                                onChange={e => setFormData({...formData, max_users: parseInt(e.target.value)})}
                            />
                        </div>
                        <div>
                            <label className="input-label flex items-center gap-2">
                                <Key className="w-4 h-4" />
                                Access Passcode
                            </label>
                            <input 
                                type="text"
                                className="input font-mono"
                                value={formData.passcode}
                                onChange={e => setFormData({...formData, passcode: e.target.value})}
                            />
                        </div>
                    </div>
                </div>

                {/* Blueprint Selection */}
                <div className="card-elevated p-6 space-y-6">
                    <div className="flex items-center gap-3 pb-4 border-b border-gray-700/50">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                            <Layers className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Environment Blueprint</h2>
                            <p className="text-sm text-gray-500">Choose the template for student environments</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        {blueprints.map((bp) => (
                            <button
                                key={bp.id}
                                type="button"
                                onClick={() => setFormData({...formData, blueprint_id: bp.id})}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${
                                    formData.blueprint_id === bp.id
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
                                }`}
                            >
                                <span className="text-2xl mb-2 block">{bp.icon}</span>
                                <p className="font-medium text-white text-sm">{bp.name}</p>
                                <p className="text-xs text-gray-500 mt-1">{bp.description}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Schedule */}
                <div className="card-elevated p-6 space-y-6">
                    <div className="flex items-center gap-3 pb-4 border-b border-gray-700/50">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <Calendar className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Schedule</h2>
                            <p className="text-sm text-gray-500">When should the class be active?</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                             <label className="input-label">Start Date & Time</label>
                             <input 
                                type="datetime-local"
                                className="input"
                                value={formData.start_date}
                                onChange={e => setFormData({...formData, start_date: e.target.value})}
                             />
                        </div>
                         <div>
                             <label className="input-label">End Date & Time</label>
                             <input 
                                type="datetime-local"
                                className="input"
                                value={formData.end_date}
                                onChange={e => setFormData({...formData, end_date: e.target.value})}
                             />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-4">
                    <button 
                        type="button" 
                        onClick={() => navigate('/classes')}
                        className="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="btn-primary"
                    >
                        {isSubmitting ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EditClass;
