import React, { useRef, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { driveApi, isTemporaryUpload, getDirectDownloadUrl, fetchBlobWithProgress } from '../services/driveApi';
import { useToast } from '../context/ToastContext';
import { expirationService } from '../services/expirationService';
import { qrService } from '../services/qrService';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { ExpiredVideo } from '../components/player/ExpiredVideo';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { CopyLinkButton } from '../components/common/CopyLinkButton';
import { QRModal } from '../components/common/QRModal';
import { VideoMetadata } from '../types';
import { formatFileSize, getFileTypeMeta, isVideoFile as isVideoFileType, isIpaFile, isAndroidPackageFile } from '../utils/fileType';
import { isIOS } from '../utils/platform';
import { TransferSpeedTracker, formatSpeed, formatEta } from '../utils/transferSpeed';
import {
  Calendar,
  HardDrive,
  QrCode,
  ArrowLeft,
  Download,
  Loader2,
  Smartphone,
  Info,
} from 'lucide-react';

export const WatchPage: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const { showToast } = useToast();
  const [video, setVideo] = useState<VideoMetadata | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [downloadReason, setDownloadReason] = useState<'downloaded' | 'expired'>('expired');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  const [downloadEta, setDownloadEta] = useState<number>(0);
  const speedTrackerRef = useRef(new TransferSpeedTracker());
  const [error, setError] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);

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

        // Check 3-day expiration
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

  // Helper to determine if file is a playable video format
  const fileName = video.originalFileName || video.name || '';
  const isVideoFile = isVideoFileType(fileName, video.mimeType);

  // iOS OTA install (.ipa only - .apk/.aab can never install on iOS, different OS entirely)
  const fileIsIpa = isIpaFile(fileName);
  const fileIsAndroidPackage = isAndroidPackageFile(fileName);
  const visitorIsIOS = isIOS();
  const manifestUrl = `${window.location.origin}/api/ipa-manifest?id=${encodeURIComponent(video.driveFileId)}`;
  // A plain navigation, not routed through handleDownloadFile - iOS fetches the manifest and the
  // .ipa itself entirely on-device after this, invisible to our JS, so there's no reliable moment
  // to fire the one-time-link "consume" call without risking deleting the file out from under a
  // still-in-progress OS-driven install.
  const itmsInstallUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;

  // File type icon selector - covers video/image/audio/apk-aab-ipa/archive/document/other
  const renderFileIcon = () => {
    const meta = getFileTypeMeta(fileName, video.mimeType);
    return (
      <div className={`w-24 h-24 rounded-3xl ${meta.bg} border ${meta.border} flex items-center justify-center ${meta.iconColor}`}>
        <meta.Icon className="w-12 h-12" />
      </div>
    );
  };

  // Direct download handler (works for anyone with link without requiring sign-in)
  // After download is triggered, file is automatically purged from Drive and link expires
  const handleDownloadFile = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadSpeed(0);
      setDownloadEta(0);
      speedTrackerRef.current.reset(0);

      // Public download, routed through our own /api/download-file proxy rather than
      // drive.google.com directly - drive.google.com is a verified Android App Link, so a raw
      // navigation there gets intercepted into a Google account-picker prompt instead of just
      // downloading the file. Fetched (rather than a plain <a> navigation) so a broken/misrouted
      // proxy response is caught here and surfaced as an error instead of silently being saved
      // as if it were the real file. Works for anyone with the link - no sign-in required.
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

      // 3. One-time link security: Delete file from Drive if it's a temporary upload, expire link, and show used state.
      // Recipients only ever hold public "reader" access and have no Drive credentials of their
      // own, so deletion has to run server-side (via a service-account-backed endpoint) rather
      // than through the client-side Drive API, which only the file's owner could authorize.
      if (isTemporaryUpload(video)) {
        await driveApi.consumeTemporaryDownload(video.driveFileId);

        // Lock UI immediately
        setDownloadReason('downloaded');
        setIsExpired(true);
      }
    } catch (e: any) {
      console.error('Download trigger error:', e);
      showToast('Download Failed', e?.message || 'Unable to download this file right now.', 'error', 8000);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadSpeed(0);
      setDownloadEta(0);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
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

      {/* Media or Universal File Download Container */}
      {isVideoFile ? (
        <div className="w-full">
          <VideoPlayer video={video} onDownload={handleDownloadFile} isDownloading={isDownloading} />
        </div>
      ) : (
        <div className="glass-card p-6 sm:p-10 md:p-14 rounded-2xl sm:rounded-3xl border border-slate-800 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex justify-center mb-6">{renderFileIcon()}</div>

          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-3">
            FILE READY FOR DOWNLOAD
          </span>

          <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white mb-2 max-w-xl mx-auto break-all">
            {video.originalFileName || video.name}
          </h2>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-400 mb-8">
            <span className="font-semibold text-slate-200">{formatFileSize(video.size)}</span>
            <span>•</span>
            <span className="font-mono text-indigo-300">{video.mimeType || 'Application/File'}</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">Secure Direct Transfer</span>
          </div>

          <div className="flex flex-col items-center gap-3">
            {fileIsIpa && visitorIsIOS && (
              <a
                href={itmsInstallUrl}
                className="inline-flex items-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base shadow-xl shadow-emerald-600/40 hover:shadow-emerald-500/60 hover:scale-[1.02] transition-all"
              >
                <Smartphone className="w-5 h-5" />
                <span>Install on this iPhone/iPad</span>
              </a>
            )}

            {fileIsIpa && !visitorIsIOS && (
              <div className="max-w-sm text-xs sm:text-sm text-slate-400 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 flex items-start gap-2 text-left">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>This is an iOS app build. Open this link on an iPhone or iPad in Safari to install it directly.</span>
              </div>
            )}

            {fileIsAndroidPackage && visitorIsIOS && (
              <div className="max-w-sm text-xs sm:text-sm text-slate-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-2 text-left">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>This is an Android app build (.apk) and can't be installed on an iPhone or iPad. You can still download the raw file below.</span>
              </div>
            )}

            <button
              onClick={handleDownloadFile}
              disabled={isDownloading}
              className="inline-flex items-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm sm:text-base shadow-xl shadow-indigo-600/40 hover:shadow-indigo-500/60 hover:scale-[1.02] transition-all disabled:opacity-50"
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
                  <Download className="w-5 h-5" />
                  <span>
                    {fileIsIpa && visitorIsIOS
                      ? `Download .ipa File (${formatFileSize(video.size)})`
                      : `Download File (${formatFileSize(video.size)})`}
                  </span>
                </>
              )}
            </button>

            {isDownloading && (
              <div className="w-full max-w-sm space-y-1.5">
                <div className="h-2 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{formatSpeed(downloadSpeed)}</span>
                  <span>{downloadEta > 0 ? `${formatEta(downloadEta)} left` : 'Calculating...'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video / File Details & Interaction Panel */}
      <div className="glass-card p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border border-slate-800 space-y-4 sm:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 sm:pb-6 border-b border-slate-800">
          <div className="min-w-0 space-y-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold text-white truncate" title={video.originalFileName || video.name}>
              {video.originalFileName || video.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Uploaded {new Date(video.createdAt).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                {formatFileSize(video.size)}
              </span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-mono text-[11px] border border-indigo-500/20">
                {video.mimeType}
              </span>
            </div>
          </div>

          {/* Quick Sharing Toolbar */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            {isVideoFile && (
              <button
                onClick={handleDownloadFile}
                disabled={isDownloading}
                title={isDownloading ? `Downloading ${downloadProgress}% (${formatSpeed(downloadSpeed)})` : 'Download Video'}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all disabled:opacity-60"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{isDownloading && downloadProgress > 0 ? `${downloadProgress}%` : 'Download'}</span>
              </button>
            )}

            <CopyLinkButton url={watchUrl} label="Copy Link" />

            <button
              onClick={() => setShowQRModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors"
            >
              <QrCode className="w-4 h-4 text-indigo-400" />
              <span>QR Code</span>
            </button>
          </div>
        </div>
      </div>

      {showQRModal && (
        <QRModal
          isOpen={showQRModal}
          onClose={() => setShowQRModal(false)}
          videoId={video.id}
          videoTitle={video.originalFileName || video.name}
        />
      )}
    </div>
  );
};
