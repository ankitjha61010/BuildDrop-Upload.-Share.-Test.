import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  subMessage,
  size = 'md',
}) => {
  const spinnerSizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center animate-fadeIn">
      <div className="relative mb-4">
        <div className="absolute -inset-2 bg-indigo-500/20 rounded-full blur-xl animate-pulse"></div>
        <Loader2 className={`${spinnerSizes[size]} text-indigo-500 animate-spin relative`} />
      </div>
      <h3 className="text-lg font-semibold text-slate-200">{message}</h3>
      {subMessage && <p className="text-sm text-slate-400 mt-1 max-w-sm">{subMessage}</p>}
    </div>
  );
};
