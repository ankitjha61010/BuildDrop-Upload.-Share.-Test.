import React from 'react';
import { useToast } from '../../context/ToastContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { ToastType } from '../../types';

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
  info: <Info className="w-5 h-5 text-indigo-400 shrink-0" />,
};

const toastBorders: Record<ToastType, string> = {
  success: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-100',
  warning: 'border-amber-500/30 bg-amber-950/40 text-amber-100',
  error: 'border-rose-500/30 bg-rose-950/40 text-rose-100',
  info: 'border-indigo-500/30 bg-indigo-950/40 text-indigo-100',
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 ${toastBorders[toast.type]}`}
        >
          {toastIcons[toast.type]}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm leading-tight text-white">{toast.title}</h4>
            {toast.message && (
              <p className="text-xs text-slate-300 mt-1 leading-relaxed break-words">
                {toast.message}
              </p>
            )}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-white p-1 transition-colors rounded-lg hover:bg-white/10"
            aria-label="Dismiss toast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
