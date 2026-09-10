import React from 'react';
import { Clock, ArrowLeft, UploadCloud, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ExpiredVideoProps {
  videoTitle?: string;
  expiredAt?: number;
  reason?: 'downloaded' | 'expired';
}

export const ExpiredVideo: React.FC<ExpiredVideoProps> = ({ videoTitle, expiredAt, reason = 'expired' }) => {
  const isDownloaded = reason === 'downloaded';

  return (
    <div className="max-w-xl mx-auto my-12 p-8 sm:p-12 glass-card rounded-3xl border border-rose-500/20 text-center shadow-2xl animate-fadeIn relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className={`w-20 h-20 rounded-3xl ${isDownloaded ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-rose-500/15 border-rose-500/30 text-rose-400'} border flex items-center justify-center mx-auto mb-6`}>
        {isDownloaded ? <CheckCircle2 className="w-10 h-10" /> : <Clock className="w-10 h-10" />}
      </div>

      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${isDownloaded ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'} border mb-3 uppercase tracking-wider`}>
        {isDownloaded ? 'Link Used & Expired' : 'Link Expired'}
      </span>

      <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
        {isDownloaded ? 'This link has already been used' : 'This link has expired'}
      </h2>

      <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto mb-6">
        {isDownloaded ? (
          <>
            The file {videoTitle ? <strong className="text-white font-semibold">"{videoTitle}"</strong> : 'transfer'} was already downloaded. As a security measure, the file was automatically removed from cloud storage and this link is now permanently expired. Please generate a new transfer link to share again.
          </>
        ) : (
          <>
            {videoTitle ? (
              <>The link period for <strong className="text-white font-semibold">"{videoTitle}"</strong> has ended.</>
            ) : (
              'This file transfer session has ended.'
            )}{' '}
            Per BuildDrop's privacy policy, the file was deleted from cloud storage. Please generate a new link.
          </>
        )}
      </p>

      {expiredAt && !isDownloaded && (
        <p className="text-xs font-mono text-slate-400 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 max-w-xs mx-auto mb-8">
          Expired on: {new Date(expiredAt).toLocaleString()}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <Link
          to="/upload"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30 text-sm transition-all"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Generate New Link</span>
        </Link>
      </div>
    </div>
  );
};
