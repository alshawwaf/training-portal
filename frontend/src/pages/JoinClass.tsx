import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LogIn, Lock, Mail, User, AlertCircle, Loader2, GraduationCap } from 'lucide-react';
import api from '../api';

interface ClassInfo {
    name: string;
    description: string;
    status: string;
    is_active: boolean;
}

const JoinClass: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    
    const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [email, setEmail] = useState('');
    const [passcode, setPasscode] = useState('');
    const [name, setName] = useState('');

    useEffect(() => {
        loadClassInfo();
    }, [token]);

    const loadClassInfo = async () => {
        try {
            const response = await api.get(`/student/class/${token}/info`);
            setClassInfo(response.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Class not found');
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        setJoining(true);
        setError(null);

        try {
            const response = await api.post(`/student/join/${token}`, {
                email,
                passcode,
                name: name || undefined
            });

            if (response.data.success) {
                // Store session token
                localStorage.setItem('student_session', response.data.session_token);
                localStorage.setItem('student_class_name', response.data.class_name);
                
                // Navigate to student dashboard
                navigate('/student/class');
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to join class');
        } finally {
            setJoining(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    if (error && !classInfo) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Class Not Found</h1>
                    <p className="text-slate-400">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-emerald-500/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-teal-500/5 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25 mb-4">
                        <GraduationCap className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-1">Join Class</h1>
                    {classInfo && (
                        <p className="text-emerald-400 font-medium">{classInfo.name}</p>
                    )}
                </div>

                {/* Join Card */}
                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
                    {/* Class Info Header */}
                    {classInfo && (
                        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600/10 to-teal-600/10 border-b border-slate-700">
                            {classInfo.description && (
                                <p className="text-sm text-slate-300">{classInfo.description}</p>
                            )}
                            {!classInfo.is_active && (
                                <div className="mt-2 flex items-center gap-2 text-amber-400 text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>This class is not currently active</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleJoin} className="p-6 space-y-5">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                                    placeholder="your.email@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Class Passcode</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="password"
                                    required
                                    value={passcode}
                                    onChange={(e) => setPasscode(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                                    placeholder="Enter passcode"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Your Name <span className="text-slate-500">(optional)</span>
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                                    placeholder="John Smith"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={joining || !classInfo?.is_active}
                            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                        >
                            {joining ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Joining...
                                </>
                            ) : (
                                <>
                                    <LogIn className="w-5 h-5" />
                                    Join Class
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-slate-500 text-sm mt-6">
                    Your instructor provided this link to join the class.
                </p>
            </div>
        </div>
    );
};

export default JoinClass;
