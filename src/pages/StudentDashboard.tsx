import {
  HardHat,
  BookOpen,
  Trophy,
  Star,
  Clock,
  ChevronRight,
  Zap,
  CheckCircle2,
  Lock,
  PlayCircle,
  TrendingUp,
  Award,
  Target,
  Calendar,
} from 'lucide-react';
import BlueprintCard from '../components/BlueprintCard';
import { useAuth } from '../context/AuthContext';

/* ─── Data ─────────────────────────────────────────────── */

const myStats = [
  { label: 'My Score', value: '87', unit: '/100', icon: Star, iconBg: 'bg-amber-50', iconColor: 'text-warning-orange', trend: '+3 this week' },
  { label: 'Rank', value: '#4', unit: '', icon: Trophy, iconBg: 'bg-earth-50', iconColor: 'text-earth-600', trend: 'of 9 engineers' },
  { label: 'Completed', value: '3', unit: '/5', icon: CheckCircle2, iconBg: 'bg-emerald-50', iconColor: 'text-cyber-green', trend: 'tasks done' },
];

const currentProjects = [
  {
    id: '1',
    name: 'Suspension Bridge Challenge',
    section: 'CE-101',
    progress: 60,
    score: 95.2,
    status: 'in-progress',
    dueDate: 'Due Mar 15',
    difficulty: 'Advanced',
  },
  {
    id: '2',
    name: 'Load Analysis Lab',
    section: 'CE-101',
    progress: 100,
    score: 82.0,
    status: 'completed',
    dueDate: 'Submitted',
    difficulty: 'Intermediate',
  },
  {
    id: '3',
    name: 'Foundation Design',
    section: 'CE-101',
    progress: 0,
    score: null,
    status: 'locked',
    dueDate: 'Unlocks Mar 20',
    difficulty: 'Expert',
  },
];

const recentActivity = [
  { id: '1', action: 'Completed "Load Analysis Lab"', score: 82.0, time: '2 hours ago', type: 'complete' },
  { id: '2', action: 'Started "Suspension Bridge Challenge"', score: null, time: 'Yesterday', type: 'start' },
  { id: '3', action: 'Earned "Fast Builder" badge', score: null, time: '2 days ago', type: 'badge' },
  { id: '4', action: 'Completed "Site Survey Basics"', score: 91.5, time: '3 days ago', type: 'complete' },
];

const leaderboardTop = [
  { rank: 1, name: 'Emily Davis', initials: 'ED', score: 95.2, section: 'CE-101' },
  { rank: 2, name: 'Lisa Park', initials: 'LP', score: 94.1, section: 'CE-202' },
  { rank: 3, name: 'John Doe', initials: 'JD', score: 91.8, section: 'CE-101' },
  { rank: 4, name: 'James Rivera', initials: 'JR', score: 87.0, section: 'CE-101', isMe: true },
];

/* ─── Sub-components ───────────────────────────────────── */

function SectionTag({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-mono bg-earth-100 text-earth-700 px-1.5 py-0.5 rounded border border-earth-200/60">
      {label}
    </span>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    Beginner: 'bg-emerald-50 text-cyber-green border-cyber-green/20',
    Intermediate: 'bg-amber-50 text-warning-orange border-warning-orange/20',
    Advanced: 'bg-earth-50 text-earth-700 border-earth-300/40',
    Expert: 'bg-red-50 text-danger-red border-danger-red/20',
  };
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${map[level] ?? 'bg-steel-50 text-steel-500 border-steel-200'}`}>
      {level}
    </span>
  );
}

/* ─── Welcome Panel (no section) ───────────────────────── */

export function StudentWelcomePanel() {
  return (
    <div className="p-4 sm:p-6 flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <BlueprintCard className="max-w-lg w-full p-8 text-center animate-fade-in-up">
        {/* Helmet icon */}
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-earth-700 to-earth-500 flex items-center justify-center mb-6 border border-earth-400/30 shadow-lg">
          <HardHat className="w-10 h-10 text-white" />
        </div>

        <h2 className="text-2xl font-bold text-earth-800 mb-2 tracking-tight">Welcome to CivilCraft!</h2>
        <p className="text-sm text-steel-500 mb-2 font-mono tracking-wider uppercase">Engineer's Dashboard</p>
        <p className="text-sm text-steel-500 mb-6 leading-relaxed">
          You haven't been assigned to a section yet. Contact your administrator to{' '}
          <span className="text-earth-600 font-semibold">join a section</span>.
        </p>

        {/* Blueprint corner indicators */}
        <div className="relative bg-amber-50 border border-earth-200 rounded-sm p-5 text-left">
          {/* Corner bolts */}
          <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-earth-300/60 border border-earth-400/40" />
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-earth-300/60 border border-earth-400/40" />
          <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-earth-300/60 border border-earth-400/40" />
          <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-earth-300/60 border border-earth-400/40" />

          <h4 className="text-sm font-bold text-earth-700 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-earth-600" />
            What's Next:
          </h4>
          <ul className="space-y-2.5">
            {[
              'The administrator will assign you to a section',
              "Once assigned, you'll access your building assignments",
              'Check back soon or contact your administrator',
              'You can only work on one project at a time',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-steel-600">
                <span className="w-5 h-5 rounded bg-earth-200 border border-earth-300/50 flex items-center justify-center shrink-0 mt-px">
                  <span className="text-[10px] font-mono font-bold text-earth-700">{i + 1}</span>
                </span>
                {step}
              </li>
            ))}
          </ul>
        </div>
      </BlueprintCard>
    </div>
  );
}

/* ─── Main Student Dashboard ───────────────────────────── */

interface Props { onNavigate: (page: string) => void; }

export default function StudentDashboard({ onNavigate }: Props) {
  const { user } = useAuth();

  if (!user?.hasSection) return <StudentWelcomePanel />;

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in-up">

      {/* ── Section Banner ── */}
      <div className="relative overflow-hidden rounded-sm border border-earth-200 bg-gradient-to-r from-earth-800 to-earth-700 p-5">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(201,169,110,1) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,110,1) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-earth-300/20 border border-earth-300/30 flex items-center justify-center">
              <HardHat className="w-6 h-6 text-earth-300" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-earth-300/60 tracking-widest uppercase mb-0.5">Active Section</p>
              <h2 className="text-white font-bold text-lg tracking-tight">CE-101 — Structural Mechanics I</h2>
              <p className="text-earth-300/70 text-xs font-mono">Prof. Sarah Chen  ·  9 Engineers</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
            <span className="text-[11px] font-mono text-earth-300/70 tracking-wider">SECTION ACTIVE</span>
          </div>
        </div>
        {/* Blueprint corners */}
        <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-earth-300/20" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-earth-300/20" />
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {myStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <BlueprintCard key={stat.label} className="p-5 glow-hover hover:border-earth-300/50 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-1">{stat.label}</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-3xl font-bold text-earth-800 tracking-tight">{stat.value}</p>
                    <span className="text-sm text-steel-400 font-mono">{stat.unit}</span>
                  </div>
                  <p className="text-[10px] font-mono text-steel-400 mt-1">{stat.trend}</p>
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

        {/* Left: Projects */}
        <div className="lg:col-span-2 space-y-5">

          {/* My Assignments */}
          <BlueprintCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-earth-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-earth-500 rounded-full" />
                <h3 className="text-sm font-bold text-earth-800 tracking-tight">My Assignments</h3>
              </div>
              <span className="text-[10px] font-mono text-steel-400 tracking-wider">CE-101</span>
            </div>
            <div className="divide-y divide-earth-100/60">
              {currentProjects.map((proj) => (
                <div key={proj.id} className="px-5 py-4 hover:bg-earth-50/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Status icon */}
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                        ${proj.status === 'completed' ? 'bg-emerald-50' : proj.status === 'locked' ? 'bg-steel-100' : 'bg-earth-50'}`}>
                        {proj.status === 'completed'
                          ? <CheckCircle2 className="w-5 h-5 text-cyber-green" />
                          : proj.status === 'locked'
                          ? <Lock className="w-5 h-5 text-steel-300" />
                          : <PlayCircle className="w-5 h-5 text-earth-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-sm font-semibold ${proj.status === 'locked' ? 'text-steel-400' : 'text-earth-800'}`}>
                            {proj.name}
                          </span>
                          <DifficultyBadge level={proj.difficulty} />
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-steel-400">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{proj.dueDate}</span>
                          {proj.score !== null && (
                            <span className="flex items-center gap-1 text-earth-600 font-bold">
                              <Star className="w-3 h-3 text-warning-orange" />{proj.score}/100
                            </span>
                          )}
                        </div>
                        {/* Progress bar */}
                        {proj.status !== 'locked' && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono text-steel-400">Progress</span>
                              <span className="text-[10px] font-mono text-earth-600 font-bold">{proj.progress}%</span>
                            </div>
                            <div className="h-1.5 bg-earth-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${proj.status === 'completed' ? 'bg-cyber-green' : 'bg-earth-500'}`}
                                style={{ width: `${proj.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {proj.status !== 'locked' && (
                      <button className="shrink-0 px-3 py-1.5 text-[11px] font-mono bg-earth-800 text-earth-200 rounded hover:bg-earth-700 transition-colors border border-earth-600/30">
                        {proj.status === 'completed' ? 'REVIEW' : 'CONTINUE'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </BlueprintCard>

          {/* Activity Log */}
          <BlueprintCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-earth-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-earth-500 rounded-full" />
                <h3 className="text-sm font-bold text-earth-800 tracking-tight">Recent Activity</h3>
              </div>
              <span className="text-[10px] font-mono text-steel-400 tracking-wider">PERSONAL LOG</span>
            </div>
            <div className="divide-y divide-earth-100/60">
              {recentActivity.map((item) => (
                <div key={item.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-earth-50/40 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                    ${item.type === 'complete' ? 'bg-emerald-50' : item.type === 'badge' ? 'bg-amber-50' : 'bg-earth-50'}`}>
                    {item.type === 'complete'
                      ? <CheckCircle2 className="w-4 h-4 text-cyber-green" />
                      : item.type === 'badge'
                      ? <Award className="w-4 h-4 text-warning-orange" />
                      : <Zap className="w-4 h-4 text-earth-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-earth-700 font-medium">{item.action}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-steel-300" />
                      <span className="text-[10px] font-mono text-steel-400">{item.time}</span>
                      {item.score !== null && (
                        <span className="text-[10px] font-mono text-earth-600 font-bold ml-1">Score: {item.score}/100</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BlueprintCard>
        </div>

        {/* Right Panel */}
        <div className="space-y-5">

          {/* Quick Actions */}
          <BlueprintCard className="p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-1 h-5 bg-earth-500 rounded-full" />
              <h3 className="text-sm font-bold text-earth-800 tracking-tight">Quick Actions</h3>
            </div>
            <div className="space-y-2.5">
              <button
                onClick={() => onNavigate('leaderboard')}
                className="w-full flex items-center justify-between px-4 py-3 bg-earth-800 text-white rounded-[4px] text-sm font-medium hover:bg-earth-700 transition-all group border border-earth-600/30"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-earth-300" />
                  <span>View Leaderboard</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all text-earth-300" />
              </button>
              <button
                onClick={() => onNavigate('my-section')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white text-earth-800 rounded-[4px] text-sm font-medium hover:bg-earth-50 transition-all group border border-earth-200"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-earth-600" />
                  <span>My Section</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all text-earth-600" />
              </button>
              <button
                onClick={() => onNavigate('transactions')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white text-earth-800 rounded-[4px] text-sm font-medium hover:bg-earth-50 transition-all group border border-earth-200"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-earth-600" />
                  <span>My Transactions</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all text-earth-600" />
              </button>
            </div>
          </BlueprintCard>

          {/* Mini Leaderboard */}
          <BlueprintCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-earth-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-earth-500 rounded-full" />
                <h3 className="text-sm font-bold text-earth-800 tracking-tight">Section Ranking</h3>
              </div>
              <button
                onClick={() => onNavigate('leaderboard')}
                className="text-[11px] font-mono text-earth-500 hover:text-earth-700 transition-colors tracking-wider"
              >
                VIEW ALL →
              </button>
            </div>
            <div className="divide-y divide-earth-100/60">
              {leaderboardTop.map((entry) => (
                <div key={entry.rank} className={`px-5 py-3 flex items-center gap-3 ${entry.isMe ? 'bg-earth-50' : 'hover:bg-earth-50/30'} transition-colors`}>
                  <span className={`w-6 text-center text-[11px] font-mono font-bold
                    ${entry.rank === 1 ? 'text-warning-orange' : entry.rank === 2 ? 'text-steel-400' : entry.rank === 3 ? 'text-earth-600' : 'text-steel-300'}`}>
                    #{entry.rank}
                  </span>
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0
                    ${entry.isMe ? 'bg-gradient-to-br from-earth-500 to-earth-700' : 'bg-gradient-to-br from-earth-700 to-earth-900'}`}>
                    <span className="text-[9px] font-bold text-white font-mono">{entry.initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold truncate ${entry.isMe ? 'text-earth-700' : 'text-earth-800'}`}>{entry.name}</span>
                      {entry.isMe && <span className="text-[9px] font-mono bg-earth-200 text-earth-700 px-1 rounded">YOU</span>}
                    </div>
                    <SectionTag label={entry.section} />
                  </div>
                  <span className="text-xs font-bold text-earth-700 font-mono">{entry.score}</span>
                </div>
              ))}
            </div>
          </BlueprintCard>

          {/* Performance Meter */}
          <BlueprintCard className="p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-1 h-5 bg-earth-500 rounded-full" />
              <h3 className="text-sm font-bold text-earth-800 tracking-tight">Performance</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Structural Design', pct: 92 },
                { label: 'Load Calculations', pct: 78 },
                { label: 'Material Science', pct: 85 },
                { label: 'Project Planning', pct: 70 },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-steel-500 uppercase tracking-wider">{m.label}</span>
                    <span className="text-[10px] font-mono text-earth-600 font-bold">{m.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-earth-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-earth-600 to-earth-400 rounded-full transition-all"
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
