import { Bell, Menu, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onMenuToggle?: () => void;
}

export default function TopBar({ title, subtitle, onMenuToggle }: TopBarProps) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  return (
    <header className="h-16 bg-white/80 backdrop-blur-sm border-b border-earth-200/50 flex items-center justify-between px-4 sm:px-6 relative">
      {/* Measurement line accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-earth-300/30 to-transparent" />

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenuToggle}
          className="p-2 rounded-lg text-steel-400 hover:text-earth-700 hover:bg-earth-50 transition-colors lg:hidden"
        >
          <Menu className="w-[18px] h-[18px]" />
        </button>
        <div>
          <h2 className="text-base sm:text-xl font-bold text-earth-800 tracking-tight">{title}</h2>
          {subtitle && (
            <p className="hidden sm:block text-xs text-steel-400 font-mono tracking-wider uppercase">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Search */}
        <button className="hidden sm:inline-flex p-2 rounded-lg text-steel-400 hover:text-earth-700 hover:bg-earth-50 transition-colors">
          <Search className="w-[18px] h-[18px]" />
        </button>

        {/* Notifications */}
        <button className="p-2 rounded-lg text-steel-400 hover:text-earth-700 hover:bg-earth-50 transition-colors relative">
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-earth-500 rounded-full border border-white" />
        </button>

        {/* Divider */}
        <div className="hidden sm:block w-px h-8 bg-earth-200/50" />

        {/* User Avatar */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-earth-700 to-earth-500 flex items-center justify-center border border-earth-400/30">
            <span className="text-white text-xs font-bold font-mono">{user?.initials}</span>
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-semibold text-earth-800 leading-tight">{user?.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold tracking-wider
                ${isSuperAdmin
                  ? 'bg-[#0B3C5D]/10 text-[#0B3C5D] border-[#0B3C5D]/20'
                  : user?.role === 'professor'
                  ? 'bg-earth-100 text-earth-700 border-earth-300/40'
                  : 'bg-emerald-50 text-cyber-green border-cyber-green/20'}`}>
                {isSuperAdmin ? 'Super Admin' : user?.role === 'professor' ? 'Professor' : 'Student'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
