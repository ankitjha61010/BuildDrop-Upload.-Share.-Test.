import React, { useRef, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { driveApi, getDirectDownloadUrl, fetchBlobWithProgress } from '../services/driveApi';
import { useToast } from '../context/ToastContext';
import { expirationService } from '../services/expirationService';
import { qrService } from '../services/qrService';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { ExpiredVideo } from '../components/player/ExpiredVideo';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { CopyLinkButton } from '../components/common/CopyLinkButton';
import { VideoMetadata } from '../types';
import { formatFileSize, isVideoFile as isVideoFileType, isIpaFile, isAndroidPackageFile, parseAppMetadataFromFilename } from '../utils/fileType';
import { isIOS } from '../utils/platform';
import { TransferSpeedTracker, formatSpeed, formatEta } from '../utils/transferSpeed';
import {
  Check,
  HardDrive,
  ArrowLeft,
  Download,
  Loader2,
  Smartphone,
  Info,
  Layers,
  Hash,
  RefreshCw,
} from 'lucide-react';

export const WatchPage: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const { showToast } = useToast();
  const [video, setVideo] = useState<VideoMetadata | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [downloadReason] = useState<'downloaded' | 'expired'>('expired');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  const [downloadEta, setDownloadEta] = useState<number>(0);
  const speedTrackerRef = useRef(new TransferSpeedTracker());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) {
      setError('Invalid or missing file ID.');
      setIsLoading(false);
      return;
    }

    const loadVideo = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const meta = await driveApi.getVideoMetadata(videoId);
        setVideo(meta);

        // Check expiration
        const timeCheck = expirationService.getTimeRemaining(meta.expiresAt);
        if (timeCheck.isExpired || meta.isExpired) {
          setIsExpired(true);
        }
      } catch (err: any) {
        console.error('Watch video error:', err);
        setError(err.message || 'Unable to locate or download file.');
      } finally {
        setIsLoading(false);
      }
    };

    loadVideo();
  }, [videoId]);

  if (isLoading) {
    return (
      <div className="py-24">
        <LoadingState
          message="Loading File Details..."
          subMessage="Fetching file metadata"
          size="lg"
        />
      </div>
    );
  }

  if (isExpired) {
    return <ExpiredVideo videoTitle={video?.name} expiredAt={video?.expiresAt} reason={downloadReason} />;
  }

  if (error || !video) {
    return (
      <div className="py-12">
        <ErrorState
          title="File Unavailable"
          message={error || 'File not found or permissions are required.'}
          actionText="Back to Home"
          onRetry={() => (window.location.href = '/')}
        />
      </div>
    );
  }

  const watchUrl = qrService.getWatchUrl(video.id);

  // File type detection
  const fileName = video.originalFileName || video.name || '';
  const isVideoFile = isVideoFileType(fileName, video.mimeType);
  const fileIsIpa = isIpaFile(fileName);
  const fileIsAndroidPackage = isAndroidPackageFile(fileName);
  const visitorIsIOS = isIOS();
  const manifestUrl = `${window.location.origin}/api/ipa-manifest?id=${encodeURIComponent(video.driveFileId)}`;
  const itmsInstallUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;

  // Formatted Metadata
  const parsedMeta = parseAppMetadataFromFilename(fileName);
  const cleanAppName = video.appName || parsedMeta.cleanAppName;
  const bundleId = video.bundleId || (fileIsIpa ? `com.builddrop.${video.id.slice(0, 10).toLowerCase()}` : fileIsAndroidPackage ? `com.builddrop.${video.id.slice(0, 10).toLowerCase()}` : 'com.builddrop.app');
  const bundleVersion = video.bundleVersion || parsedMeta.version;
  const buildNumber = video.buildNumber || parsedMeta.buildNumber;
  const platformName = fileIsIpa ? 'iOS' : fileIsAndroidPackage ? 'Android' : 'build';

  // Direct download handler
  const handleDownloadFile = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadSpeed(0);
      setDownloadEta(0);
      speedTrackerRef.current.reset(0);

      const blob = await fetchBlobWithProgress(
        getDirectDownloadUrl(video.driveFileId, video.originalFileName || video.name),
        {},
        (loaded, total) => {
          const { percent, speed, etaSeconds } = speedTrackerRef.current.update(loaded, total || video.size);
          setDownloadProgress(percent);
          setDownloadSpeed(speed);
          setDownloadEta(etaSeconds);
        },
        video.size
      );
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = video.originalFileName || video.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

      // 100% Download complete! Clean up file from Drive only after successful transfer
      showToast('Download Complete', 'File downloaded successfully. Cleaning up file from Drive...', 'success');
      await driveApi.consumeTemporaryDownload(video.driveFileId).catch(() => {});
      setIsExpired(true);
    } catch (e: any) {
      console.error('Download trigger error:', e);
      // On error, do NOT delete the file from Drive
      showToast('Download Failed', e?.message || 'Unable to download file. The file remains saved on Drive.', 'error', 8000);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadSpeed(0);
      setDownloadEta(0);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 py-4 sm:py-8">
      {/* Top back navigation */}
      <div className="flex items-center justify-between gap-4 px-1">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>

      {isVideoFile ? (
        <div className="w-full">
          <VideoPlayer video={video} onDownload={handleDownloadFile} isDownloading={isDownloading} />
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {/* Header Section */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/10">
              <Check className="w-7 h-7 stroke-[2.5]" />
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Upload Successful!
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-md mx-auto">
              Your {platformName} build is ready to be shared and installed.
            </p>
          </div>

          {/* App Build Details Card */}
          <div className="bg-[#121622]/90 border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 text-center sm:text-left">
              {/* App Icon */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-slate-900 border border-white/10 shadow-xl flex flex-col items-center justify-center text-white shrink-0 relative overflow-hidden group">
                {video.appIcon ? (
                  <img
                    src={video.appIcon}
                    alt={cleanAppName}
                    className="w-full h-full object-cover rounded-2xl p-1 bg-slate-950/40"
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 mb-1">
                      <Smartphone className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-white/80 truncate max-w-[80px]">
                      {cleanAppName.slice(0, 8)}
                    </span>
                  </>
                )}
              </div>

              {/* Title & App Metadata */}
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white truncate" title={cleanAppName}>
                    {cleanAppName}
                  </h2>
                  <p className="font-mono text-xs text-slate-400 truncate mt-0.5" title={bundleId}>
                    {bundleId}
                  </p>
                </div>

                {/* Stats Row */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-6 pt-1 text-xs text-slate-300 font-medium">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-400">Version</span>
                    <span className="font-semibold text-slate-100">{bundleVersion}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Hash className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-400">Build</span>
                    <span className="font-semibold text-slate-100">{buildNumber}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-400">Size</span>
                    <span className="font-semibold text-slate-100">{formatFileSize(video.size)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* QR Code & Share / Install Controls Card */}
          <div className="bg-[#121622]/90 border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl max-w-2xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8">
              {/* Scan to install column */}
              <div className="flex flex-col items-center shrink-0">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Scan to install
                </span>
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xl flex items-center justify-center">
                  <QRCodeSVG
                    value={watchUrl}
                    size={175}
                    level="H"
                    includeMargin={false}
                  />
                </div>
              </div>

              {/* Vertical divider */}
              <div className="hidden md:block w-[1px] bg-slate-800/80 self-stretch my-2"></div>

              {/* Share link & actions column */}
              <div className="flex-1 min-w-0 w-full space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    Public Share Link
                  </label>
                  <div className="bg-[#090c13] border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between font-mono text-xs sm:text-sm text-slate-300 gap-2">
                    <span className="truncate select-all">{watchUrl}</span>
                    <CopyLinkButton url={watchUrl} variant="icon" />
                  </div>
                </div>

                {/* Info prompts for platform compatibility */}
                {fileIsIpa && visitorIsIOS && (
                  <div className="text-[11px] sm:text-xs text-slate-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-start gap-2 text-left">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>iOS Installation Notice:</strong> After tapping Install, return to home screen. If iOS shows "Unable to Verify", go to <strong>Settings → General → VPN & Device Management</strong> and tap <strong>Trust Certificate</strong>.
                    </span>
                  </div>
                )}

                {fileIsIpa && !visitorIsIOS && (
                  <div className="text-xs text-slate-400 bg-slate-800/50 border border-slate-700/60 rounded-xl p-3 flex items-start gap-2 text-left">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <span>Open this link in Safari on an iPhone or iPad to install directly OTA.</span>
                  </div>
                )}

                {fileIsAndroidPackage && visitorIsIOS && (
                  <div className="text-xs text-slate-400 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2 text-left">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>This is an Android APK build and cannot be installed on iOS.</span>
                  </div>
                )}

                {/* Primary Action Button - Lime Green */}
                {fileIsIpa && visitorIsIOS ? (
                  <a
                    href={itmsInstallUrl}
                    className="w-full py-3.5 px-6 rounded-xl bg-[#84cc16] hover:bg-[#74b810] active:scale-[0.99] text-slate-950 font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-lime-500/20 transition-all cursor-pointer"
                  >
                    <Smartphone className="w-5 h-5" />
                    <span>Install on Device</span>
                  </a>
                ) : (
                  <button
                    onClick={handleDownloadFile}
                    disabled={isDownloading}
                    className="w-full py-3.5 px-6 rounded-xl bg-[#84cc16] hover:bg-[#74b810] active:scale-[0.99] text-slate-950 font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-lime-500/20 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>
                          {downloadProgress > 0
                            ? `Downloading ${downloadProgress}%`
                            : 'Preparing Download...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-5 h-5" />
                        <span>Install on Device</span>
                      </>
                    )}
                  </button>
                )}

                {/* Download Progress Bar */}
                {isDownloading && (
                  <div className="w-full space-y-1.5 pt-1">
                    <div className="h-2 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-[#84cc16] transition-all duration-300 ease-out rounded-full"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>{formatSpeed(downloadSpeed)}</span>
                      <span>{downloadEta > 0 ? `${formatEta(downloadEta)} left` : 'Calculating...'}</span>
                    </div>
                  </div>
                )}

                {/* Dedicated Download File Button */}
                <button
                  onClick={handleDownloadFile}
                  disabled={isDownloading}
                  className="w-full py-3 px-6 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-indigo-400" />
                  <span>Download Build File ({formatFileSize(video.size)})</span>
                </button>

                {/* Secondary Action - Upload Another Build */}
                <Link
                  to="/"
                  className="w-full py-2.5 px-6 rounded-xl hover:bg-slate-800/60 text-slate-400 hover:text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all text-center"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Upload Another Build</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
