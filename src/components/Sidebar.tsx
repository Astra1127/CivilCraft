import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Trophy,
  Receipt,
  BarChart3,
  MessageSquare,
  UserCircle,
  LogOut,
  Shield,
  Settings,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../utils/cn';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const adminMenu = [
  { id: 'dashboard', label: 'Administration HQ', icon: Shield },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'sections', label: 'Sections', icon: FolderKanban },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  { id: 'analytics', label: 'Global Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const studentMenu = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-section', label: 'My Section', icon: FolderKanban },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
];

const professorMenu = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sections', label: 'Sections', icon: FolderKanban },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
];

export default function Sidebar({
  activePage,
  onNavigate,
  onLogout,
  isMobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const handleLogout = () => { logout(); onLogout?.(); };

  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const menu = isSuperAdmin ? adminMenu : user?.role === 'professor' ? professorMenu : studentMenu;

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 h-dvh bg-earth-900 border-r border-earth-300/10 flex flex-col overflow-hidden transition-transform duration-300 lg:static lg:h-auto lg:translate-x-0',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Subtle grid overlay on sidebar */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(201,169,110,1) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,110,1) 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Logo Section */}
      <div className="relative z-10 px-5 pt-6 pb-5 border-b border-earth-300/15">
        <button
          type="button"
          aria-label="Close menu"
          onClick={onCloseMobile}
          className="absolute right-4 top-4 p-1 rounded text-earth-300/70 hover:text-earth-200 hover:bg-white/5 lg:hidden"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="CivilCraft Logo" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-white font-bold text-base tracking-tight leading-tight">CivilCraft</h1>
            <p className="text-earth-300/60 text-[11px] font-mono tracking-wider uppercase">Engineering Hub</p>
          </div>
        </div>
        {/* Role badge under logo */}
        {user && (
          <div className={`mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-mono tracking-widest uppercase font-bold
            ${isSuperAdmin
              ? 'bg-[#0B3C5D]/30 border-draft-500/25 text-draft-300'
              : user.role === 'professor'
              ? 'bg-earth-500/15 border-earth-300/20 text-earth-300'
              : 'bg-cyber-green/10 border-cyber-green/20 text-cyber-green'}`}>
            <div className="w-1.5 h-1.5 rounded-full bg-current" />
            {isSuperAdmin ? 'Super Admin' : user.role === 'professor' ? 'Professor' : 'Student'}
          </div>
        )}
        {/* Blueprint corner accents */}
        <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-earth-300/20" />
        <div className="absolute bottom-0 left-2 w-3 h-3 border-b border-l border-earth-300/20" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex-1 px-3 py-4 space-y-1">
        {menu.map((item) => {
          const isActive = activePage === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group relative
                ${isActive
                  ? 'bg-earth-500/20 text-earth-300 border border-earth-300/25'
                  : 'text-steel-400 hover:text-earth-200 hover:bg-white/5 border border-transparent'
                }`}
            >
              <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-earth-300' : 'text-steel-500 group-hover:text-earth-300/70'}`} />
              <span className="tracking-wide">{item.label}</span>
              {isActive && (
                <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-earth-300 shadow-[0_0_6px_rgba(201,169,110,0.6)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="relative z-10 px-3 pb-3 space-y-1 border-t border-earth-300/10 pt-3">
        <button
          onClick={() => onNavigate('profile')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group border
            ${activePage === 'profile'
              ? 'bg-earth-500/20 text-earth-300 border-earth-300/25'
              : 'text-steel-400 hover:text-earth-200 hover:bg-white/5 border-transparent'
            }`}
        >
          <UserCircle className="w-[18px] h-[18px]" />
          <span className="tracking-wide">Profile</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-steel-500 hover:text-danger-red hover:bg-danger-red/5 transition-all duration-200 border border-transparent"
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span className="tracking-wide">Logout</span>
        </button>
      </div>

      {/* Footer */}
      <div className="relative z-10 px-5 py-3 border-t border-earth-300/10">
        <p className="text-earth-300/30 text-[10px] font-mono text-center tracking-widest">© 2026 CIVILCRAFT</p>
      </div>
    </aside>
  );
}
