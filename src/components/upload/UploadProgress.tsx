import React from 'react';
import { UploadProgressInfo } from '../../types';
import { formatFileSize } from '../../utils/fileType';
import { formatSpeed, formatEta } from '../../utils/transferSpeed';
import { Pause, Play, X, Zap, Clock, HardDrive, CheckCircle2, AlertTriangle } from 'lucide-react';

interface UploadProgressProps {
  progressInfo: UploadProgressInfo;
  fileName: string;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  progressInfo,
  fileName,
  onPause,
  onResume,
  onCancel,
}) => {
  const {
    status,
    progress,
    uploadedBytes,
    totalBytes,
    speed,
    estimatedSecondsLeft,
    error,
  } = progressInfo;

  const formatSize = formatFileSize;

  const isPaused = status === 'paused';
  const isUploading = status === 'uploading' || status === 'preparing';

  return (
    <div className="glass-card p-6 rounded-2xl border border-indigo-500/20 shadow-2xl relative overflow-hidden">
      {/* Background subtle glow */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              {status === 'preparing' && 'Preparing Upload...'}
              {status === 'uploading' && 'Uploading Video to Drive...'}
              {status === 'paused' && 'Upload Paused'}
              {status === 'completed' && 'Upload Successful'}
              {status === 'failed' && 'Upload Failed'}
              {status === 'cancelled' && 'Upload Cancelled'}
            </span>
          </div>
          <h4 className="text-base font-bold text-white truncate mt-0.5">{fileName}</h4>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isUploading && onPause && (
            <button
              onClick={onPause}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
              title="Pause Upload"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}

          {isPaused && onResume && (
            <button
              onClick={onResume}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-colors"
              title="Resume Upload"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {(isUploading || isPaused) && onCancel && (
            <button
              onClick={onCancel}
              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
              title="Cancel Upload"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2 mb-4">
        <div className="w-full h-3.5 bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-700/60 relative">
          <div
            className={`h-full rounded-full transition-all duration-300 relative ${
              status === 'failed'
                ? 'bg-rose-500'
                : status === 'completed'
                ? 'bg-emerald-500'
                : isPaused
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-400 animate-pulse-subtle'
            }`}
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
          <span className="font-mono text-indigo-300 font-bold text-sm">{progress}%</span>
          <span className="font-mono">
            {formatSize(uploadedBytes)} / {formatSize(totalBytes)}
          </span>
        </div>
      </div>

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-slate-400 text-[10px] block">Speed</span>
            <span className="font-semibold text-slate-200 truncate">{formatSpeed(speed)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <Clock className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-slate-400 text-[10px] block">Remaining</span>
            <span className="font-semibold text-slate-200 truncate">{formatEta(estimatedSecondsLeft)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 col-span-2 sm:col-span-1">
          <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-slate-400 text-[10px] block">Mode</span>
            <span className="font-semibold text-slate-200 truncate">Resumable Chunk</span>
          </div>
        </div>
      </div>

      {/* Errors or Success Alerts */}
      {error && (
        <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status === 'completed' && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Chunked upload completed! Video ready in Google Drive.</span>
        </div>
      )}
    </div>
  );
};
