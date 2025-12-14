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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-950 to-black relative overflow-hidden transition-colors duration-300">
      {/* Gradient orbs removed - was covering content */}


      {/* Noise texture overlay removed - was covering viewport */}
      
      <div className="relative z-10 w-full max-w-md px-4">
        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-pink-500/30 shadow-pink-500/10">
          {/* Logo */}
          <div className="flex justify-center mb-8">
              <img src="/icon.png" alt="Check Point" className="w-24 h-24 object-contain" />
          </div>
          
          <h1 className="text-2xl font-bold text-white text-center mb-2">Check Point SE Training</h1>
          <p className="text-gray-400 text-center mb-8 text-sm">Access your virtualization environments</p>

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
