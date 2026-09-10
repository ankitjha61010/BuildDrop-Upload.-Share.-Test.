import React from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { ZoomLevel } from '../../types';

interface ZoomControlsProps {
  zoom: ZoomLevel;
  onZoomChange: (level: ZoomLevel) => void;
  className?: string;
}

const ZOOM_LEVELS: ZoomLevel[] = [1, 1.25, 1.5, 2, 2.5];

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomChange,
  className = '',
}) => {
  const currentIndex = ZOOM_LEVELS.indexOf(zoom);

  const handleZoomIn = () => {
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      onZoomChange(ZOOM_LEVELS[currentIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    if (currentIndex > 0) {
      onZoomChange(ZOOM_LEVELS[currentIndex - 1]);
    }
  };

  const handleReset = () => {
    onZoomChange(1);
  };

  return (
    <div
      className={`inline-flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/60 shadow-lg text-xs ${className}`}
    >
      <button
        type="button"
        onClick={handleZoomOut}
        disabled={zoom <= 1}
        className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <span className="px-1.5 font-mono font-bold text-indigo-300 text-[11px] min-w-[34px] text-center select-none">
        {zoom}x
      </span>

      <button
        type="button"
        onClick={handleZoomIn}
        disabled={zoom >= 2.5}
        className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      {zoom !== 1 && (
        <button
          type="button"
          onClick={handleReset}
          className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors ml-0.5"
          title="Reset Zoom (1x)"
          aria-label="Reset Zoom"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
