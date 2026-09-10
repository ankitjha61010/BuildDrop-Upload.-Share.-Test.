import React from 'react';
import { Link } from 'react-router-dom';
import { PlaySquare, Home, UploadCloud } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="max-w-md mx-auto my-20 p-8 glass-card rounded-3xl border border-slate-800 text-center space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
        <PlaySquare className="w-8 h-8" />
      </div>

      <div>
        <h1 className="text-4xl font-black text-white">404</h1>
        <h2 className="text-lg font-bold text-slate-200 mt-1">Page Not Found</h2>
        <p className="text-xs text-slate-400 mt-2">
          The link you visited does not exist or may have been relocated.
        </p>
      </div>

      <div className="flex justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all"
        >
          <Home className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload Video</span>
        </Link>
      </div>
    </div>
  );
};
