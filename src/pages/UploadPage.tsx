import React from 'react';
import { VideoUploader } from '../components/upload/VideoUploader';

export const UploadPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="text-center max-w-xl mx-auto mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Upload & Share Files
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-2">
          Upload up to 12 GB files with resumable chunking. Files automatically expire 5 hours after completion.
        </p>
      </div>

      <VideoUploader />
    </div>
  );
};
