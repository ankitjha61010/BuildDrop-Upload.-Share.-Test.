import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  LogOut,
  RefreshCw,
  Plus,
  Search,
  Folder,
  FolderLock,
  Smartphone,
  Edit2,
  Trash2,
  ExternalLink,
  X,
  Loader2,
  Trash,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { checkIsAdminAuthenticated, clearAdminAuthentication, AdminLoginPage } from './AdminLoginPage';
import { VideoUploader } from '../components/upload/VideoUploader';
import { LoadingState } from '../components/common/LoadingState';
import { formatFileSize, parseAppMetadataFromFilename } from '../utils/fileType';
import { encodeFileId } from '../utils/urlSecurity';
import { driveApi } from '../services/driveApi';
import { ResumableUploader } from '../services/resumableUpload';

interface AdminFileItem {
  id: string;
  driveFileId: string;
  name: string;
  originalFileName: string;
  size: number;
  mimeType: string;
  createdAt: number;
  expiresAt: number;
  isExpired: boolean;
  folderName: string;
  appName: string;
  bundleId: string;
  bundleVersion: string;
  buildNumber: string;
  appIcon?: string;
  uploadType?: 'NORMAL' | 'PRIVATE';
  description?: string;
}

export const AdminListPage: React.FC = () => {
  const { showToast } = useToast();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(checkIsAdminAuthenticated());
  const [files, setFiles] = useState<AdminFileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'public' | 'private'>('all');

  // Modals & Operations
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [editingFile, setEditingFile] = useState<AdminFileItem | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editAppName, setEditAppName] = useState('');
  const [editBundleId, setEditBundleId] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editBuildNumber, setEditBuildNumber] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUploadType, setEditUploadType] = useState<'NORMAL' | 'PRIVATE'>('NORMAL');
  const [editExpiryDays, setEditExpiryDays] = useState('12');

  // Image replacement state
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState<boolean>(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Build file replacement state
  const [replacementBuildFile, setReplacementBuildFile] = useState<File | null>(null);
  const [replacementProgress, setReplacementProgress] = useState<number | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const replacementFileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin-list-files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      } else {
        const errText = await res.text();
        showToast('Fetch Error', errText || 'Failed to load file list.', 'error');
      }
    } catch (err: any) {
      console.error('Failed to load admin files:', err);
      showToast('Error', err?.message || 'Network error loading admin files.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchFiles();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <AdminLoginPage />;
  }

  const handleLogout = () => {
    clearAdminAuthentication();
    setIsAuthenticated(false);
    showToast('Logged Out', 'Admin session ended.', 'info');
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('Are you sure you want to permanently purge all files in Google Drive Trash?')) {
      return;
    }
    setIsEmptyingTrash(true);
    try {
      const res = await fetch('/api/admin-empty-trash', { method: 'POST' });
      if (res.ok) {
        showToast('Trash Cleared', 'Google Drive trash was purged successfully.', 'success');
      } else {
        showToast('Trash Error', 'Failed to empty Google Drive trash.', 'error');
      }
    } catch (err: any) {
      showToast('Error', err?.message || 'Failed to empty Google Drive trash.', 'error');
    } finally {
      setIsEmptyingTrash(false);
    }
  };

  const handleOpenEdit = (file: AdminFileItem) => {
    setEditingFile(file);
    setEditName(file.name);
    setEditAppName(file.appName || file.name.replace(/\.(ipa|apk|aab|zip)$/i, ''));
    setEditBundleId(file.bundleId);
    setEditVersion(file.bundleVersion || '1.0.0');
    setEditBuildNumber(file.buildNumber || '1');
    setEditDescription(file.description || '');

    const isPriv = file.uploadType === 'PRIVATE' || file.folderName === 'Private_BuildDrop_Uploads';
    setEditUploadType(isPriv ? 'PRIVATE' : 'NORMAL');

    setNewImageFile(null);
    setRemoveImage(false);
    setImagePreviewUrl(file.appIcon || null);

    setReplacementBuildFile(null);
    setReplacementProgress(null);

    const diffMs = file.expiresAt - Date.now();
    const days = Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));
    setEditExpiryDays(days.toString());
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewImageFile(file);
      setRemoveImage(false);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleRemoveImage = () => {
    setNewImageFile(null);
    setRemoveImage(true);
    setImagePreviewUrl(null);
  };

  const handleReplacementBuildChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReplacementBuildFile(file);

      // Auto-extract metadata from replacement build
      const parsed = parseAppMetadataFromFilename(file.name);
      setEditName(file.name);
      if (!editAppName || editAppName === editingFile?.appName) setEditAppName(parsed.cleanAppName);
      if (!editVersion || editVersion === editingFile?.bundleVersion) setEditVersion(parsed.version);
      if (!editBuildNumber || editBuildNumber === editingFile?.buildNumber) setEditBuildNumber(parsed.buildNumber);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingFile) return;
    setIsUpdating(true);

    try {
      let targetFileId = editingFile.id;
      let newUploadedIconUrl: string | undefined = undefined;

      // 1. If replacement build file selected: Upload new build file first, then delete old file
      if (replacementBuildFile) {
        setReplacementProgress(10);
        const targetFolderName = editUploadType === 'PRIVATE' ? 'Private_BuildDrop_Uploads' : 'BuildDrop_Uploads';

        const uploader = new ResumableUploader({
          file: replacementBuildFile,
          targetFolder: targetFolderName,
          onProgress: (p) => setReplacementProgress(Math.round(p.progress)),
        });

        const newBuildMeta = await uploader.start();
        
        // Delete old build file from Drive
        await driveApi.consumeTemporaryDownload(editingFile.id).catch(() => {});
        targetFileId = newBuildMeta.id;
      }

      // 2. If new image file selected: Upload new image
      if (newImageFile) {
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(newImageFile);
        });

        // We will pass newIconUrl or let server update
        newUploadedIconUrl = base64Data;
      }

      const days = parseInt(editExpiryDays, 10) || 12;
      const newExpiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

      const res = await fetch('/api/admin-update-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: targetFileId,
          name: editName,
          appName: editAppName,
          bundleId: editBundleId,
          bundleVersion: editVersion,
          buildNumber: editBuildNumber,
          description: editDescription,
          uploadType: editUploadType,
          expiresAt: newExpiresAt,
          removeImage: removeImage,
          newIconUrl: newUploadedIconUrl,
        }),
      });

      if (res.ok) {
        showToast('Updated Successfully', `Updated build details for "${editAppName || editName}".`, 'success');
        setEditingFile(null);
        fetchFiles();
      } else {
        const detail = await res.text();
        showToast('Update Failed', detail || 'Unable to update metadata.', 'error');
      }
    } catch (err: any) {
      showToast('Error', err?.message || 'Failed to update metadata.', 'error');
    } finally {
      setIsUpdating(false);
      setReplacementProgress(null);
    }
  };

  const handleDelete = async (file: AdminFileItem) => {
    if (!window.confirm(`Are you sure you want to delete "${file.name}" permanently from Google Drive?`)) {
      return;
    }

    setDeletingId(file.id);
    try {
      await driveApi.consumeTemporaryDownload(file.id);
      showToast('File Deleted', `"${file.name}" was permanently removed.`, 'success');
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err: any) {
      showToast('Delete Failed', err?.message || 'Unable to delete file.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredFiles = files.filter((f) => {
    const isPriv = f.folderName === 'Private_BuildDrop_Uploads' || f.uploadType === 'PRIVATE';
    if (activeTab === 'public' && isPriv) return false;
    if (activeTab === 'private' && !isPriv) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      f.name.toLowerCase().includes(q) ||
      f.appName.toLowerCase().includes(q) ||
      f.bundleId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Header */}
      <div className="glass-card p-6 rounded-3xl border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/20 shadow-lg flex items-center justify-center text-white shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                Admin Control Dashboard
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                PROTECTED
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Manage public (<code className="text-indigo-300">BuildDrop_Uploads</code>) and private (<code className="text-purple-300">Private_BuildDrop_Uploads</code>) builds.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Private Build</span>
          </button>

          <button
            onClick={handleEmptyTrash}
            disabled={isEmptyingTrash}
            className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Purge Google Drive Trash"
          >
            {isEmptyingTrash ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
            <span className="hidden sm:inline">Empty Trash</span>
          </button>

          <button
            onClick={fetchFiles}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Refresh File List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleLogout}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 border border-slate-700/60 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Logout Admin"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center p-1.5 bg-[#0e121e] border border-slate-800 rounded-2xl w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Files ({files.length})
          </button>

          <button
            onClick={() => setActiveTab('public')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'public' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>BuildDrop_Uploads ({files.filter((f) => f.folderName.includes('BuildDrop_Uploads')).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('private')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'private' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderLock className="w-3.5 h-3.5 text-purple-300" />
            <span>Private_BuildDrop_Uploads ({files.filter((f) => f.folderName === 'Private_BuildDrop_Uploads' || f.uploadType === 'PRIVATE').length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search build, app name, bundle ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#090c13] border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* File List */}
      {isLoading ? (
        <div className="py-20 glass-card rounded-3xl border border-slate-800">
          <LoadingState message="Loading Drive Storage Files..." subMessage="Fetching files across public and private folders" />
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="py-16 glass-card rounded-3xl border border-slate-800 text-center space-y-3">
          <Folder className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">No files found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery ? 'No files match your search filter.' : 'No uploaded files found in Google Drive.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFiles.map((file) => {
            const isPrivate = file.folderName === 'Private_BuildDrop_Uploads' || file.uploadType === 'PRIVATE';
            const cleanAppTitle = file.appName || file.name.replace(/\.(ipa|apk|aab|zip)$/i, '');
            const appInitials = (cleanAppTitle || 'App').split(' ').filter(Boolean).map(w => w[0] || '').join('').slice(0, 4) || 'APP';

            return (
              <div
                key={file.id}
                className="glass-card p-5 sm:p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/30 transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* App Logo & Info */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-14 h-14 rounded-2xl ${isPrivate ? 'bg-purple-950/80 border-purple-500/30' : 'bg-indigo-950/80 border-indigo-500/30'} border shadow-md flex items-center justify-center shrink-0 relative overflow-hidden`}>
                      {file.appIcon ? (
                        <img
                          src={file.appIcon}
                          alt={cleanAppTitle}
                          className="w-full h-full object-contain rounded-2xl relative z-10"
                          onError={(e) => {
                            // Hide broken image link and fall back to monogram
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                      <div className="absolute inset-0 flex flex-col items-center justify-center -z-10">
                        <Smartphone className="w-5 h-5 text-indigo-300 mb-0.5" />
                        <span className="text-[9px] font-bold text-white uppercase">{appInitials}</span>
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white truncate" title={cleanAppTitle}>
                          {cleanAppTitle}
                        </h3>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isPrivate ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'}`}>
                          {isPrivate ? 'PRIVATE (No Expiry)' : 'BuildDrop_Uploads (12 Days)'}
                        </span>

                        {!isPrivate && file.isExpired && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            EXPIRED
                          </span>
                        )}
                      </div>

                      <p className="font-mono text-xs text-slate-400 truncate" title={file.name}>
                        File: {file.name}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-0.5 font-medium">
                        {file.bundleId && (
                          <span className="font-mono text-[11px] text-slate-400" title={file.bundleId}>
                            {file.bundleId}
                          </span>
                        )}
                        <span>Version: <strong className="text-white">{file.bundleVersion || '1.0.0'}</strong></span>
                        <span>Build: <strong className="text-white">{file.buildNumber || '1'}</strong></span>
                        <span>Size: <strong className="text-white">{formatFileSize(file.size)}</strong></span>
                      </div>

                      {file.description && (
                        <p className="text-xs text-slate-400 truncate max-w-md" title={file.description}>
                          {file.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-800">
                    <Link
                      to={`/watch/${encodeFileId(file.id)}`}
                      target="_blank"
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                      <span>View</span>
                    </Link>

                    <button
                      onClick={() => handleOpenEdit(file)}
                      className="px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => handleDelete(file)}
                      disabled={deletingId === file.id}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deletingId === file.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Private Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="max-w-3xl w-full glass-card p-6 sm:p-8 rounded-3xl border border-purple-500/30 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <FolderLock className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-bold text-white">Upload Private Build (No Expiration)</h2>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <VideoUploader
              targetFolder="Private_BuildDrop_Uploads"
              showTargetFolderDropdown={true}
              onUploadComplete={() => {
                fetchFiles();
              }}
            />
          </div>
        </div>
      )}

      {/* Edit Build Modal */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="max-w-xl w-full glass-card p-6 sm:p-8 rounded-3xl border border-indigo-500/30 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Edit Build Details</h2>
              </div>
              <button
                onClick={() => setEditingFile(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Build File Replacement Section */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">Build Package File</span>
                <p className="text-xs font-mono text-slate-400 truncate">
                  Current: <strong className="text-white">{editingFile.name}</strong> ({formatFileSize(editingFile.size)})
                </p>

                <input
                  type="file"
                  ref={replacementFileInputRef}
                  onChange={handleReplacementBuildChange}
                  accept=".ipa,.apk,.aab,.zip,.tar.gz"
                  className="hidden"
                />

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => replacementFileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{replacementBuildFile ? 'Change Replacement Build' : 'Replace Build File'}</span>
                  </button>

                  {replacementBuildFile && (
                    <span className="text-xs font-mono text-emerald-400 truncate">
                      Selected: {replacementBuildFile.name}
                    </span>
                  )}
                </div>

                {replacementProgress !== null && (
                  <div className="space-y-1 pt-2">
                    <div className="flex justify-between text-[11px] text-indigo-300 font-mono">
                      <span>Uploading Replacement Build...</span>
                      <span>{replacementProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${replacementProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {/* App Image Management Section */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <span className="text-xs font-semibold text-slate-300 block">App Icon / Image</span>
                
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-950 border border-indigo-500/30 flex items-center justify-center shrink-0 relative overflow-hidden">
                    {imagePreviewUrl ? (
                      <img src={imagePreviewUrl} alt="App Icon Preview" className="w-full h-full object-cover p-0.5 rounded-2xl" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-500" />
                    )}
                  </div>

                  <div className="space-y-2">
                    <input
                      type="file"
                      ref={imageInputRef}
                      onChange={handleImageFileChange}
                      accept="image/*"
                      className="hidden"
                    />

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Upload className="w-3 h-3 text-indigo-400" />
                        <span>{imagePreviewUrl ? 'Replace Image' : 'Upload Image'}</span>
                      </button>

                      {imagePreviewUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove Image</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload Type Switcher */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Upload Type Policy
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditUploadType('NORMAL')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      editUploadType === 'NORMAL'
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-[#090c13] text-slate-400 border-slate-800'
                    }`}
                  >
                    NORMAL (12-Day Expiry)
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditUploadType('PRIVATE')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      editUploadType === 'PRIVATE'
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-[#090c13] text-slate-400 border-slate-800'
                    }`}
                  >
                    PRIVATE (NEVER Expires)
                  </button>
                </div>
              </div>

              {/* Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    App Title
                  </label>
                  <input
                    type="text"
                    value={editAppName}
                    onChange={(e) => setEditAppName(e.target.value)}
                    placeholder="Zydus Frontline"
                    className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Bundle ID
                  </label>
                  <input
                    type="text"
                    value={editBundleId}
                    onChange={(e) => setEditBundleId(e.target.value)}
                    placeholder="com.zydus.frontline.app"
                    className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Version
                  </label>
                  <input
                    type="text"
                    value={editVersion}
                    onChange={(e) => setEditVersion(e.target.value)}
                    placeholder="1.3.4"
                    className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Build Number
                  </label>
                  <input
                    type="text"
                    value={editBuildNumber}
                    onChange={(e) => setEditBuildNumber(e.target.value)}
                    placeholder="1"
                    className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description <span className="text-slate-500 font-normal">(optional, up to 90 characters)</span>
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value.slice(0, 90))}
                  placeholder="Add a note about this file - what it is, what changed, or anything the recipient should know"
                  rows={4}
                  maxLength={90}
                  className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {editUploadType === 'NORMAL' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Expiration Days (From Today)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={editExpiryDays}
                    onChange={(e) => setEditExpiryDays(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setEditingFile(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleSaveEdit}
                disabled={isUpdating}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
