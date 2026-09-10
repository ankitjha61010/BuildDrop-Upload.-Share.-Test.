export interface GoogleUser {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

export interface VideoMetadata {
  id: string; // Internal app/watch ID or Drive File ID
  driveFileId: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: number; // timestamp in ms
  expiresAt: number; // timestamp in ms (createdAt + 5 hours)
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  isExpired?: boolean;
  driveFolderId?: string;
  originalFileName: string;
  duration?: number;
}

export type UploadStatus = 
  | 'idle' 
  | 'preparing' 
  | 'uploading' 
  | 'paused' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export interface UploadProgressInfo {
  status: UploadStatus;
  progress: number; // 0 to 100
  uploadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  estimatedSecondsLeft: number;
  error?: string;
  uploadedFileId?: string;
  uploadedVideoMeta?: VideoMetadata;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export type ZoomLevel = 1 | 1.25 | 1.5 | 2 | 2.5;
