import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft, Lock, FileText, CheckCircle2 } from 'lucide-react';

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>

      <div className="glass-card p-8 sm:p-12 rounded-3xl border border-slate-800 space-y-8">
        <div className="space-y-3 pb-6 border-b border-slate-800">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold border border-indigo-500/20">
            <Shield className="w-3.5 h-3.5" />
            <span>Legal & Privacy</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Privacy Policy for BuildDrop</h1>
          <p className="text-sm text-slate-400">Last updated: September 6, 2026</p>
        </div>

        <div className="space-y-6 text-sm sm:text-base text-slate-300 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" />
              1. Overview & Architecture
            </h2>
            <p>
              BuildDrop ("we", "our", or "the application") is a file sharing and video streaming platform. BuildDrop does not own, run, or operate any custom backend database or intermediate media server for file content. All uploaded video and file data is stored exclusively in the operator's Google Drive account, via a small server-side proxy that mediates every upload, download, and library listing.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              2. No Account or Sign-In Required
            </h2>
            <p>
              BuildDrop does not require visitors - whether uploading or downloading a file - to sign in with Google or create any account. We collect no visitor profile, email, or Google identity of any kind. Uploads and downloads are handled entirely by a server-side credential that belongs to the site operator, never to the person using the site.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              3. Data Retention & Third-Party Sharing
            </h2>
            <p>
              <strong>We never store, log, track, or share your files, or any personal identifiers, on any external third-party server.</strong> The operator's Google credentials never leave our own server infrastructure and are never sent to, or accessible from, any visitor's browser. Uploaded files are shared "anyone with the link" on Google Drive and are sent solely to and from Google's official Drive API endpoints over HTTPS. Temporary shares are automatically deleted from Drive after download or after their stated expiration window.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              4. Google API Services User Data Policy Compliance
            </h2>
            <p>
              BuildDrop's use and transfer to any other app of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:underline font-semibold"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">5. Contact & Support</h2>
            <p>
              If you have questions regarding this Privacy Policy or wish to request removal of a file, you may email developer support at{' '}
              <a href="mailto:abhishek61010@gmail.com" className="text-indigo-400 hover:underline font-semibold">
                abhikashyap2698@gmail.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
