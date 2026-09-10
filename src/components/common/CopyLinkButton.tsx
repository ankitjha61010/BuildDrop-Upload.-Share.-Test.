import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface CopyLinkButtonProps {
  url: string;
  className?: string;
  variant?: 'button' | 'icon' | 'compact';
  label?: string;
}

export const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({
  url,
  className = '',
  variant = 'button',
  label = 'Copy Link',
}) => {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        success = true;
      } else {
        // Fallback for non-secure contexts or older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch {
      success = false;
    }

    if (success) {
      setCopied(true);
      showToast('Link copied successfully.', url, 'success', 3000);
      setTimeout(() => setCopied(false), 2500);
    } else {
      showToast('Copy Failed', 'Please copy the URL manually from your browser address bar.', 'error');
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy Watch Link'}
        className={`p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-all ${className}`}
        aria-label="Copy Watch Link"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={handleCopy}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
          copied
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
        } ${className}`}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{copied ? 'Copied' : label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-md ${
        copied
          ? 'bg-emerald-600 text-white shadow-emerald-600/20'
          : 'bg-slate-800 hover:bg-slate-700 text-slate-100 hover:text-white border border-slate-700 hover:border-slate-600 shadow-slate-900/40'
      } ${className}`}
    >
      {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
      <span>{copied ? 'Link Copied!' : label}</span>
    </button>
  );
};
