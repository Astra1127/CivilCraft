import {
  Users,
  FolderOpen,
  TrendingUp,
  Clock,
  ChevronRight,
  BarChart3,
  FolderKanban,
  Star,
  BookOpen,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import BlueprintCard from '../components/BlueprintCard';

/* ─── Data ─────────────────────────────────────────────── */

const stats = [
  {
    label: 'Total Crew',
    value: '9',
    icon: Users,
    iconBg: 'bg-earth-100',
    iconColor: 'text-earth-700',
  },
  {
    label: 'Active Projects',
    value: '2',
    icon: BookOpen,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-cyber-green',
  },
  {
    label: 'Avg Rating',
    value: '87',
    icon: TrendingUp,
    iconBg: 'bg-amber-50',
    iconColor: 'text-warning-orange',
  },
];

const activities = [
  { id: '1', name: 'Emily Davis', initials: 'ED', section: 'CE-101', action: 'Completed "Suspension Bridge Challenge"', score: 95.2, time: '2 min ago', status: 'excellent' },
  { id: '2', name: 'John Doe', initials: 'JD', section: 'CE-101', action: 'Completed "Suspension Bridge Challenge"', score: 91.8, time: '5 min ago', status: 'good' },
  { id: '3', name: 'Sarah Wilson', initials: 'SW', section: 'CE-101', action: 'Completed "Suspension Bridge Challenge"', score: 87.5, time: '12 min ago', status: 'good' },
  { id: '4', name: 'Michael Brown', initials: 'MB', section: 'CE-202', action: 'Completed "Load Analysis Lab"', score: 82.0, time: '18 min ago', status: 'average' },
  { id: '5', name: 'Lisa Park', initials: 'LP', section: 'CE-202', action: 'Completed "Foundation Design"', score: 94.1, time: '25 min ago', status: 'excellent' },
];

const projects = [
  { id: '1', name: 'Structural Mechanics I', code: 'CE-101', crew: 5, rating: 87, active: 0, submissions: 12, color: 'from-earth-600 to-earth-800' },
  { id: '2', name: 'Structural Mechanics II', code: 'CE-202', crew: 4, rating: 86, active: 0, submissions: 9, color: 'from-earth-500 to-earth-700' },
];

function scoreColor(score: number) {
  if (score >= 90) return 'text-cyber-green';
  if (score >= 80) return 'text-warning-orange';
  return 'text-danger-red';
}

interface Props { onNavigate: (page: string) => void; }

export default function ProfessorDashboard({ onNavigate }: Props) {
  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in-up">

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <BlueprintCard key={stat.label} className="p-5 glow-hover hover:border-earth-300/50 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-earth-800 tracking-tight">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${stat.iconColor}`} />
                </div>
              </div>
              <div className="mt-4 h-px shimmer-line" />
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyber-green" />
                <span className="text-[10px] font-mono text-steel-400">LIVE DATA</span>
              </div>
            </BlueprintCard>
          );
        })}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Activity Log — 2 cols */}
        <div className="lg:col-span-2">
          <BlueprintCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-earth-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-earth-500 rounded-full" />
                <h3 className="text-sm font-bold text-earth-800 tracking-tight">Construction Activity Log</h3>
              </div>
              <span className="text-[10px] font-mono text-steel-400 tracking-wider">REAL-TIME FEED</span>
            </div>
            <div className="divide-y divide-earth-100/60">
              {activities.map((a) => (
                <div key={a.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-earth-50/50 transition-colors">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-earth-700 to-earth-500 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-white font-mono">{a.initials}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold text-earth-800">{a.name}</span>
                      <span className="text-[10px] font-mono bg-warning-orange/10 text-warning-orange px-1.5 py-0.5 rounded border border-warning-orange/20">{a.section}</span>
                    </div>
                    <p className="text-xs text-steel-500">
                      {a.action} — Score:{' '}
                      <span className={`font-semibold ${scoreColor(a.score)}`}>{a.score}/100</span>
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-steel-300" />
                      <span className="text-[10px] font-mono text-steel-400">{a.time}</span>
                    </div>
                  </div>
                  {/* Score badge */}
                  <div className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-mono font-bold
                    ${a.status === 'excellent' ? 'bg-emerald-50 text-cyber-green border-cyber-green/20'
                    : a.status === 'good' ? 'bg-amber-50 text-warning-orange border-warning-orange/20'
                    : 'bg-red-50 text-danger-red border-danger-red/20'}`}>
                    <Star className="w-3 h-3" />
                    {a.score}
                  </div>
                </div>
              ))}
            </div>
            {/* See More */}
            <div className="px-5 py-3 border-t border-earth-100 flex items-center justify-center">
              <button className="text-[11px] font-mono text-earth-500 hover:text-earth-700 transition-colors tracking-wider flex items-center gap-1">
                VIEW FULL LOG <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </BlueprintCard>
        </div>

        {/* Right Panel */}
        <div className="space-y-5">

          {/* Quick Actions */}
          <BlueprintCard className="p-5 bg-earth-800 border-earth-600/40">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-earth-300">🔧</span>
              <h3 className="text-sm font-bold text-earth-200 tracking-tight">Quick Actions</h3>
            </div>
            <div className="space-y-2.5">
              <button
                onClick={() => onNavigate('analytics')}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0B3C5D] text-white rounded-[4px] text-sm font-medium hover:bg-[#0d4a73] transition-all group border border-[#1B6E8A]/40"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-draft-300" />
                  <span className="tracking-wide uppercase text-xs font-mono">View Analytics</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all text-draft-300" />
              </button>
              <button
                onClick={() => onNavigate('sections')}
                className="w-full flex items-center justify-between px-4 py-3 bg-earth-700 text-earth-100 rounded-[4px] text-sm font-medium hover:bg-earth-600 transition-all group border border-earth-500/30"
              >
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-earth-300" />
                  <span className="tracking-wide uppercase text-xs font-mono">Manage Sections</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all text-earth-300" />
              </button>
            </div>
          </BlueprintCard>

          {/* My Projects */}
          <BlueprintCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-earth-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-earth-500 rounded-full" />
                <h3 className="text-sm font-bold text-earth-800 tracking-tight">My Projects</h3>
              </div>
              <button className="text-[11px] font-mono text-earth-500 hover:text-earth-700 transition-colors tracking-wider">
                VIEW ALL →
              </button>
            </div>
            <div className="divide-y divide-earth-100/60">
              {projects.map((proj) => (
                <div key={proj.id} className="p-4 hover:bg-earth-50/50 transition-colors">
                  {/* Project header */}
                  <div className={`rounded-sm bg-gradient-to-r ${proj.color} p-3 mb-3 relative overflow-hidden`}>
                    <div className="absolute inset-0 opacity-[0.04]"
                      style={{ backgroundImage: 'linear-gradient(rgba(201,169,110,1) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,110,1) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                    <div className="relative flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-mono text-earth-300/70 tracking-widest uppercase">{proj.code}</p>
                        <p className="text-sm font-bold text-white leading-tight">{proj.name}</p>
                      </div>
                      <FolderOpen className="w-5 h-5 text-white/60" />
                    </div>
                  </div>
                  {/* Project stats */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-steel-400" />
                        <span className="font-mono text-steel-500">{proj.crew} crew</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-steel-400" />
                        <span className="font-mono text-steel-500">{proj.submissions} subs</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-warning-orange fill-warning-orange" />
                        <span className="text-xs font-bold text-earth-700">{proj.rating}</span>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${proj.active > 0 ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/20' : 'bg-steel-50 text-steel-400 border-steel-200'}`}>
                        {proj.active} active
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BlueprintCard>

          {/* Class Health */}
          <BlueprintCard className="p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-1 h-5 bg-earth-500 rounded-full" />
              <h3 className="text-sm font-bold text-earth-800 tracking-tight">Class Health</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Completion Rate', pct: 78, status: 'ok' },
                { label: 'Avg Score', pct: 87, status: 'good' },
                { label: 'Engagement', pct: 65, status: 'warn' },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {m.status === 'warn'
                        ? <AlertCircle className="w-3 h-3 text-warning-orange" />
                        : <CheckCircle2 className="w-3 h-3 text-cyber-green" />}
                      <span className="text-[10px] font-mono text-steel-500 uppercase tracking-wider">{m.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-earth-600 font-bold">{m.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-earth-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${m.status === 'warn' ? 'bg-warning-orange' : m.status === 'good' ? 'bg-cyber-green' : 'bg-earth-500'}`}
                      style={{ width: `${m.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </BlueprintCard>
        </div>
      </div>
    </div>
  );
}
