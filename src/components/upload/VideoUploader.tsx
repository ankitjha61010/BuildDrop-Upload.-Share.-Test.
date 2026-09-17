import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import { ResumableUploader, MAX_FILE_SIZE_BYTES } from '../../services/resumableUpload';
import { UploadProgress } from './UploadProgress';
import { UploadProgressInfo, VideoMetadata } from '../../types';
import { qrService } from '../../services/qrService';
import { CopyLinkButton } from '../common/CopyLinkButton';
import { QRModal } from '../common/QRModal';
import { FileCategory, formatFileSize, getFileTypeMeta, isIpaFile, isAndroidPackageFile, parseAppMetadataFromFilename } from '../../utils/fileType';
import { driveApi, normalizeAppIconUrl } from '../../services/driveApi';
import { getOrCreateUserId } from '../../utils/userId';
import {
  UploadCloud,
  CheckCircle2,
  QrCode,
  ShieldAlert,
  Smartphone,
  Folder,
  Copy,
  Trash2,
  ExternalLink,
  History,
  Clock,
} from 'lucide-react';

interface VideoUploaderProps {
  targetFolder?: string;
  showTargetFolderDropdown?: boolean;
  onUploadComplete?: (video: VideoMetadata) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ targetFolder, showTargetFolderDropdown, onUploadComplete }) => {
  const { showToast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState<string>('');
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [parsedFileMeta, setParsedFileMeta] = useState<{ appName?: string; bundleId?: string; bundleVersion?: string; buildNumber?: string; appIcon?: string } | null>(null);
  const [fileCategory, setFileCategory] = useState<FileCategory>('other');
  const [dragActive, setDragActive] = useState(false);
  const [progressInfo, setProgressInfo] = useState<UploadProgressInfo | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<VideoMetadata | null>(null);
  const [uploaderInstance, setUploaderInstance] = useState<ResumableUploader | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [activeTargetFolder, setActiveTargetFolder] = useState<string>(targetFolder || 'BuildDrop_Uploads');
  const [recentUploads, setRecentUploads] = useState<VideoMetadata[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRecentUploads = async () => {
    const currentUserId = getOrCreateUserId();
    const cache = driveApi.getLocalMetadataCache();
    const list = Object.values(cache)
      .filter((item): item is VideoMetadata => Boolean(item && item.id && item.name && (!item.userId || item.userId === currentUserId)))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 3)
      // Self-heals cache entries saved before icon URLs were routed through /api/download-file -
      // without this, a build cached with the old raw Drive hotlink would show a broken icon
      // forever, since nothing else ever re-derives this field for an already-cached item.
      .map((item) => {
        const normalizedIcon = normalizeAppIconUrl(item.appIcon);
        if (normalizedIcon !== item.appIcon) {
          const healed = { ...item, appIcon: normalizedIcon };
          driveApi.cacheVideoMetadata(healed as VideoMetadata);
          return healed;
        }
        return item;
      });
    setRecentUploads(list);

    // Verify recent builds against Drive metadata and purge any non-existent/deleted files from cache
    for (const item of list) {
      try {
        const res = await fetch(`/api/get-metadata?id=${encodeURIComponent(item.id)}`);
        if (res.status === 404) {
          driveApi.removeCachedMetadata(item.id);
          setRecentUploads((prev) => prev.filter((i) => i.id !== item.id));
        }
      } catch {}
    }
  };

  useEffect(() => {
    loadRecentUploads();
  }, []);

  const handleDeleteRecent = async (fileId: string, fileName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${fileName}"? This will delete the build folder and all its contents.`)) {
      return;
    }
    try {
      await driveApi.consumeTemporaryDownload(fileId);
      driveApi.removeCachedMetadata(fileId);
      showToast('Build Deleted', `"${fileName}" has been deleted from cloud storage and cache.`, 'info');
      loadRecentUploads();
    } catch (err: any) {
      driveApi.removeCachedMetadata(fileId);
      showToast('Build Removed', `"${fileName}" removed from list.`, 'info');
      loadRecentUploads();
    }
  };

  const handleClearAllHistory = () => {
    const cache = driveApi.getLocalMetadataCache();
    Object.keys(cache).forEach((id) => driveApi.removeCachedMetadata(id));
    setRecentUploads([]);
    showToast('Cache Cleared', 'All local recent uploads history cleared.', 'info');
  };

  const handleCopyRecentLink = (fileId: string) => {
    const watchUrl = qrService.getWatchUrl(fileId);
    navigator.clipboard.writeText(watchUrl);
    showToast('Link Copied', 'Share link copied to clipboard!', 'success');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    setUploadedVideo(null);
    setProgressInfo(null);
    setParsedFileMeta(null);
    setDescription('');
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(
        'File Too Large',
        `Maximum file size is 12 GB. Selected file is ${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB.`,
        'error',
        6000
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    const category = getFileTypeMeta(file.name, file.type).category;
    setFileCategory(category);

    if (category === 'video' || category === 'image') {
      try {
        const url = URL.createObjectURL(file);
        setVideoPreviewUrl(url);
      } catch {
        setVideoPreviewUrl(null);
      }
    } else {
      setVideoPreviewUrl(null);
    }

    // Immediately extract app info for IPA / APK files using browser bundle
    if (/\.(ipa|apk)$/i.test(file.name)) {
      import('app-info-parser/dist/app-info-parser.js').then(async (module) => {
        try {
          const AppInfoParserModule = module.default || (module as any).AppInfoParser || (window as any).AppInfoParser;
          if (!AppInfoParserModule) return;

          const parser = new AppInfoParserModule(file);
          const info: any = await parser.parse();

          let rawAppName = info.CFBundleDisplayName || info.CFBundleName || info.application?.label;
          if (Array.isArray(rawAppName)) rawAppName = rawAppName[0];
          if (typeof rawAppName === 'object' && rawAppName) rawAppName = rawAppName.value || rawAppName[0];

          const bundleId = info.CFBundleIdentifier || info.package;
          const bundleVersion = info.CFBundleShortVersionString || info.versionName || info.CFBundleVersion;
          const buildNumber = info.CFBundleVersion || (info.versionCode ? info.versionCode.toString() : undefined);

          let appIconData: string | undefined = undefined;

          // Density-ordered regex matching for crisp HD launcher icons
          const densityRegexes = [
            /mipmap-xxxhdpi.*ic_launcher.*\.(png|webp)$/i,
            /mipmap-xxhdpi.*ic_launcher.*\.(png|webp)$/i,
            /drawable-xxxhdpi.*ic_launcher.*\.(png|webp)$/i,
            /drawable-xxhdpi.*ic_launcher.*\.(png|webp)$/i,
            /mipmap-xxxhdpi.*\.(png|webp)$/i,
            /mipmap-xxhdpi.*\.(png|webp)$/i,
            /drawable-xxxhdpi.*\.(png|webp)$/i,
            /drawable-xxhdpi.*\.(png|webp)$/i,
            /mipmap-xhdpi.*ic_launcher.*\.(png|webp)$/i,
            /mipmap-hdpi.*ic_launcher.*\.(png|webp)$/i,
            /AppIcon.*60x60@3x\.png$/i,
            /AppIcon.*60x60@2x\.png$/i,
          ];

          if (typeof (parser as any).getEntry === 'function') {
            for (const regex of densityRegexes) {
              try {
                const iconBuffer = await (parser as any).getEntry(regex);
                if (iconBuffer && iconBuffer.length > 0) {
                  const base64 = Buffer.from(iconBuffer).toString('base64');
                  appIconData = `data:image/png;base64,${base64}`;
                  break;
                }
              } catch {}
            }
          }

          if (!appIconData) {
            let rawIconPaths: any = info?.application?.icon || info?.icon;
            if (rawIconPaths && !Array.isArray(rawIconPaths) && typeof rawIconPaths === 'object') {
              rawIconPaths = Object.values(rawIconPaths);
            }

            if (Array.isArray(rawIconPaths)) {
              const pngPaths: string[] = rawIconPaths
                .map((p: any) => (typeof p === 'string' ? p : p?.path || ''))
                .filter((p: string) => typeof p === 'string' && /\.(png|webp)$/i.test(p));

              const scorePath = (p: string) => {
                let score = 0;
                const lower = p.toLowerCase();
                if (lower.includes('xxxhdpi') || lower.includes('512') || lower.includes('192')) score += 50;
                else if (lower.includes('xxhdpi') || lower.includes('144')) score += 40;
                else if (lower.includes('xhdpi') || lower.includes('96')) score += 30;
                else if (lower.includes('hdpi') || lower.includes('72')) score += 20;

                if (lower.includes('ic_launcher') || lower.includes('app_icon')) score += 15;
                if (lower.includes('foreground') || lower.includes('background')) score -= 5;
                return score;
              };

              pngPaths.sort((a, b) => scorePath(b) - scorePath(a));

              for (const candidatePath of pngPaths) {
                if (typeof (parser as any).getEntry === 'function') {
                  try {
                    const iconBuffer = await (parser as any).getEntry(candidatePath);
                    if (iconBuffer && iconBuffer.length > 0) {
                      const base64 = Buffer.from(iconBuffer).toString('base64');
                      appIconData = `data:image/png;base64,${base64}`;
                      break;
                    }
                  } catch {}
                }
              }
            }
          }

          if (!appIconData) {
            let rawIcon = info.icon;
            if (rawIcon && typeof rawIcon.then === 'function') {
              rawIcon = await rawIcon;
            }
            if (typeof rawIcon === 'string' && rawIcon.startsWith('data:image/')) {
              appIconData = rawIcon;
            }
          }

          setParsedFileMeta({
            appName: typeof rawAppName === 'string' ? rawAppName : undefined,
            bundleId,
            bundleVersion,
            buildNumber,
            appIcon: appIconData,
          });
        } catch (err) {
          console.warn('Pre-upload app info extraction error:', err);
        }
      });
    }
  };

  const startUpload = async () => {
    if (!selectedFile) return;

    const uploader = new ResumableUploader({
      file: selectedFile,
      targetFolder: activeTargetFolder,
      description: description.trim() || undefined,
      onProgress: (info) => {
        setProgressInfo(info);
      },
    });

    setUploaderInstance(uploader);

    try {
      const result = await uploader.start();
      setUploadedVideo(result);
      loadRecentUploads();
      onUploadComplete?.(result);
      showToast('Upload Successful!', `"${selectedFile.name}" is ready to share.`, 'success', 5000);
    } catch (err: any) {
      if (err.message !== 'Upload was cancelled.') {
        const isStorageFull = /storage|quota|full|space|exceeded|507/i.test(err.message || '');
        const title = isStorageFull ? 'Cloud Storage Full' : 'Upload Error';
        const msg = isStorageFull
          ? 'Cloud storage space is currently full. Please wait a few moments while expired builds auto-cleanup, or try again later.'
          : (err.message || 'Failed to upload to Google Drive.');
        showToast(title, msg, 'error', 8000);
      }
    }
  };

  const handleCancelSelection = () => {
    if (uploaderInstance) {
      uploaderInstance.cancel();
    }
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setSelectedFile(null);
    setVideoPreviewUrl(null);
    setFileCategory('other');
    setProgressInfo(null);
    setUploaderInstance(null);
    setUploadedVideo(null);
    setDescription('');
    loadRecentUploads();
  };

  const watchUrl = uploadedVideo ? qrService.getWatchUrl(uploadedVideo.id) : '';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Target Folder Selector Dropdown (Admin Only when requested) */}
      {Boolean(showTargetFolderDropdown) && (
        <div className="glass-panel p-3 px-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Upload Target Folder (Admin):</span>
          </div>
          <select
            value={activeTargetFolder}
            onChange={(e) => setActiveTargetFolder(e.target.value)}
            className="bg-slate-800 text-xs font-bold text-indigo-200 px-3 py-1.5 rounded-xl border border-indigo-500/30 focus:outline-none focus:border-indigo-400 cursor-pointer shadow-sm"
          >
            <option value="BuildDrop_Uploads">BuildDrop_Uploads (Public User Storage)</option>
            <option value="Private_BuildDrop_Uploads">Private_BuildDrop_Uploads (Private Storage)</option>
          </select>
        </div>
      )}

      {/* Upload Success State Screen */}
      {uploadedVideo ? (
        <div className="glass-card p-8 rounded-3xl border border-emerald-500/30 text-center relative overflow-hidden animate-fadeIn shadow-2xl">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="w-20 h-20 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6 text-emerald-400">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
            UPLOAD SUCCESSFUL
          </span>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
            File Uploaded Successfully
          </h2>
          <p className="text-sm text-slate-300 max-w-lg mx-auto mb-6">
            Your encrypted transfer link is ready to share. Anyone with this link can view or download the file.
          </p>

          {uploadedVideo.description && (
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 max-w-xl mx-auto mb-6 text-left">
              <span className="text-xs text-slate-400 font-medium block mb-1">Description:</span>
              <p className="text-sm text-slate-200">{uploadedVideo.description}</p>
            </div>
          )}

          {/* Share URL Box */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 max-w-xl mx-auto mb-8 text-left">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 font-medium">Share Link:</span>
            </div>
            <p className="text-xs sm:text-sm font-mono text-indigo-300 bg-black/40 p-3 rounded-xl border border-slate-800 break-all select-all">
              {watchUrl}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <CopyLinkButton url={watchUrl} label="Copy Share Link" className="px-6 py-3" />

            <button
              onClick={() => setIsQRModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold border border-slate-700 hover:border-slate-600 transition-all text-sm"
            >
              <QrCode className="w-4 h-4 text-indigo-400" />
              Generate QR
            </button>

            <button
              onClick={handleCancelSelection}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30 transition-all text-sm"
            >
              Upload Another File
            </button>
          </div>

          {isQRModalOpen && (
            <QRModal
              isOpen={isQRModalOpen}
              onClose={() => setIsQRModalOpen(false)}
              videoId={uploadedVideo.id}
              videoTitle={uploadedVideo.name}
            />
          )}
        </div>
      ) : (
        <>
          {/* Main Upload / Dropzone Area */}
          {!selectedFile ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`glass-panel p-6 sm:p-8 rounded-3xl border-2 border-dashed text-center cursor-pointer transition-all duration-300 relative overflow-hidden group ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                  : 'border-slate-700 hover:border-indigo-500/60 hover:bg-slate-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3 text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300">
                <UploadCloud className="w-7 h-7" />
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white mb-1.5">
                Drag and drop any file here
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mb-4 max-w-md mx-auto">
                Or click to browse from desktop or select files (APK, ZIP, videos, etc.) on mobile devices.
              </p>

              {/* Supported formats & limits */}
              <div className="inline-flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Max Size: 12 GB
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-800/90 text-slate-300 border border-slate-700">
                  APK, ZIP, MP4, MKV, Any Format
                </span>
                {Boolean(showTargetFolderDropdown) && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-800/90 text-indigo-300 border border-indigo-500/30">
                    Target: {activeTargetFolder}
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Selected File Details & Preview */
            <div className="glass-card p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Real Preview (video/image), App Icon, or File-Type Icon */}
                {(() => {
                  const isIpa = isIpaFile(selectedFile.name);
                  const isAndroidPkg = isAndroidPackageFile(selectedFile.name);
                  const isAppPkg = isIpa || isAndroidPkg || fileCategory === 'apk';
                  const appMeta = parseAppMetadataFromFilename(selectedFile.name);

                  const displayName = parsedFileMeta?.appName || appMeta.cleanAppName || selectedFile.name;
                  const displayBundleId = parsedFileMeta?.bundleId || `com.builddrop.${(displayName || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                  const displayVersion = parsedFileMeta?.bundleVersion || appMeta.version;
                  const displayBuild = parsedFileMeta?.buildNumber || appMeta.buildNumber;

                  const platformLabel = isIpa ? 'iOS Build (.ipa)' : isAndroidPkg ? 'Android Package (.apk)' : 'App Package';
                  const appInitials = (displayName || 'App').split(' ').filter(Boolean).map(w => w[0] || '').join('').slice(0, 4) || 'APP';

                  return (
                    <>
                      <div className="w-full md:w-56 h-36 bg-[#0a0e17] rounded-2xl overflow-hidden border border-slate-800 relative flex items-center justify-center shrink-0">
                        {videoPreviewUrl && fileCategory === 'video' ? (
                          <video
                            src={videoPreviewUrl}
                            className="w-full h-full object-contain"
                            controls
                            playsInline
                          />
                        ) : videoPreviewUrl && fileCategory === 'image' ? (
                          <img
                            src={videoPreviewUrl}
                            alt={selectedFile.name}
                            className="w-full h-full object-contain"
                          />
                        ) : parsedFileMeta?.appIcon ? (
                          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 p-4 flex flex-col items-center justify-center text-center">
                            <img
                              src={parsedFileMeta.appIcon}
                              alt={displayName}
                              className="w-16 h-16 object-contain rounded-2xl border border-white/10 shadow-xl mb-1.5 bg-black/40 p-1"
                            />
                            <span className="text-[10px] font-medium text-indigo-300">
                              {platformLabel}
                            </span>
                          </div>
                        ) : isAppPkg ? (
                          <div className="w-full h-full bg-gradient-to-br from-indigo-950/80 via-purple-950/60 to-slate-950 p-4 flex flex-col items-center justify-center text-center select-none">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/20 shadow-xl flex items-center justify-center mb-2">
                              <Smartphone className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xs font-extrabold tracking-widest uppercase text-white/90 truncate max-w-[170px] px-1">
                              {appInitials}
                            </span>
                            <span className="text-[10px] font-medium text-indigo-300 mt-0.5">
                              {platformLabel}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                            {(() => {
                              const meta = getFileTypeMeta(selectedFile.name, selectedFile.type);
                              return (
                                <>
                                  <div className={`w-14 h-14 rounded-2xl ${meta.bg} border ${meta.border} flex items-center justify-center mb-2`}>
                                    <meta.Icon className={`w-7 h-7 ${meta.iconColor}`} />
                                  </div>
                                  <span className="text-[11px] text-slate-300">{meta.label}</span>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* File Information */}
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Ready to Upload (Max 12 GB)
                          </span>
                          {isAppPkg && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {platformLabel}
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-xl font-bold text-white truncate" title={displayName}>
                            {displayName}
                          </h3>
                          <p className="font-mono text-xs text-slate-400 truncate mt-0.5" title={selectedFile.name}>
                            File: {selectedFile.name}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-800/80">
                          <div className="min-w-0">
                            <span className="text-slate-400 block text-[11px]">File Size:</span>
                            <span className="font-semibold text-slate-200">{formatFileSize(selectedFile.size)}</span>
                          </div>

                          {isAppPkg ? (
                            <>
                              <div className="min-w-0">
                                <span className="text-slate-400 block text-[11px]">Version & Build:</span>
                                <span className="font-semibold text-indigo-300">v{displayVersion} (#{displayBuild})</span>
                              </div>
                              <div className="min-w-0 col-span-2 sm:col-span-1">
                                <span className="text-slate-400 block text-[11px]">
                                  {parsedFileMeta?.bundleId ? 'Bundle ID:' : 'Estimated Bundle ID:'}
                                </span>
                                <span className="font-mono font-semibold text-slate-300 truncate block text-[11px]" title={displayBundleId}>{displayBundleId}</span>
                              </div>
                            </>
                          ) : (
                            <div className="min-w-0">
                              <span className="text-slate-400 block text-[11px]">Category:</span>
                              <span className="font-semibold text-slate-200 truncate block">
                                {getFileTypeMeta(selectedFile.name, selectedFile.type).label}
                              </span>
                            </div>
                          )}

                          <div className="min-w-0">
                            <span className="text-slate-400 block text-[11px]">Target Folder:</span>
                            <span className="font-semibold text-indigo-300 truncate block">{activeTargetFolder}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Build Description Input */}
              <div>
                <label htmlFor="build-description" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Description <span className="text-slate-500 font-normal">(optional, up to 90 characters)</span>
                </label>
                <textarea
                  id="build-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 90))}
                  disabled={Boolean(progressInfo && progressInfo.status !== 'failed' && progressInfo.status !== 'cancelled')}
                  placeholder="Add a note about this file - what it is, what changed, or anything the recipient should know"
                  rows={4}
                  maxLength={90}
                  className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all resize-none disabled:opacity-50"
                />
                <p className="text-right text-[10px] text-slate-500 mt-1">{description.length}/90</p>
              </div>

              {/* Progress State while uploading */}
              {progressInfo && (
                <UploadProgress
                  progressInfo={progressInfo}
                  fileName={selectedFile.name}
                  onPause={() => uploaderInstance?.pause()}
                  onResume={() => uploaderInstance?.resume()}
                  onCancel={handleCancelSelection}
                />
              )}

              {/* Action Buttons when not in uploading loop */}
              {(!progressInfo || progressInfo.status === 'failed' || progressInfo.status === 'cancelled') && (
                <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={handleCancelSelection}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startUpload}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/50 transition-all text-sm"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Start Chunked Upload</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* User's 3 Previous Builds Section */}
      {recentUploads.length > 0 && (
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Your Recent Uploads (Last 3 Builds)</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearAllHistory}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
                title="Clear local upload cache"
              >
                Clear History
              </button>
              <span className="text-xs text-slate-400 font-mono">{recentUploads.length} item(s)</span>
            </div>
          </div>

          <div className="space-y-3">
            {recentUploads.map((item) => {
              const displayTitle = item.appName || item.originalFileName || item.name;
              const displayVersionStr = item.bundleVersion ? `v${item.bundleVersion} (#${item.buildNumber || '1'})` : formatFileSize(item.size);

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden p-1">
                      {item.appIcon ? (
                        <img src={item.appIcon} alt={displayTitle} className="w-full h-full object-contain rounded-xl" />
                      ) : (
                        <Smartphone className="w-6 h-6 text-indigo-400" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate max-w-xs" title={displayTitle}>
                          {displayTitle}
                        </h4>
                        {item.bundleId && (
                          <span className="text-[10px] font-mono text-indigo-300/90 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-500/20 truncate max-w-[220px]" title={item.bundleId}>
                            {item.bundleId}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-semibold text-indigo-300">{displayVersionStr}</span>
                        <span>•</span>
                        <span>{formatFileSize(item.size)}</span>
                        {item.createdAt && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300 font-medium inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-sky-400" />
                              {(() => {
                                const date = new Date(item.createdAt);
                                const now = new Date();
                                const isToday = date.toDateString() === now.toDateString();
                                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return isToday ? `Today at ${timeStr}` : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
                              })()}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                          {item.uploadType === 'PRIVATE' ? 'Private Storage' : 'Public Storage'}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-400 mt-1 truncate max-w-md" title={item.description}>
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions: Copy Share Link & Delete */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => handleCopyRecentLink(item.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition-all"
                      title="Copy Share Link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </button>

                    <a
                      href={qrService.getWatchUrl(item.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                      title="View Share Page"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      onClick={() => handleDeleteRecent(item.id, item.name)}
                      className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-colors"
                      title="Delete Build"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info notice about direct browser upload and secure transfer */}
      <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-slate-300 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-indigo-200">
            Privacy & Automatic Auto-Deletion Architecture
          </p>
          <p className="text-slate-400 leading-relaxed">
            BuildDrop transfers files directly with chunked upload acceleration without third-party servers. When the recipient downloads the file, it is automatically removed and the link expires.
          </p>
        </div>
      </div>
    </div>
  );
};
