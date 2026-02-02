import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldAlert, ArrowRight, BookOpen } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';

const GuestJoin: React.FC = () => {
    const { classId } = useParams<{ classId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    
    const [name, setName] = useState('');
    const [passcode, setPasscode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            // New endpoint to verify passcode and get a guest access token
            const res = await api.post(`/classes/${classId}/join`, { name, passcode });
            
            // Store guest token in session storage (only for this session)
            sessionStorage.setItem(`guest_token_${classId}`, res.data.token);
            
            showToast('Access granted! Entering classroom...', 'success');
            navigate(`/classes/${classId}/view`);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Invalid passcode. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center space-y-2">
                    <div className="inline-flex p-3 bg-indigo-600/20 rounded-2xl mb-4">
                        <BookOpen className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Join Training Class</h1>
                    <p className="text-slate-400">Please enter the class passcode to continue</p>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
                    <form onSubmit={handleJoin} className="p-8 space-y-6">
                        {error && (
                            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300 ml-1">Your Name</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="block w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all shadow-inner"
                                    placeholder="Enter your full name"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300 ml-1">Class Passcode</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-500 transition-colors">
                                        <KeyRound className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={passcode}
                                        onChange={(e) => setPasscode(e.target.value)}
                                        className="block w-full pl-11 pr-4 py-4 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all shadow-inner text-xl font-mono tracking-widest text-center"
                                        placeholder="••••••"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || !passcode}
                            className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
                        >
                            {isLoading ? 'Verifying...' : 'Access Classroom'}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </form>

                    <div className="px-8 py-4 bg-slate-900/50 border-t border-slate-700 text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
                            Secure Training Environment
                        </p>
                    </div>
                </div>
                
                <p className="text-center text-xs text-slate-600">
                    If you don't have a passcode, please contact your instructor.
                </p>
            </div>
        </div>
    );
};

export default GuestJoin;
