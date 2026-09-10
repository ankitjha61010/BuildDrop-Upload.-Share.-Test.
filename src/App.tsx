import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/common/Toast';
import { Header } from './components/layout/Header';
import { MobileNavigation } from './components/layout/MobileNavigation';
import { HomePage } from './pages/HomePage';
import { UploadPage } from './pages/UploadPage';
import { WatchPage } from './pages/WatchPage';
import { NotFoundPage } from './pages/NotFoundPage';

import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsPage } from './pages/TermsPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="min-h-screen flex flex-col bg-[#0a0e17] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
          {/* Global Header */}
          <Header />

          {/* Main App Page Content */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24 md:pb-8">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/watch/:videoId" element={<WatchPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/404" element={<NotFoundPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>

          {/* Footer with Privacy Policy and Terms Links */}
          <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-500">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-slate-400">
              <p>
                BuildDrop • Powered by <span className="text-indigo-400 font-semibold">Abhishek Kashyap</span>
              </p>
              <div className="flex items-center gap-3 text-slate-400">
                <Link to="/privacy-policy" className="hover:text-indigo-400 transition-colors">Privacy Policy</Link>
                <span>•</span>
                <Link to="/terms" className="hover:text-indigo-400 transition-colors">Terms of Service</Link>
              </div>
            </div>
          </footer>

          {/* Mobile Bottom Navigation */}
          <MobileNavigation />

          {/* Global Floating Toast Notifications */}
          <ToastContainer />
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
