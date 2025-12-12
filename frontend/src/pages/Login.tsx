import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Server, LogIn, ArrowLeft, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
  const { login, localLogin, user } = useAuth();
  const navigate = useNavigate();
  const [showLocal, setShowLocal] = useState(false);
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
    <div className="min-h-screen flex items-center justify-center bg-primary relative overflow-hidden transition-colors duration-300">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse-soft" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-blue-600/5 to-purple-600/5 rounded-full blur-3xl" />
      </div>

      {/* Grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
        style={{ 
          backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          color: 'rgb(var(--text-primary))'
        }} 
      />
      
      <div className="relative z-10 w-full max-w-md px-4 animate-fade-in">
        {/* Card */}
        <div className="card backdrop-blur-xl p-8 rounded-2xl shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-8">
              <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
                      <Server className="w-10 h-10 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-4 border-theme">
                      <Zap className="w-3 h-3 text-white" />
                  </div>
              </div>
          </div>
          
          <h1 className="text-2xl font-bold text-primary text-center mb-2">SE Training Portal</h1>
          <p className="text-secondary text-center mb-8 text-sm">Access your virtualization environments</p>

          {!showLocal ? (
              <div className="space-y-4">
                  <button
                    onClick={login}
                    className="w-full btn-primary py-3"
                  >
                    <ShieldCheck className="w-5 h-5" />
                    Sign in with Microsoft
                  </button>

                  <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-theme"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                          <span className="px-2 bg-primary text-secondary">or</span>
                      </div>
                  </div>
                  
                  <button 
                      onClick={() => setShowLocal(true)}
                      className="w-full btn-secondary py-3 justify-center"
                  >
                      Admin Login
                  </button>
              </div>
          ) : (
              <form onSubmit={handleLocalLogin} className="space-y-5">
                  <div>
                       <label className="input-label">Email</label>
                       <input 
                          type="email" 
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className="input"
                          placeholder="admin@example.com"
                          required
                      />
                  </div>
                  <div>
                       <label className="input-label">Password</label>
                       <input 
                          type="password" 
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="input"
                          placeholder="••••••••"
                          required
                      />
                  </div>
                  
                  {error && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-500 text-sm">
                          {error}
                      </div>
                  )}
                  
                  <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full btn-primary py-3"
                   >
                      {isLoading ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                          <>
                              <LogIn className="w-5 h-5" />
                              Login
                          </>
                      )}
                  </button>

                   <button 
                      type="button"
                      onClick={() => setShowLocal(false)}
                      className="w-full btn-ghost flex items-center justify-center gap-2"
                  >
                      <ArrowLeft className="w-4 h-4" />
                      Back to SSO
                  </button>
              </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-secondary opacity-70">
          Authorized personnel only. Contact admin for access.
        </p>
      </div>
    </div>
  );
};

export default Login;
