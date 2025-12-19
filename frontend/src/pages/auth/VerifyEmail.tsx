import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../../api';

const VerifyEmail: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const emailFromState = location.state?.email || '';
    
    const [email, setEmail] = useState(emailFromState);
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        if (!emailFromState) {
            // If accessed directly without state, we might want to redirect or show email field
        }
    }, [emailFromState]);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await api.post('/auth/verify-email', { email, code });
            setIsSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Invalid verification code.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <div className="inline-flex p-3 bg-indigo-600/20 rounded-2xl mb-4">
                        <ShieldCheck className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Verify email</h1>
                    <p className="text-slate-400 mt-2">Enter the 6-digit code sent to your email</p>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-8">
                    {isSuccess ? (
                        <div className="space-y-6 text-center py-4">
                            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle className="w-8 h-8 text-green-500" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Verification successful!</h2>
                            <p className="text-slate-400">Redirecting you to login...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleVerify} className="space-y-6">
                            {error && (
                                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <p>{error}</p>
                                </div>
                            )}

                            <div className="space-y-4">
                                {!emailFromState && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="block w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all shadow-inner"
                                            placeholder="your-email@checkpoint.com"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300 ml-1">Verification Code</label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={6}
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                                        className="block w-full px-4 py-4 bg-slate-900 border border-slate-700 rounded-xl text-white text-center text-3xl font-bold tracking-[0.5em] placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all shadow-inner"
                                        placeholder="000000"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || code.length < 6}
                                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
                            >
                                {isLoading ? 'Verifying...' : 'Verify Email'}
                            </button>

                            <button
                                type="button"
                                onClick={() => navigate('/register')}
                                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to Registration
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VerifyEmail;
