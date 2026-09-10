import React, { useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  PictureInPicture,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { ZoomControls } from './ZoomControls';
import { DownloadButton } from '../common/DownloadButton';
import { VideoMetadata, ZoomLevel } from '../../types';

interface VideoControlsProps {
  video: VideoMetadata;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  zoom: ZoomLevel;
  showControls: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onTogglePiP: () => void;
  onZoomChange: (zoom: ZoomLevel) => void;
  onSkip: (seconds: number) => void;
}

export const VideoControls: React.FC<VideoControlsProps> = ({
  video,
  isPlaying,
  isMuted,
  volume,
  currentTime,
  duration,
  isFullscreen,
  zoom,
  showControls,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onTogglePiP,
  onZoomChange,
  onSkip,
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);

  const formatTime = (secs: number): string => {
    if (isNaN(secs) || !isFinite(secs)) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);

    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(pos * duration, duration));
    onSeek(newTime);
  };

  const handleTouchProgress = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = (touch.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(pos * duration, duration));
    onSeek(newTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/60 flex flex-col justify-between p-3 sm:p-4 md:p-6 transition-opacity duration-300 pointer-events-none ${
        showControls ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Top Bar: Title & Zoom */}
      <div className="flex items-center justify-between pointer-events-auto gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs sm:text-sm md:text-base font-bold text-white drop-shadow truncate max-w-[200px] sm:max-w-md">
            {video.originalFileName || video.name}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <ZoomControls zoom={zoom} onZoomChange={onZoomChange} />
        </div>
      </div>

      {/* Center Big Play/Pause/Skip for Touch Devices */}
      <div className="flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto">
        {!isPlaying ? (
          <button
            onClick={onPlayPause}
            className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-indigo-600/95 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl shadow-indigo-600/50 transform hover:scale-110 active:scale-95 transition-all backdrop-blur-md"
            aria-label="Play video"
          >
            <Play className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 fill-current ml-1" />
          </button>
        ) : (
          <div className="flex items-center gap-4 opacity-0 hover:opacity-100 transition-opacity">
            <button
              onClick={() => onSkip(-10)}
              className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-all active:scale-90"
              title="Rewind 10s"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={onPlayPause}
              className="p-4 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white shadow-xl backdrop-blur-md transition-all active:scale-90"
              aria-label="Pause video"
            >
              <Pause className="w-6 h-6" />
            </button>
            <button
              onClick={() => onSkip(10)}
              className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-all active:scale-90"
              title="Forward 10s"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="space-y-2 sm:space-y-3 pointer-events-auto">
        {/* Seek / Progress Bar (Touch & Click Friendly) */}
        <div
          ref={progressBarRef}
          onClick={handleProgressBarClick}
          onTouchStart={handleTouchProgress}
          onTouchMove={handleTouchProgress}
          className="relative w-full h-3 sm:h-2 hover:h-3.5 bg-white/25 rounded-full cursor-pointer transition-all duration-150 group flex items-center touch-none py-1"
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-400 rounded-full relative pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3.5 sm:h-3.5 bg-white rounded-full shadow-lg ring-2 ring-indigo-500/50 transform scale-110" />
          </div>
        </div>

        {/* Control Buttons and Timers */}
        <div className="flex items-center justify-between gap-1 sm:gap-3 text-white">
          {/* Left Controls: Play/Pause, Skip, Volume, Time */}
          <div className="flex items-center gap-0.5 sm:gap-1.5 min-w-0">
            <button
              onClick={onPlayPause}
              className="p-1.5 sm:p-2 text-white hover:text-indigo-400 hover:bg-white/10 rounded-xl transition-colors active:scale-90"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              onClick={() => onSkip(-10)}
              className="p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors active:scale-90"
              title="Rewind 10s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => onSkip(10)}
              className="p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors active:scale-90"
              title="Forward 10s"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol">
              <button
                onClick={onToggleMute}
                className="p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="hidden md:inline-block w-16 md:w-20 h-1.5 bg-slate-700 accent-indigo-500 rounded-lg cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                aria-label="Volume slider"
              />
            </div>

            {/* Time Stamp */}
            <div className="text-[11px] sm:text-xs font-mono text-slate-300 ml-1 sm:ml-2 whitespace-nowrap select-none">
              <span className="text-white font-medium">{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Download, PiP, Fullscreen */}
          <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
            <DownloadButton video={video} variant="player" />

            {document.pictureInPictureEnabled && (
              <button
                onClick={onTogglePiP}
                className="hidden sm:inline-flex p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                title="Picture-in-Picture"
                aria-label="Picture-in-Picture"
              >
                <PictureInPicture className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            <button
              onClick={onToggleFullscreen}
              className="p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors active:scale-90"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
              ) : (
                <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
