// Helper module for encrypting/obfuscating file IDs in public Watch URLs.
// This prevents exposing raw internal Google Drive file IDs in public links.

const SECRET_KEY = 'BuildDropShareKey2026';

/**
 * Encrypts/obfuscates a Google Drive file ID into a URL-safe secure token.
 * E.g., '1Cr_Bq_WhPOz8ZxohmW7uy7uDFP29XZOy' -> 'bd_a1b2c3d4...'
 */
export function encodeFileId(fileId: string): string {
  if (!fileId) return '';
  if (fileId.startsWith('bd_')) return fileId;

  try {
    let xorStr = '';
    for (let i = 0; i < fileId.length; i++) {
      const charCode = fileId.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
      xorStr += String.fromCharCode(charCode);
    }
    const base64 = btoa(xorStr)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `bd_${base64}`;
  } catch {
    return fileId;
  }
}

/**
 * Decrypts a secure token back into the original Google Drive file ID.
 * Supports legacy unencrypted file IDs as fallback.
 */
export function decodeFileId(token: string): string {
  if (!token) return '';
  if (!token.startsWith('bd_')) return token;

  try {
    const rawToken = token.slice(3);
    let base64 = rawToken.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const xorStr = atob(base64);
    let fileId = '';
    for (let i = 0; i < xorStr.length; i++) {
      const charCode = xorStr.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
      fileId += String.fromCharCode(charCode);
    }
    return fileId;
  } catch {
    return token;
  }
}
