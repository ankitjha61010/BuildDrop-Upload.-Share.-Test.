import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { getDirectDownloadUrl } from '../../services/driveApi';
import { useToast } from '../../context/ToastContext';
import { VideoMetadata } from '../../types';

interface DownloadButtonProps {
  video: VideoMetadata;
  className?: string;
  variant?: 'button' | 'icon' | 'player';
  disabled?: boolean;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  video,
  className = '',
  variant = 'button',
  disabled = false,
}) => {
  const [downloading, setDownloading] = useState(false);
  const { showToast } = useToast();

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || video.isExpired) {
      showToast('Video Expired', 'This video has reached its 5-hour limit and cannot be downloaded.', 'warning');
      return;
    }

    setDownloading(true);
    try {
      showToast('Preparing Download', `Fetching "${video.originalFileName || video.name}"...`, 'info', 3000);

      // Everyone - including anonymous link recipients, who have no Google session of their own
      // - downloads through our own /api/download-file proxy instead of a drive.google.com link:
      // on mobile, drive.google.com is a verified Android App Link, so navigating there gets
      // intercepted into a Google account-picker prompt instead of just saving the file.
      // Fetched (rather than a plain <a> navigation) so a broken/misrouted proxy response - e.g.
      // running under plain "vite dev", which has no Netlify Functions and falls back to serving
      // the SPA's own index.html - is caught here and surfaced as an error, instead of silently
      // being saved to disk as if it were the real file.
      const downloadUrl = getDirectDownloadUrl(video.driveFileId, video.originalFileName || video.name);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = video.originalFileName || video.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      showToast('Download Started', 'Your file is downloading.', 'success');
    } catch (err: any) {
      console.error('Download error:', err);
      showToast('Download Failed', err.message || 'Unable to download file from Google Drive.', 'error');
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  };

  if (variant === 'icon') {
    return (
      <div className={`flex flex-col items-stretch gap-1 ${className}`}>
        <button
          onClick={handleDownload}
          disabled={disabled || downloading || video.isExpired}
          title={downloading ? 'Downloading...' : 'Download Build'}
          className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Download Build"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </button>
      </div>
    );
  }

  if (variant === 'player') {
    return (
      <button
        onClick={handleDownload}
        disabled={disabled || downloading || video.isExpired}
        className={`p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40 ${className}`}
        title={downloading ? 'Downloading...' : 'Download Build'}
      >
        {downloading ? (
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        ) : (
          <Download className="w-5 h-5" />
        )}
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <button
        onClick={handleDownload}
        disabled={disabled || downloading || video.isExpired}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 hover:text-white border border-slate-700 hover:border-slate-600 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {downloading ? (
          <>
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span>Downloading...</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            <span>Download</span>
          </>
        )}
      </button>
    </div>
  );
};
