import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export const ADMIN_USERNAME = 'abhishek61010@gmail.com';
export const ADMIN_PASSWORD = 'Abhi@1998';
export const ADMIN_STORAGE_KEY = 'builddrop_admin_session';

export const checkIsAdminAuthenticated = (): boolean => {
  return localStorage.getItem(ADMIN_STORAGE_KEY) === 'authenticated' || sessionStorage.getItem(ADMIN_STORAGE_KEY) === 'authenticated';
};

export const setAdminAuthenticated = (remember: boolean = true) => {
  if (remember) {
    localStorage.setItem(ADMIN_STORAGE_KEY, 'authenticated');
  } else {
    sessionStorage.setItem(ADMIN_STORAGE_KEY, 'authenticated');
  }
};

export const clearAdminAuthentication = () => {
  localStorage.removeItem(ADMIN_STORAGE_KEY);
  sessionStorage.removeItem(ADMIN_STORAGE_KEY);
};

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    setTimeout(() => {
      if (email.trim().toLowerCase() === ADMIN_USERNAME.toLowerCase() && password === ADMIN_PASSWORD) {
        setAdminAuthenticated(true);
        showToast('Welcome Admin!', 'Authenticated successfully.', 'success');
        navigate('/admin/list');
      } else {
        setError('Invalid admin credentials. Access denied.');
        showToast('Login Failed', 'Invalid username or password.', 'error');
        setIsLoading(false);
      }
    }, 600);
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full glass-card p-8 sm:p-10 rounded-3xl border border-indigo-500/30 shadow-2xl space-y-6 relative overflow-hidden animate-fadeIn">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-36 h-36 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header Icon */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/20 shadow-xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white stroke-[2.5]" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Admin Portal Access
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            Enter your credentials to access the private BuildDrop control panel.
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="abhishek61010@gmail.com"
                className="w-full pl-10 pr-4 py-3 bg-[#090c13] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Admin Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-[#090c13] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-60 mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Access Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
