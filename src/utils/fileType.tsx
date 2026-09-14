import React from 'react';
import {
  FileVideo,
  FileImage,
  FileAudio,
  FileCode,
  FileArchive,
  FileText,
  File as FileIcon,
} from 'lucide-react';

export type FileCategory = 'video' | 'image' | 'audio' | 'apk' | 'archive' | 'document' | 'other';

const VIDEO_EXT = /\.(mp4|mkv|webm|mov|avi|m4v|3gp|wmv|flv|ts|mpg|mpeg)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif)$/i;
const AUDIO_EXT = /\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i;
// APK/AAB are Android app packages, IPA is the iOS equivalent - grouped together as "app package"
const APK_EXT = /\.(apk|aab|ipa)$/i;
const IPA_ONLY_EXT = /\.ipa$/i;
const ANDROID_PACKAGE_EXT = /\.(apk|aab)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|bz2)$/i;
const DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf)$/i;

export function getFileCategory(fileName: string, mimeType?: string): FileCategory {
  const name = (fileName || '').toLowerCase().trim();
  const mime = (mimeType || '').toLowerCase().trim();

  if (mime.startsWith('video/') || VIDEO_EXT.test(name)) return 'video';
  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (mime.startsWith('audio/') || AUDIO_EXT.test(name)) return 'audio';
  if (APK_EXT.test(name) || mime.includes('android.package-archive')) return 'apk';
  if (ARCHIVE_EXT.test(name) || mime.includes('zip') || mime.includes('compressed')) return 'archive';
  if (
    DOCUMENT_EXT.test(name) ||
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('presentation') ||
    mime.includes('spreadsheet')
  ) {
    return 'document';
  }
  return 'other';
}

export function isVideoFile(fileName: string, mimeType?: string): boolean {
  return getFileCategory(fileName, mimeType) === 'video';
}

export function isImageFile(fileName: string, mimeType?: string): boolean {
  return getFileCategory(fileName, mimeType) === 'image';
}

// Split out from the broader "apk" category above for install-flow branching - a .ipa needs iOS's
// itms-services OTA install, while a .apk/.aab is an Android-only package that can never install
// on iOS at all, no matter what UI is built around it.
export function isIpaFile(fileName: string): boolean {
  return IPA_ONLY_EXT.test((fileName || '').toLowerCase().trim());
}

export function isAndroidPackageFile(fileName: string): boolean {
  return ANDROID_PACKAGE_EXT.test((fileName || '').toLowerCase().trim());
}

interface CategoryMeta {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bg: string;
  border: string;
}

const CATEGORY_META: Record<FileCategory, CategoryMeta> = {
  video: { label: 'Video', Icon: FileVideo, iconColor: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
  image: { label: 'Image', Icon: FileImage, iconColor: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/30' },
  audio: { label: 'Audio', Icon: FileAudio, iconColor: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  apk: { label: 'App Package (APK/AAB/IPA)', Icon: FileCode, iconColor: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  archive: { label: 'Archive', Icon: FileArchive, iconColor: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  document: { label: 'Document', Icon: FileText, iconColor: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  other: { label: 'File', Icon: FileIcon, iconColor: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
};

export function getFileTypeMeta(fileName: string, mimeType?: string): CategoryMeta & { category: FileCategory } {
  const category = getFileCategory(fileName, mimeType);
  return { category, ...CATEGORY_META[category] };
}

export const FileTypeIcon: React.FC<{ fileName: string; mimeType?: string; className?: string }> = ({
  fileName,
  mimeType,
  className = 'w-10 h-10',
}) => {
  const { Icon, iconColor } = getFileTypeMeta(fileName, mimeType);
  return <Icon className={`${className} ${iconColor}`} />;
};

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function parseAppMetadataFromFilename(fileName: string): {
  cleanAppName: string;
  version: string;
  buildNumber: string;
} {
  const baseName = (fileName || '').replace(/\.(ipa|apk|aab|zip|tar\.gz)$/i, '');

  // Look for version pattern like 1.3.4, v1.3.4, 1.2, 2.0.1
  const versionMatch = baseName.match(/(?:[._-]v?|v)(\d+\.\d+(?:\.\d+)?)/i) || baseName.match(/(\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : '1.0.0';

  // Look for build number pattern like -b1, _b12, build1, #1
  const buildMatch = baseName.match(/(?:build|b|#)[._-]?(\d+)/i);
  const buildNumber = buildMatch ? buildMatch[1] : '1';

  // Clean up app name by inserting spaces into camelCase/PascalCase (e.g. ZydusFrontlineApp -> Zydus Frontline App)
  let cleanAppName = baseName
    .replace(/(?:[._-]v?|v)\d+\.\d+(?:\.\d+)?/gi, '')
    .replace(/(?:build|b|#)[._-]?\d+/gi, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  cleanAppName = cleanAppName.replace(/([a-z])([A-Z])/g, '$1 $2').trim();

  return {
    cleanAppName: cleanAppName || baseName,
    version,
    buildNumber,
  };
}
