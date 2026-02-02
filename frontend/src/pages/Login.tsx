import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, KeyRound, X, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

const Login: React.FC = () => {
  const { localLogin, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Join Class modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [classId, setClassId] = useState("");
  const [classIdError, setClassIdError] = useState("");

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
        navigate('/');
    }
  }, [user, navigate]);

  const handleLocalLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setIsLoading(true);
      try {
          await localLogin({ email, password });
      } catch {
          setError("Invalid credentials or configuration error.");
      } finally {
          setIsLoading(false);
      }
  }

  const handleJoinClass = (e: React.FormEvent) => {
    e.preventDefault();
    setClassIdError("");
    
    // Validate the class ID/token
    const trimmedId = classId.trim();
    if (!trimmedId) {
      setClassIdError("Please enter a class ID");
      return;
    }
    
    // Navigate to the join page with the entered ID
    navigate(`/join/${trimmedId}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black relative overflow-hidden transition-colors duration-300">
      <div className="relative z-10 w-full max-w-md px-4">
        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-blue-500/30 shadow-blue-500/10">
          {/* Logo */}
          <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 transform rotate-3 hover:rotate-6 transition-all duration-300">
                  <span className="text-3xl font-bold text-white tracking-tighter">TP</span>
              </div>
          </div>
          
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Training Portal</h1>
            <p className="text-slate-400 text-sm">Sign in to your virtualization workspace</p>
          </div>

          <form onSubmit={handleLocalLogin} className="space-y-5">
              <div className="space-y-2">
                   <label className="text-sm font-medium text-slate-300 ml-1">Work Email</label>
                   <input 
                      type="email" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="input w-full"
                      placeholder="john@example.com"
                      required
                  />
              </div>
              <div className="space-y-2">
                   <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
                   <input 
                      type="password" 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="input w-full"
                      placeholder="••••••••"
                      required
                  />
              </div>
              
              {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-500 text-sm flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {error}
                  </div>
              )}
              
              <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]"
               >
                  {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                      <>
                          <LogIn className="w-5 h-5" />
                          Sign In
                      </>
                  )}
              </button>
          </form>

          {/* Quick Actions */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <Link 
              to="/register" 
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 transition-all group"
            >
              <UserPlus className="w-6 h-6 text-slate-400 group-hover:text-blue-400 mb-2" />
              <span className="text-xs font-semibold text-slate-300">Create Account</span>
            </Link>
            <button 
              onClick={() => setShowJoinModal(true)}
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800 transition-all group"
            >
              <KeyRound className="w-6 h-6 text-slate-400 group-hover:text-emerald-400 mb-2" />
              <span className="text-xs font-semibold text-slate-300">Join Class</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-500 leading-relaxed max-w-[280px] mx-auto">
            This portal is for authorized personnel and registered trainees.
          </p>
        </div>
      </div>

      {/* Join Class Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-emerald-600/10 to-teal-600/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/20">
                  <KeyRound className="w-5 h-5 text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Join a Class</h2>
              </div>
              <button 
                onClick={() => { setShowJoinModal(false); setClassId(""); setClassIdError(""); }}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleJoinClass} className="p-6 space-y-4">
              <p className="text-sm text-slate-400">
                Enter the class ID or join token provided by your instructor.
              </p>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Class ID / Token</label>
                <input 
                  type="text"
                  value={classId}
                  onChange={(e) => { setClassId(e.target.value); setClassIdError(""); }}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  placeholder="e.g., abc123xyz or class-token"
                  autoFocus
                />
                {classIdError && (
                  <p className="text-xs text-red-400">{classIdError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowJoinModal(false); setClassId(""); setClassIdError(""); }}
                  className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-semibold text-slate-300 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
