import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, KeyRound } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

const Login: React.FC = () => {
  const { localLogin, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black relative overflow-hidden transition-colors duration-300">
      <div className="relative z-10 w-full max-w-md px-4">
        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-blue-500/30 shadow-blue-500/10">
          {/* Logo */}
          <div className="flex justify-center mb-6">
              <img src="/icon.png" alt="Check Point" className="w-20 h-20 object-contain drop-shadow-2xl" />
          </div>
          
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">SE Training Portal</h1>
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
                      placeholder="john@checkpoint.com"
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
            <Link 
              to="/join/any" 
              onClick={(e) => { e.preventDefault(); navigate('/join/any'); }}
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800 transition-all group"
            >
              <KeyRound className="w-6 h-6 text-slate-400 group-hover:text-emerald-400 mb-2" />
              <span className="text-xs font-semibold text-slate-300">Join Class</span>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-500 leading-relaxed max-w-[280px] mx-auto">
            This portal is for authorized Check Point personnel and registered trainees.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
