import React from 'react';
import { Link } from 'react-router-dom';
import {
  UploadCloud,
  HardDrive,
  Shield,
  Zap,
  Clock,
  QrCode,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const features = [
    {
      icon: HardDrive,
      title: 'Direct Cloud Storage',
      desc: 'All files are stored directly in your personal cloud storage. Zero intermediate servers or custom backends.',
    },
    {
      icon: Zap,
      title: '12 GB Resumable Uploads',
      desc: 'Chunked multi-part uploads with pause/resume, speed indicators, network retry, and no JavaScript heap overload.',
    },
    {
      icon: Clock,
      title: '3-Day Ephemeral Lifespan',
      desc: 'Automated 3-day access expiration model with live countdown timers and client-side cleanup garbage collection.',
    },
    {
      icon: QrCode,
      title: 'Instant QR Code Sharing',
      desc: 'One-click QR code generation and direct share links formatted for static Netlify hosting and clean SPA URLs.',
    },
    {
      icon: Shield,
      title: 'Privacy & Security',
      desc: 'No sign-in required for anyone sending or receiving a file - uploads and downloads both run through a locked-down server proxy, never exposing any credentials to the browser.',
    },
  ];

  return (
    <div className="space-y-16 pb-12">
      {/* Hero Section */}
      <section className="relative pt-8 pb-12 sm:pt-16 sm:pb-20 text-center overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-indigo-600/20 via-sky-500/20 to-purple-600/20 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 mb-6 animate-pulse-subtle">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
          Pure Frontend Architecture • High-Speed 12 GB Transfers • Zero Server Storage
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1] max-w-4xl mx-auto">
          Drop Any File & Share It{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-200">
            Privately
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Upload up to 12 GB of any file (APK, ZIP, video, docs, anything) with resumable chunking, generate a shareable QR link, and let it auto-delete after a 3-day window or first download.
        </p>

        {/* CTA Button */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/upload"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white font-bold text-base shadow-xl shadow-indigo-600/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all border border-indigo-400/30"
          >
            <UploadCloud className="w-5 h-5" />
            <span>Upload Files (12 GB)</span>
          </Link>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Engineered for Performance & Privacy
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            A comprehensive overview of BuildDrop frontend capabilities
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div
                key={idx}
                className="glass-panel p-7 rounded-3xl border border-slate-800 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 space-y-4 group bg-slate-900/40"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-indigo-200 transition-colors">{feat.title}</h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
