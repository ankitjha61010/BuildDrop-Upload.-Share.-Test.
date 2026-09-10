import React, { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { driveApi, isTemporaryUpload, getDirectDownloadUrl, fetchBlobWithProgress } from '../../services/driveApi';
import { useToast } from '../../context/ToastContext';
import { VideoMetadata } from '../../types';
import { TransferSpeedTracker, formatSpeed, formatEta } from '../../utils/transferSpeed';

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
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [downloadEta, setDownloadEta] = useState(0);
  const speedTrackerRef = useRef(new TransferSpeedTracker());
  const { showToast } = useToast();

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || video.isExpired) {
      showToast('Video Expired', 'This video has reached its 5-hour limit and cannot be downloaded.', 'warning');
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);
    setDownloadSpeed(0);
    setDownloadEta(0);
    speedTrackerRef.current.reset(0);
    try {
      showToast('Preparing Download', `Fetching "${video.originalFileName || video.name}"...`, 'info', 3000);

      const onStreamProgress = (loaded: number, total: number) => {
        const { percent, speed, etaSeconds } = speedTrackerRef.current.update(loaded, total || video.size);
        setDownloadProgress(percent);
        setDownloadSpeed(speed);
        setDownloadEta(etaSeconds);
      };

      // Everyone - including anonymous link recipients, who have no Google session of their own
      // - downloads through our own /api/download-file proxy instead of a drive.google.com link:
      // on mobile, drive.google.com is a verified Android App Link, so navigating there gets
      // intercepted into a Google account-picker prompt instead of just saving the file.
      // Fetched (rather than a plain <a> navigation) so a broken/misrouted proxy response - e.g.
      // running under plain "vite dev", which has no Netlify Functions and falls back to serving
      // the SPA's own index.html - is caught here and surfaced as an error, instead of silently
      // being saved to disk as if it were the real file.
      const blob = await fetchBlobWithProgress(
        getDirectDownloadUrl(video.driveFileId, video.originalFileName || video.name),
        {},
        onStreamProgress,
        video.size
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = video.originalFileName || video.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // One-time link security: once a temporary share has been downloaded, remove it from Drive
      // immediately instead of leaving it to sit there until the uploader happens to purge it.
      if (isTemporaryUpload(video)) {
        await driveApi.consumeTemporaryDownload(video.driveFileId);
        showToast('Download Complete', 'This was a one-time link - the file has now been removed from Drive.', 'success');
      } else {
        showToast('Download Started', 'Your video file is downloading.', 'success');
      }
    } catch (err: any) {
      console.error('Download error:', err);
      showToast('Download Failed', err.message || 'Unable to download file from Google Drive.', 'error');
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
      setDownloadSpeed(0);
      setDownloadEta(0);
    }
  };

  if (variant === 'icon') {
    return (
      <div className={`flex flex-col items-stretch gap-1 ${className}`}>
        <button
          onClick={handleDownload}
          disabled={disabled || downloading || video.isExpired}
          title={downloading ? `Downloading ${downloadProgress}% · ${formatSpeed(downloadSpeed)} · ${formatEta(downloadEta)} left` : 'Download Video'}
          className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Download Video"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </button>
        {downloading && (
          <div className="w-9 h-1 rounded-full bg-slate-800 border border-slate-700/60 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300 ease-out rounded-full"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  if (variant === 'player') {
    return (
      <button
        onClick={handleDownload}
        disabled={disabled || downloading || video.isExpired}
        className={`p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40 ${className}`}
        title={downloading ? `Downloading ${downloadProgress}% · ${formatSpeed(downloadSpeed)} · ${formatEta(downloadEta)} left` : 'Download Video'}
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
            <span>{downloadProgress > 0 ? `${downloadProgress}% · ${formatSpeed(downloadSpeed)}` : 'Downloading...'}</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            <span>Download</span>
          </>
        )}
      </button>
      {downloading && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300 ease-out rounded-full"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>{formatSpeed(downloadSpeed)}</span>
            <span>{downloadEta > 0 ? `${formatEta(downloadEta)} left` : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
};
