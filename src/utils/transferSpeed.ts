// Shared transfer speed/ETA tracking for both upload and download progress UIs.
// Speed is only re-sampled every SAMPLE_INTERVAL_MS and smoothed with an EMA so the
// displayed number doesn't flicker between an instantaneous and a cumulative-average value.

const SAMPLE_INTERVAL_MS = 500;
const EMA_ALPHA = 0.3;

export interface TransferMetrics {
  percent: number;
  speed: number; // bytes per second, smoothed
  etaSeconds: number;
}

export class TransferSpeedTracker {
  private lastSampleTime: number;
  private lastSampleLoaded: number;
  private smoothedSpeed: number;

  constructor(startLoaded: number = 0) {
    this.lastSampleTime = Date.now();
    this.lastSampleLoaded = startLoaded;
    this.smoothedSpeed = 0;
  }

  /** Call when starting a fresh transfer, or resuming after a pause. */
  public reset(startLoaded: number = 0): void {
    this.lastSampleTime = Date.now();
    this.lastSampleLoaded = startLoaded;
    this.smoothedSpeed = 0;
  }

  public update(loaded: number, total: number): TransferMetrics {
    const now = Date.now();
    const timeDelta = (now - this.lastSampleTime) / 1000;

    if (timeDelta >= SAMPLE_INTERVAL_MS / 1000) {
      const instantSpeed = Math.max(0, (loaded - this.lastSampleLoaded) / timeDelta);
      this.smoothedSpeed =
        this.smoothedSpeed === 0 ? instantSpeed : EMA_ALPHA * instantSpeed + (1 - EMA_ALPHA) * this.smoothedSpeed;
      this.lastSampleTime = now;
      this.lastSampleLoaded = loaded;
    }

    const remaining = Math.max(0, total - loaded);
    const etaSeconds = this.smoothedSpeed > 0 ? Math.ceil(remaining / this.smoothedSpeed) : 0;
    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

    return { percent, speed: this.smoothedSpeed, etaSeconds };
  }
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 KB/s';
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
