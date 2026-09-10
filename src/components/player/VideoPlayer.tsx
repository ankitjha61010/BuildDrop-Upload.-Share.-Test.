import React, { useState } from 'react';
import { VideoMetadata } from '../../types';
import {
  Download,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface VideoPlayerProps {
  video: VideoMetadata;
  onDownload?: () => void;
  isDownloading?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, onDownload, isDownloading }) => {
  const [iframeLoaded, setIframeLoaded] = useState<boolean>(false);

  const drivePreviewUrl = `https://drive.google.com/file/d/${video.driveFileId}/preview`;

  return (
    <div className="w-full space-y-2 select-none">
      {/* Main Video Box Container */}
      <div className="relative w-full aspect-video bg-black rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-slate-800/80 group">
        {/* Loading shimmer before iframe loads */}
        {!iframeLoaded && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>Connecting to Stream Server...</span>
            </div>
          </div>
        )}

        {/* High-Performance Google Video Player */}
        <iframe
          src={drivePreviewUrl}
          className="w-full h-full border-none"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          onLoad={() => setIframeLoaded(true)}
          title={video.originalFileName || video.name}
        />
      </div>

      {/* Subtle Stream Info */}
      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400 px-1 pt-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300 font-medium">Server Direct Playback Ready</span>
        </div>

        {onDownload && (
          <button
            onClick={onDownload}
            disabled={isDownloading}
            className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors disabled:opacity-50"
          >
            <span>{isDownloading ? 'Downloading...' : 'Download File'}</span>
            {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
};
