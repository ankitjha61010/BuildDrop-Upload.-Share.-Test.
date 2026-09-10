import { driveApi, fetchJson } from './driveApi';
import { UploadProgressInfo, VideoMetadata, UploadStatus } from '../types';
import { TransferSpeedTracker } from '../utils/transferSpeed';

export const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024 * 1024; // 12 GB exactly
export const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunk size for high performance large file upload
export const EXPIRATION_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 Days (72 hours) in milliseconds

export interface ResumableUploadOptions {
  file: File;
  onProgress?: (progress: UploadProgressInfo) => void;
}

export class ResumableUploader {
  private file: File;
  private onProgress?: (progress: UploadProgressInfo) => void;
  private uploadUrl: string | null = null;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private currentByte: number = 0;
  private speedTracker: TransferSpeedTracker = new TransferSpeedTracker();
  private currentXHR: XMLHttpRequest | null = null;

  constructor(options: ResumableUploadOptions) {
    this.file = options.file;
    this.onProgress = options.onProgress;
  }

  public validateFile(): { valid: boolean; error?: string } {
    if (!this.file) {
      return { valid: false, error: 'No file selected.' };
    }

    if (this.file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Maximum file size is 12 GB. Your file is ${(this.file.size / (1024 * 1024 * 1024)).toFixed(2)} GB.`,
      };
    }

    // Allow ANY file type (APK, ZIP, video, documents, etc.)
    return { valid: true };
  }

  public async start(): Promise<VideoMetadata> {
    const validation = this.validateFile();
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    this.isCancelled = false;
    this.isPaused = false;
    this.notifyProgress('preparing', 0, 0, 0, 0);

    // Step 1: Ask our server to open a resumable session with Drive using the site owner's own
    // credentials - the person uploading never needs a Google account of their own. The session
    // URL it hands back is itself the authorization for the chunk PUTs that follow, so the file
    // bytes go straight from this browser to Drive without passing through our server.
    const { uploadUrl } = await fetchJson<{ uploadUrl?: string }>(
      '/api/init-upload',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: this.file.name,
          mimeType: this.file.type || 'application/octet-stream',
          fileSize: this.file.size,
        }),
      },
      'Starting the upload'
    );
    if (!uploadUrl) {
      throw new Error('Server did not return a valid resumable upload URL.');
    }

    this.uploadUrl = uploadUrl;
    this.currentByte = 0;
    this.speedTracker.reset(0);

    return await this.uploadNextChunks();
  }

  private async uploadNextChunks(): Promise<VideoMetadata> {
    while (this.currentByte < this.file.size) {
      if (this.isCancelled) {
        this.notifyProgress('cancelled', 0, this.currentByte, 0, 0);
        throw new Error('Upload was cancelled.');
      }

      if (this.isPaused) {
        this.notifyProgress('paused', this.calculatePercent(), this.currentByte, 0, 0);
        // Wait until resumed
        return new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            if (this.isCancelled) {
              clearInterval(checkInterval);
              reject(new Error('Upload was cancelled.'));
            } else if (!this.isPaused) {
              clearInterval(checkInterval);
              this.uploadNextChunks().then(resolve).catch(reject);
            }
          }, 300);
        });
      }

      const chunkStart = this.currentByte;
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, this.file.size);
      // Slicing blob without loading entire file to heap memory
      const chunk = this.file.slice(chunkStart, chunkEnd);

      let chunkUploaded = false;
      let retries = 0;
      const maxRetries = 5;

      while (!chunkUploaded && retries < maxRetries) {
        if (this.isCancelled || this.isPaused) break;
        try {
          const result = await this.sendChunkWithXHR(chunk, chunkStart, chunkEnd);

          if (result.status === 308) {
            // Resume Incomplete - proceed to next chunk
            this.currentByte = chunkEnd;
            this.updateMetrics(this.currentByte);
            chunkUploaded = true;
          } else if (result.status === 200 || result.status === 201) {
            // Completed!
            const fileData = JSON.parse(result.response);
            this.currentByte = this.file.size;
            this.notifyProgress('completed', 100, this.file.size, 0, 0, undefined, fileData.id);

            // Set public sharing link permission (server-side, using the owner's own credentials)
            // so the recipient can watch/download without signing in themselves.
            await fetchJson(
              '/api/finalize-upload',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: fileData.id }),
              },
              'Making the upload shareable'
            );

            const videoMeta: VideoMetadata = {
              id: fileData.id,
              driveFileId: fileData.id,
              name: fileData.name,
              originalFileName: this.file.name,
              size: this.file.size,
              mimeType: fileData.mimeType,
              createdAt: parseInt(fileData.properties?.vidsetu_created_at || fileData.appProperties?.vidsetu_created_at || Date.now().toString(), 10),
              expiresAt: parseInt(fileData.properties?.vidsetu_expires_at || fileData.appProperties?.vidsetu_expires_at || (Date.now() + EXPIRATION_DURATION_MS).toString(), 10),
              isExpired: false,
              thumbnailLink: fileData.thumbnailLink,
              webContentLink: fileData.webContentLink,
              webViewLink: fileData.webViewLink,
              driveFolderId: fileData.parents?.[0],
            };

            driveApi.cacheVideoMetadata(videoMeta);
            return videoMeta;
          } else {
            throw new Error(`Unexpected server response during chunk upload: HTTP ${result.status}`);
          }
        } catch (err: any) {
          retries++;
          if (retries >= maxRetries) {
            this.notifyProgress('failed', this.calculatePercent(), this.currentByte, 0, 0, err.message);
            throw err;
          }
          // Exponential backoff
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, retries), 8000)));
          // Query Drive for last confirmed received offset
          await this.queryUploadedStatus();
        }
      }
    }

    throw new Error('Upload loop completed without receiving final Google Drive file record.');
  }

  private sendChunkWithXHR(
    chunk: Blob,
    start: number,
    end: number
  ): Promise<{ status: number; response: string }> {
    return new Promise((resolve, reject) => {
      if (!this.uploadUrl) return reject(new Error('Missing resumable upload URL'));

      const xhr = new XMLHttpRequest();
      this.currentXHR = xhr;

      xhr.open('PUT', this.uploadUrl, true);
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${this.file.size}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const currentLoaded = start + e.loaded;
          this.updateMetrics(currentLoaded);
        }
      };

      xhr.onload = () => {
        this.currentXHR = null;
        resolve({ status: xhr.status, response: xhr.responseText });
      };

      xhr.onerror = () => {
        this.currentXHR = null;
        reject(new Error('Network connectivity issue while transmitting chunk. Retrying...'));
      };

      xhr.onabort = () => {
        this.currentXHR = null;
        reject(new Error('Chunk request aborted.'));
      };

      xhr.send(chunk);
    });
  }

  private async queryUploadedStatus(): Promise<number> {
    if (!this.uploadUrl) return 0;
    try {
      const res = await fetch(this.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes */${this.file.size}`,
        },
      });

      if (res.status === 308) {
        const range = res.headers.get('Range');
        if (range) {
          const match = range.match(/bytes=0-(\d+)/);
          if (match && match[1]) {
            this.currentByte = parseInt(match[1], 10) + 1;
            return this.currentByte;
          }
        }
      }
    } catch {
      // Ignored, proceed with existing byte offset
    }
    return this.currentByte;
  }

  private updateMetrics(currentLoaded: number) {
    const { percent, speed, etaSeconds } = this.speedTracker.update(currentLoaded, this.file.size);
    this.notifyProgress('uploading', percent, currentLoaded, speed, etaSeconds);
  }

  private calculatePercent(): number {
    return Math.min(100, Math.round((this.currentByte / this.file.size) * 100));
  }

  private notifyProgress(
    status: UploadStatus,
    progress: number,
    uploadedBytes: number,
    speed: number,
    estimatedSecondsLeft: number,
    error?: string,
    uploadedFileId?: string
  ) {
    if (this.onProgress) {
      this.onProgress({
        status,
        progress,
        uploadedBytes,
        totalBytes: this.file.size,
        speed,
        estimatedSecondsLeft,
        error,
        uploadedFileId,
      });
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.currentXHR) {
      this.currentXHR.abort();
      this.currentXHR = null;
    }
    this.notifyProgress('paused', this.calculatePercent(), this.currentByte, 0, 0);
  }

  public resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.speedTracker.reset(this.currentByte);
    this.notifyProgress('uploading', this.calculatePercent(), this.currentByte, 0, 0);
  }

  public cancel(): void {
    this.isCancelled = true;
    this.isPaused = false;
    if (this.currentXHR) {
      this.currentXHR.abort();
      this.currentXHR = null;
    }
    if (this.uploadUrl) {
      fetch(this.uploadUrl, { method: 'DELETE' }).catch(() => {});
    }
    this.notifyProgress('cancelled', 0, 0, 0, 0);
  }
}
