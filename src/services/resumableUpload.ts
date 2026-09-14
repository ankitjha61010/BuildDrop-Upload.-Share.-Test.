import { driveApi, fetchJson } from './driveApi';
import { UploadProgressInfo, VideoMetadata, UploadStatus } from '../types';
import { TransferSpeedTracker } from '../utils/transferSpeed';
import { getOrCreateUserId } from '../utils/userId';

export const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024 * 1024; // 12 GB exactly
export const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunk size for high performance large file upload
export const EXPIRATION_DURATION_MS = 12 * 24 * 60 * 60 * 1000; // 12 Days (288 hours) in milliseconds

export interface ResumableUploadOptions {
  file: File;
  onProgress?: (progress: UploadProgressInfo) => void;
  targetFolder?: string;
}

export class ResumableUploader {
  private file: File;
  private onProgress?: (progress: UploadProgressInfo) => void;
  private targetFolder?: string;
  private uploadUrl: string | null = null;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private currentByte: number = 0;
  private speedTracker: TransferSpeedTracker = new TransferSpeedTracker();
  private currentXHR: XMLHttpRequest | null = null;

  private extractedMeta: { appName?: string; bundleId?: string; bundleVersion?: string; buildNumber?: string; appIcon?: string } = {};

  constructor(options: ResumableUploadOptions) {
    this.file = options.file;
    this.onProgress = options.onProgress;
    this.targetFolder = options.targetFolder;
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

    // Extract app logo, name, bundleId, version, buildNumber client-side
    if (/\.(ipa|apk)$/i.test(this.file.name)) {
      try {
        const parserModule = await import('app-info-parser/dist/app-info-parser.js');
        const AppInfoParserModule = parserModule.default || (parserModule as any).AppInfoParser || (window as any).AppInfoParser;
        if (AppInfoParserModule) {
          const parser = new AppInfoParserModule(this.file);
          const info: any = await parser.parse();

        let rawAppName = info.CFBundleDisplayName || info.CFBundleName || info.application?.label;
        if (Array.isArray(rawAppName)) rawAppName = rawAppName[0];
        if (typeof rawAppName === 'object' && rawAppName) rawAppName = rawAppName.value || rawAppName[0];

        const bundleId = info.CFBundleIdentifier || info.package;
        const bundleVersion = info.CFBundleShortVersionString || info.versionName || info.CFBundleVersion;
        const buildNumber = info.CFBundleVersion || (info.versionCode ? info.versionCode.toString() : undefined);
        
        let appIconData: string | undefined = undefined;

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

          this.extractedMeta = {
            appName: typeof rawAppName === 'string' ? rawAppName : undefined,
            bundleId,
            bundleVersion,
            buildNumber,
            appIcon: appIconData,
          };
        }
      } catch (err) {
        console.warn('Browser app info extraction info:', err);
      }
    }

    const userId = getOrCreateUserId();

    // Step 1: Ask our server to open a resumable session with Drive using the site owner's own credentials
    const { uploadUrl } = await fetchJson<{ uploadUrl?: string }>(
      '/api/init-upload',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: this.file.name,
          mimeType: this.file.type || 'application/octet-stream',
          fileSize: this.file.size,
          appName: this.extractedMeta.appName,
          bundleId: this.extractedMeta.bundleId,
          bundleVersion: this.extractedMeta.bundleVersion,
          buildNumber: this.extractedMeta.buildNumber,
          appIcon: this.extractedMeta.appIcon,
          targetFolder: this.targetFolder,
          userId,
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
      const isFinalChunk = chunkEnd === this.file.size;

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
            return await this.completeUpload(JSON.parse(result.response));
          } else {
            throw new Error(`Unexpected server response during chunk upload: HTTP ${result.status}`);
          }
        } catch (err: any) {
          if (isFinalChunk) {
            try {
              const fileData = await fetchJson<any>(
                '/api/complete-upload',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ uploadUrl: this.uploadUrl, fileSize: this.file.size }),
                },
                'Confirming the upload'
              );
              return await this.completeUpload(fileData);
            } catch {
              // Not confirmed complete yet
            }
          }

          retries++;
          if (retries >= maxRetries) {
            this.notifyProgress('failed', this.calculatePercent(), this.currentByte, 0, 0, err.message);
            throw err;
          }
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, retries), 8000)));
          await this.queryUploadedStatus();
        }
      }
    }

    throw new Error('Upload loop completed without receiving final Google Drive file record.');
  }

  // Shared by both happy path and CORS recovery path
  private async completeUpload(fileData: any): Promise<VideoMetadata> {
    this.currentByte = this.file.size;
    this.notifyProgress('completed', 100, this.file.size, 0, 0, undefined, fileData.id);

    await fetchJson(
      '/api/finalize-upload',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: fileData.id }),
      },
      'Making the upload shareable'
    );

    let extractedIconUrl: string | undefined = undefined;
    if (/\.(ipa|apk)$/i.test(this.file.name)) {
      try {
        const extractRes = await fetchJson<any>(
          '/api/extract-ipa-metadata',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: fileData.id }),
          },
          'Extracting app metadata'
        );
        if (extractRes?.appIconUrl) {
          extractedIconUrl = extractRes.appIconUrl;
        }
      } catch (err) {
        console.warn('IPA/APK metadata extraction warning:', err);
      }
    }

    const appProps = { ...fileData.appProperties, ...fileData.properties };

    const rawIcon = extractedIconUrl || appProps.builddrop_app_icon || this.extractedMeta.appIcon;
    let finalIcon = rawIcon;
    if (finalIcon && finalIcon.includes('id=')) {
      const iconId = finalIcon.split('id=')[1]?.split('&')[0];
      if (iconId) {
        finalIcon = `/api/download-file?id=${iconId}&inline=1`;
      }
    }

    const videoMeta: VideoMetadata = {
      id: fileData.id,
      driveFileId: fileData.id,
      name: fileData.name,
      originalFileName: this.file.name,
      size: this.file.size,
      mimeType: fileData.mimeType,
      createdAt: parseInt(appProps.vidsetu_created_at || Date.now().toString(), 10),
      expiresAt: parseInt(appProps.vidsetu_expires_at || (Date.now() + EXPIRATION_DURATION_MS).toString(), 10),
      isExpired: false,
      thumbnailLink: fileData.thumbnailLink,
      webContentLink: fileData.webContentLink,
      webViewLink: fileData.webViewLink,
      driveFolderId: fileData.parents?.[0],
      appName: appProps.builddrop_app_name || this.extractedMeta.appName,
      bundleId: appProps.builddrop_bundle_id || this.extractedMeta.bundleId,
      bundleVersion: appProps.builddrop_bundle_version || this.extractedMeta.bundleVersion,
      buildNumber: appProps.builddrop_build_number || this.extractedMeta.buildNumber || '1',
      appIcon: finalIcon,
    };

    driveApi.cacheVideoMetadata(videoMeta);
    return videoMeta;
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
