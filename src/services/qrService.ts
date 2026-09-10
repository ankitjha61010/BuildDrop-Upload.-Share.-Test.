import QRCode from 'qrcode';

export class QRService {
  /**
   * Generates public Watch URL without exposing any OAuth tokens or private credentials
   */
  public getWatchUrl(videoId: string): string {
    const origin = window.location.origin;
    return `${origin}/watch/${encodeURIComponent(videoId)}`;
  }

  /**
   * Generates a Data URL QR Code image
   */
  public async generateQRDataUrl(url: string): Promise<string> {
    try {
      return await QRCode.toDataURL(url, {
        width: 380,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });
    } catch (err) {
      console.error('Failed to generate QR code data URL', err);
      throw err;
    }
  }

  /**
   * Triggers browser download for generated QR code image
   */
  public downloadQRImage(dataUrl: string, filename: string = 'vidsetu-watch-qr.png'): void {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export const qrService = new QRService();
