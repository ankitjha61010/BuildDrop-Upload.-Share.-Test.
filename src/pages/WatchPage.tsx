import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { driveApi, getDirectDownloadUrl } from '../services/driveApi';
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
  Trash2,
} from 'lucide-react';

export const WatchPage: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const { showToast } = useToast();
  const [video, setVideo] = useState<VideoMetadata | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [downloadReason] = useState<'downloaded' | 'expired'>('expired');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
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

  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Manual Delete File handler
  const handleDeleteFile = async () => {
    if (!video) return;
    if (!window.confirm(`Are you sure you want to delete "${video.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      setIsDeleting(true);
      await driveApi.consumeTemporaryDownload(video.driveFileId);
      showToast('File Deleted', 'The file has been permanently deleted.', 'success');
      window.location.href = '/';
    } catch (e: any) {
      console.error('Delete error:', e);
      showToast('Delete Failed', e?.message || 'Unable to delete file.', 'error');
      setIsDeleting(false);
    }
  };

  // Direct download handler
  const handleDownloadFile = () => {
    try {
      setIsDownloading(true);
      const downloadUrl = getDirectDownloadUrl(video.driveFileId, video.originalFileName || video.name);
      window.location.href = downloadUrl;
      showToast('Download Started', 'Your build file download has started.', 'success');
    } catch (e: any) {
      console.error('Download trigger error:', e);
      showToast('Download Failed', e?.message || 'Unable to download file.', 'error', 8000);
    } finally {
      setTimeout(() => setIsDownloading(false), 2000);
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
                  <div className="w-full h-full bg-gradient-to-br from-indigo-500 via-purple-600 to-slate-900 flex flex-col items-center justify-center p-2 text-center select-none">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20 mb-1 shadow-inner">
                      <Smartphone className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[10px] font-extrabold tracking-widest uppercase text-white/90 truncate max-w-[80px] px-1">
                      {(cleanAppName || 'Build').split(' ').filter(Boolean).map(w => w[0] || '').join('').slice(0, 4) || (cleanAppName || 'Build').slice(0, 4)}
                    </span>
                  </div>
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
                {/* {fileIsIpa && visitorIsIOS && (
                  <div className="text-[11px] sm:text-xs text-slate-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-start gap-2 text-left">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>iOS Installation Notice:</strong> After tapping Install, return to home screen. If iOS shows "Unable to Verify", go to <strong>Settings → General → VPN & Device Management</strong> and tap <strong>Trust Certificate</strong>.
                    </span>
                  </div>
                )} */}

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
                    onClick={() => {
                      if (fileIsIpa) {
                        showToast('iOS Device Required', 'Over-The-Air (OTA) installation requires Safari on an iPhone/iPad. Downloading .ipa file instead.', 'info', 5000);
                      }
                      handleDownloadFile();
                    }}
                    disabled={isDownloading}
                    className="w-full py-3.5 px-6 rounded-xl bg-[#84cc16] hover:bg-[#74b810] active:scale-[0.99] text-slate-950 font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-lime-500/20 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Starting Download...</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-5 h-5" />
                        <span>{fileIsIpa ? 'Download .ipa Build' : 'Install / Download Build'}</span>
                      </>
                    )}
                  </button>
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

                {/* Secondary Action - Upload Another Build & Delete */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <Link
                    to="/"
                    className="w-full sm:w-auto py-2 px-4 rounded-xl hover:bg-slate-800/60 text-slate-400 hover:text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all text-center"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Upload Another Build</span>
                  </Link>

                  <button
                    onClick={handleDeleteFile}
                    disabled={isDeleting}
                    className="w-full sm:w-auto py-2 px-4 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 font-medium text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="Permanently delete this build from storage"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span>Delete Build Data</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
