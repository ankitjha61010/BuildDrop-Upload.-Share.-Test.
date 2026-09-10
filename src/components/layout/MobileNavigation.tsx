import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UploadCloud, Home } from 'lucide-react';

export const MobileNavigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Upload', path: '/upload', icon: UploadCloud, highlight: true },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#0a0e17]/95 border-t border-slate-800 backdrop-blur-xl px-4 py-2">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          if (item.highlight) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center -mt-5"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-sky-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 transform active:scale-95 transition-transform border-2 border-[#0a0e17]">
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-semibold text-indigo-400 mt-1">Upload</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center py-1 px-3 rounded-xl transition-colors ${
                isActive ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium mt-1">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
