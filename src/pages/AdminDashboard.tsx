import {
  Users,
  FolderOpen,
  ChevronRight,
  BarChart3,
  Settings,
  Shield,
  Activity,
  CheckCircle2,
  Clock,
  TrendingUp,
  Database,
  Wifi,
  HardDrive,
} from 'lucide-react';
import BlueprintCard from '../components/BlueprintCard';

/* ─── Data ─────────────────────────────────────────────── */

const statCards = [
  {
    label: 'Total Engineers',
    value: '0',
    trend: '+12% from last month',
    trendDir: 'up',
    icon: Users,
    iconBg: 'bg-earth-800',
    iconColor: 'text-earth-300',
    dark: true,
  },
  {
    label: 'Active Crew',
    value: '0',
    trend: '+8% from last month',
    trendDir: 'up',
    icon: Users,
    iconBg: 'bg-emerald-700',
    iconColor: 'text-white',
    dark: false,
  },
  {
    label: 'Active Sites',
    value: '0',
    trend: '+5% from last month',
    trendDir: 'up',
    icon: FolderOpen,
    iconBg: 'bg-[#0B3C5D]',
    iconColor: 'text-draft-300',
    dark: false,
  },
  {
    label: 'Foremen',
    value: '0',
    trend: '+3 new this month',
    trendDir: 'up',
    icon: Shield,
    iconBg: 'bg-warning-orange',
    iconColor: 'text-white',
    dark: false,
  },
];

const systemLog = [
  { id: '1', event: 'New user registered', detail: 'Emma Johnson joined as Student', time: '3 min ago', type: 'info' },
  { id: '2', event: 'Section created', detail: 'CE-303 Fluid Mechanics created by Prof. Lee', time: '15 min ago', type: 'success' },
  { id: '3', event: 'Bulk upload completed', detail: '24 students imported to CE-101', time: '32 min ago', type: 'success' },
  { id: '4', event: 'Login attempt failed', detail: 'Unknown user tried admin access', time: '1 hr ago', type: 'warning' },
  { id: '5', event: 'Score submitted', detail: 'Emily Davis — Suspension Bridge — 95.2', time: '1.5 hr ago', type: 'info' },
  { id: '6', event: 'System backup', detail: 'Database backup completed successfully', time: '2 hr ago', type: 'success' },
];

const systemHealth = [
  { label: 'Server Status', status: 'OPERATIONAL', color: 'bg-cyber-green', pct: 100 },
  { label: 'Database', status: 'HEALTHY', color: 'bg-cyber-green', pct: 98 },
  { label: 'API Response', status: 'OPTIMAL', color: 'bg-cyber-green', pct: 95 },
];

const quickStats = [
  { label: 'Submissions Today', value: '47', icon: CheckCircle2 },
  { label: 'Avg Response Time', value: '1.2s', icon: Wifi },
  { label: 'Storage Used', value: '34%', icon: HardDrive },
  { label: 'Active Sessions', value: '12', icon: Activity },
];

interface Props { onNavigate: (page: string) => void; }

export default function AdminDashboard({ onNavigate }: Props) {
  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in-up">

      {/* ── Admin Banner ── */}
      <div className="relative overflow-hidden rounded-sm border border-earth-600/40 bg-gradient-to-r from-earth-900 to-earth-800 p-5">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(201,169,110,1) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,110,1) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-[#0B3C5D]/60 border border-draft-500/30 flex items-center justify-center">
              <Shield className="w-6 h-6 text-draft-300" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-earth-300/60 tracking-widest uppercase mb-0.5">Administration</p>
              <h2 className="text-white font-bold text-lg tracking-tight">Administration HQ</h2>
              <p className="text-earth-300/70 text-xs font-mono">Platform Administrator  ·  User & Section Access</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-mono text-earth-300/50 tracking-widest">SYSTEM STATUS</p>
              <div className="flex items-center gap-1.5 justify-end mt-0.5">
                <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
                <span className="text-xs font-mono text-cyber-green font-bold">ALL SYSTEMS GO</span>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-earth-300/20" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-earth-300/20" />
      </div>

      {/* ── Stat Cards (2×2) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <BlueprintCard
              key={s.label}
              className={`p-5 ${s.dark ? 'bg-earth-800 border-earth-600/40' : ''} glow-hover hover:border-earth-300/40 transition-all duration-300`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className={`text-[10px] font-mono tracking-widest uppercase mb-1 ${s.dark ? 'text-earth-300/60' : 'text-steel-400'}`}>{s.label}</p>
                  <p className={`text-3xl font-bold tracking-tight ${s.dark ? 'text-earth-200' : 'text-earth-800'}`}>{s.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${s.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-6 h-6 ${s.iconColor}`} />
                </div>
              </div>
              <div className={`flex items-center gap-1.5 text-[10px] font-mono ${s.dark ? 'text-cyber-green/80' : 'text-cyber-green'}`}>
                <TrendingUp className="w-3 h-3" />
                <span>{s.trend}</span>
              </div>
            </BlueprintCard>
          );
        })}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* System Activity Log */}
        <div className="lg:col-span-2">
          <BlueprintCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-earth-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-earth-600" />
                <h3 className="text-sm font-bold text-earth-800 tracking-tight">System Activity Log</h3>
              </div>
              <span className="text-[10px] font-mono text-steel-400 tracking-wider">LIVE FEED</span>
            </div>
            <div className="divide-y divide-earth-100/60">
              {systemLog.map((log) => (
                <div key={log.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-earth-50/40 transition-colors">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0
                    ${log.type === 'success' ? 'bg-cyber-green' : log.type === 'warning' ? 'bg-warning-orange' : 'bg-draft-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-earth-800">{log.event}</p>
                    <p className="text-[11px] text-steel-500 mt-0.5">{log.detail}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-steel-300" />
                      <span className="text-[10px] font-mono text-steel-400">{log.time}</span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase shrink-0
                    ${log.type === 'success' ? 'bg-emerald-50 text-cyber-green border-cyber-green/20'
                    : log.type === 'warning' ? 'bg-amber-50 text-warning-orange border-warning-orange/20'
                    : 'bg-earth-50 text-steel-500 border-steel-200'}`}>
                    {log.type}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-earth-100 flex justify-center">
              <button className="text-[11px] font-mono text-earth-500 hover:text-earth-700 transition-colors tracking-wider flex items-center gap-1">
                VIEW FULL LOG <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </BlueprintCard>
        </div>

        {/* Right Panel */}
        <div className="space-y-5">

          {/* Admin Tools */}
          <BlueprintCard className="p-5 bg-earth-800 border-earth-600/40">
            <div className="flex items-center gap-2.5 mb-4">
              <Settings className="w-4 h-4 text-earth-300" />
              <h3 className="text-sm font-bold text-earth-200 tracking-tight">Admin Tools</h3>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Manage Engineers', icon: Users, page: 'users', blue: true },
                { label: 'Manage Sites', icon: FolderOpen, page: 'sections', blue: true },
                { label: 'View Analytics', icon: BarChart3, page: 'analytics', blue: false },
                { label: 'System Settings', icon: Settings, page: 'settings', blue: false },
              ].map((btn) => {
                const Icon = btn.icon;
                return (
                  <button
                    key={btn.label}
                    onClick={() => onNavigate(btn.page)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-[4px] text-xs font-mono tracking-wider uppercase transition-all group border
                      ${btn.blue
                        ? 'bg-[#0B3C5D] text-white hover:bg-[#0d4a73] border-[#1B6E8A]/40'
                        : 'bg-earth-700 text-earth-200 hover:bg-earth-600 border-earth-500/30'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${btn.blue ? 'text-draft-300' : 'text-earth-300'}`} />
                      <span>{btn.label}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-all" />
                  </button>
                );
              })}
            </div>
          </BlueprintCard>

          {/* System Health */}
          <BlueprintCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-earth-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-cyber-green rounded-full" />
                <h3 className="text-sm font-bold text-earth-800 tracking-tight">System Health</h3>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse" />
                <span className="text-[10px] font-mono text-cyber-green">LIVE</span>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {systemHealth.map((h) => (
                <div key={h.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-steel-500 uppercase tracking-widest">{h.label}</span>
                    <span className="text-[10px] font-mono bg-cyber-green/10 text-cyber-green border border-cyber-green/20 px-2 py-0.5 rounded font-bold">
                      {h.status}
                    </span>
                  </div>
                  <div className="h-1.5 bg-earth-100 rounded-full overflow-hidden">
                    <div className={`h-full ${h.color} rounded-full`} style={{ width: `${h.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </BlueprintCard>

          {/* Quick Stats */}
          <BlueprintCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-earth-100">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-earth-500 rounded-full" />
                <h3 className="text-sm font-bold text-earth-800 tracking-tight">Quick Stats</h3>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-earth-100/60">
              {quickStats.map((qs) => {
                const Icon = qs.icon;
                return (
                  <div key={qs.label} className="p-4 flex flex-col items-center text-center gap-2 hover:bg-earth-50/40 transition-colors">
                    <Icon className="w-5 h-5 text-earth-500" />
                    <p className="text-lg font-bold text-earth-800 font-mono">{qs.value}</p>
                    <p className="text-[9px] font-mono text-steel-400 uppercase tracking-wider leading-tight">{qs.label}</p>
                  </div>
                );
              })}
            </div>
          </BlueprintCard>

          {/* DB Info */}
          <BlueprintCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-earth-600" />
              <span className="text-xs font-mono text-earth-700 font-bold tracking-wider uppercase">DB Status</span>
            </div>
            <div className="space-y-1.5">
              {[
                { key: 'Total Records', val: '1,284' },
                { key: 'Last Backup', val: '2h ago' },
                { key: 'Uptime', val: '99.9%' },
              ].map((row) => (
                <div key={row.key} className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-steel-400 uppercase tracking-wider">{row.key}</span>
                  <span className="text-[10px] font-mono text-earth-700 font-bold">{row.val}</span>
                </div>
              ))}
            </div>
          </BlueprintCard>
        </div>
      </div>
    </div>
  );
}
