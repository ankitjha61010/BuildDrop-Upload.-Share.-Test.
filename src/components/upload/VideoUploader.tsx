import React, { useState, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import { ResumableUploader, MAX_FILE_SIZE_BYTES } from '../../services/resumableUpload';
import { UploadProgress } from './UploadProgress';
import { UploadProgressInfo, VideoMetadata } from '../../types';
import { qrService } from '../../services/qrService';
import { CopyLinkButton } from '../common/CopyLinkButton';
import { QRModal } from '../common/QRModal';
import { FileCategory, formatFileSize, getFileTypeMeta } from '../../utils/fileType';
import {
  UploadCloud,
  CheckCircle2,
  QrCode,
  ShieldAlert,
} from 'lucide-react';

export const VideoUploader: React.FC = () => {
  const { showToast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [fileCategory, setFileCategory] = useState<FileCategory>('other');
  const [dragActive, setDragActive] = useState(false);
  const [progressInfo, setProgressInfo] = useState<UploadProgressInfo | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<VideoMetadata | null>(null);
  const [uploaderInstance, setUploaderInstance] = useState<ResumableUploader | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // Reset previous states
    setUploadedVideo(null);
    setProgressInfo(null);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(
        'File Too Large',
        `Maximum video size is 12 GB. Selected file is ${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB.`,
        'error',
        6000
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    const category = getFileTypeMeta(file.name, file.type).category;
    setFileCategory(category);

    // Only videos and images can be rendered as an actual media preview;
    // everything else (zip/apk/aab/ipa/docs/...) gets a file-type icon instead.
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
  };

  const startUpload = async () => {
    if (!selectedFile) return;

    const uploader = new ResumableUploader({
      file: selectedFile,
      onProgress: (info) => {
        setProgressInfo(info);
      },
    });

    setUploaderInstance(uploader);

    try {
      const result = await uploader.start();
      setUploadedVideo(result);
      showToast('Upload Successful!', `"${selectedFile.name}" is now ready to share.`, 'success', 5000);
    } catch (err: any) {
      if (err.message !== 'Upload was cancelled.') {
        showToast('Upload Error', err.message || 'Failed to upload video to Google Drive.', 'error', 6000);
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
  };

  const watchUrl = uploadedVideo ? qrService.getWatchUrl(uploadedVideo.id) : '';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
            Your secure transfer link is ready to share. Anyone with this link can download the file.
          </p>

          {/* Share URL Box */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 max-w-xl mx-auto mb-8 text-left">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 font-medium">Share Link:</span>
              <span className="text-[11px] text-indigo-400 font-mono">Secure One-Time Link</span>
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
              className={`glass-panel p-10 sm:p-14 rounded-3xl border-2 border-dashed text-center cursor-pointer transition-all duration-300 relative overflow-hidden group ${
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

              <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6 text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300">
                <UploadCloud className="w-10 h-10" />
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Drag and drop any file here
              </h3>
              <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
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
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-800/90 text-slate-300 border border-slate-700">
                  Folder: VidSetu_Uploads
                </span>
              </div>
            </div>
          ) : (
            /* Selected File Details & Preview */
            <div className="glass-card p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Real Preview (video/image) or File-Type Icon */}
                <div className="w-full md:w-56 h-36 bg-black rounded-2xl overflow-hidden border border-slate-800 relative flex items-center justify-center shrink-0">
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
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                      {(() => {
                        const meta = getFileTypeMeta(selectedFile.name, selectedFile.type);
                        return (
                          <>
                            <div className={`w-14 h-14 rounded-2xl ${meta.bg} border ${meta.border} flex items-center justify-center mb-2`}>
                              <meta.Icon className={`w-7 h-7 ${meta.iconColor}`} />
                            </div>
                            <span className="text-[11px]">{meta.label}</span>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* File Information */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Ready to Upload (Max 12 GB)
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white truncate" title={selectedFile.name}>
                    {selectedFile.name}
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div className="min-w-0">
                      <span className="text-slate-400 block">File Size:</span>
                      <span className="font-semibold text-slate-200">{formatFileSize(selectedFile.size)}</span>
                    </div>
                    <div className="min-w-0" title={`${getFileTypeMeta(selectedFile.name, selectedFile.type).label} (${selectedFile.type || 'unknown'})`}>
                      <span className="text-slate-400 block">File Type:</span>
                      <span className="font-semibold text-slate-200 truncate block">
                        {getFileTypeMeta(selectedFile.name, selectedFile.type).label} ({selectedFile.type || 'unknown'})
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block">Target Upload Folder:</span>
                      <span className="font-semibold text-indigo-300 truncate block">
                        VidSetu_Uploads
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block">Transfer Security:</span>
                      <span className="font-semibold text-emerald-400">Auto-Deleted on Download</span>
                    </div>
                  </div>
                </div>
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
