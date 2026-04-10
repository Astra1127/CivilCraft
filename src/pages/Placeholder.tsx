import { 
  FolderKanban, Trophy, Receipt, BarChart3, MessageSquare, UserCircle,
  TrendingUp, Users, DollarSign, Star, Clock, ArrowUpRight, ArrowDownRight, Shield
} from 'lucide-react';
import BlueprintCard from '../components/BlueprintCard';
import { useAuth } from '../context/AuthContext';

interface PlaceholderProps {
  page: string;
}

export default function Placeholder({ page }: PlaceholderProps) {
  switch (page) {
    case 'sections':
    case 'my-section':
      return <SectionsPage />;
    case 'leaderboard':
      return <LeaderboardPage />;
    case 'transactions':
      return <TransactionsPage />;
    case 'analytics':
      return <AnalyticsPage />;
    case 'feedback':
      return <FeedbackPage />;
    case 'profile':
      return <ProfilePage />;
    default:
      return <GenericPlaceholder page={page} />;
  }
}

function SectionsPage() {
  const sections = [
    { id: 'CE-101', name: 'Structural Mechanics I', students: 28, professor: 'Prof. Lisa Park', status: 'active' },
    { id: 'CE-202', name: 'Structural Mechanics II', students: 22, professor: 'Prof. Lisa Park', status: 'active' },
    { id: 'CE-303', name: 'Foundation Engineering', students: 18, professor: 'Dr. Rachel Kim', status: 'active' },
    { id: 'CE-404', name: 'Fluid Mechanics Lab', students: 0, professor: 'Unassigned', status: 'draft' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((section) => (
          <BlueprintCard key={section.id} className="p-5 hover:border-earth-300/50 transition-all glow-hover cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono bg-earth-100 text-earth-700 px-2 py-0.5 rounded border border-earth-200/50">{section.id}</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${section.status === 'active' ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/20' : 'bg-steel-50 text-steel-400 border-steel-200'}`}>
                {section.status}
              </span>
            </div>
            <h3 className="text-sm font-bold text-earth-800 mb-1">{section.name}</h3>
            <p className="text-[11px] text-steel-400 font-mono mb-3">{section.professor}</p>
            <div className="flex items-center gap-1.5 pt-3 border-t border-earth-100">
              <Users className="w-3.5 h-3.5 text-steel-300" />
              <span className="text-xs text-steel-500">{section.students} students</span>
            </div>
          </BlueprintCard>
        ))}
      </div>
    </div>
  );
}

function LeaderboardPage() {
  const leaders = [
    { rank: 1, name: 'Emily Davis', section: 'CE-101', score: 952, trend: 'up' },
    { rank: 2, name: 'Lisa Park', section: 'CE-202', score: 941, trend: 'up' },
    { rank: 3, name: 'John Doe', section: 'CE-101', score: 918, trend: 'down' },
    { rank: 4, name: 'Sarah Wilson', section: 'CE-101', score: 875, trend: 'up' },
    { rank: 5, name: 'Michael Brown', section: 'CE-202', score: 820, trend: 'down' },
    { rank: 6, name: 'Alex Johnson', section: 'CE-303', score: 792, trend: 'up' },
  ];

  const podiumColors = [
    'bg-gradient-to-br from-amber-400 to-amber-600',
    'bg-gradient-to-br from-steel-300 to-steel-500',
    'bg-gradient-to-br from-orange-300 to-orange-500',
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        {leaders.slice(0, 3).map((l, i) => (
          <BlueprintCard key={l.rank} className={`p-5 ${i === 0 ? 'ring-1 ring-warning-orange/30' : ''}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-white text-sm ${podiumColors[i]}`}>
                #{l.rank}
              </div>
              <div>
                <p className="text-sm font-bold text-earth-800">{l.name}</p>
                <p className="text-[10px] font-mono text-steel-400">{l.section}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-lg font-bold text-earth-700 font-mono">{l.score}</p>
                <div className="flex items-center gap-0.5">
                  {l.trend === 'up' ? <ArrowUpRight className="w-3 h-3 text-cyber-green" /> : <ArrowDownRight className="w-3 h-3 text-danger-red" />}
                  <span className={`text-[10px] font-mono ${l.trend === 'up' ? 'text-cyber-green' : 'text-danger-red'}`}>pts</span>
                </div>
              </div>
            </div>
          </BlueprintCard>
        ))}
      </div>

      <BlueprintCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-earth-100 flex items-center gap-2.5">
          <div className="w-1 h-5 bg-earth-500 rounded-full" />
          <h3 className="text-sm font-bold text-earth-800">Full Rankings</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-earth-50">
              <th className="text-left px-5 py-2.5 text-[11px] font-mono text-steel-400 tracking-widest uppercase">Rank</th>
              <th className="text-left px-5 py-2.5 text-[11px] font-mono text-steel-400 tracking-widest uppercase">Name</th>
              <th className="text-left px-5 py-2.5 text-[11px] font-mono text-steel-400 tracking-widest uppercase">Section</th>
              <th className="text-left px-5 py-2.5 text-[11px] font-mono text-steel-400 tracking-widest uppercase">Score</th>
              <th className="text-left px-5 py-2.5 text-[11px] font-mono text-steel-400 tracking-widest uppercase">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100/60">
            {leaders.map((l) => (
              <tr key={l.rank} className="hover:bg-earth-50/50 transition-colors">
                <td className="px-5 py-3">
                  <span className="text-sm font-mono font-bold text-earth-700">#{l.rank}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="text-sm font-semibold text-earth-800">{l.name}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="text-[10px] font-mono bg-earth-100 text-earth-700 px-2 py-0.5 rounded border border-earth-200/50">{l.section}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="text-sm font-mono font-bold text-earth-700">{l.score}</span>
                </td>
                <td className="px-5 py-3">
                  {l.trend === 'up' ? (
                    <ArrowUpRight className="w-4 h-4 text-cyber-green" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-danger-red" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </BlueprintCard>
    </div>
  );
}

function TransactionsPage() {
  const { user } = useAuth();
  const allTransactions = [
    { id: 'TXN-001', user: 'Dr. Alex Morgan', email: 'admin@civilcraft.edu', type: 'Credit', amount: '+120', description: 'System governance allocation', date: '2026-03-15', status: 'completed' },
    { id: 'TXN-002', user: 'Prof. Sarah Chen', email: 'sarah.chen@civilcraft.edu', type: 'Credit', amount: '+65', description: 'Class analytics completion bonus', date: '2026-03-14', status: 'completed' },
    { id: 'TXN-003', user: 'James Rivera', email: 'j.rivera@civilcraft.edu', type: 'Credit', amount: '+35', description: 'Bridge challenge reward', date: '2026-03-14', status: 'pending' },
    { id: 'TXN-004', user: 'James Rivera', email: 'j.rivera@civilcraft.edu', type: 'Debit', amount: '-10', description: 'Material pack unlock', date: '2026-03-13', status: 'completed' },
    { id: 'TXN-005', user: 'Prof. Sarah Chen', email: 'sarah.chen@civilcraft.edu', type: 'Debit', amount: '-20', description: 'Section export fee', date: '2026-03-12', status: 'completed' },
    { id: 'TXN-006', user: 'Emily Davis', email: 'emily.davis@students.civilcraft.edu', type: 'Credit', amount: '+50', description: 'Suspension bridge excellence bonus', date: '2026-03-11', status: 'completed' },
  ];

  const isAdminView = user?.role === 'admin' || user?.role === 'super_admin';
  const personalTransactions = allTransactions.filter(
    (transaction) => transaction.email.toLowerCase() === user?.email?.toLowerCase(),
  );

  const visibleTransactions = isAdminView
    ? allTransactions
    : personalTransactions.length > 0
      ? personalTransactions
      : user
        ? [
            {
              id: 'TXN-SELF-001',
              user: user.name,
              email: user.email,
              type: 'Credit',
              amount: user.role === 'professor' ? '+40' : '+25',
              description: user.role === 'professor' ? 'Section management starter credit' : 'Student starter credit',
              date: '2026-03-15',
              status: 'completed',
            },
          ]
        : [];

  const totalCredits = visibleTransactions
    .filter((transaction) => transaction.amount.startsWith('+'))
    .reduce((sum, transaction) => sum + Number(transaction.amount.replace('+', '')), 0);
  const totalDebits = visibleTransactions
    .filter((transaction) => transaction.amount.startsWith('-'))
    .reduce((sum, transaction) => sum + Number(transaction.amount.replace('-', '')), 0);
  const netBalance = totalCredits - totalDebits;

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BlueprintCard className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase">Total Credits</p>
              <p className="text-2xl font-bold text-cyber-green mt-1 font-mono">+{totalCredits}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-cyber-green/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-cyber-green" />
            </div>
          </div>
        </BlueprintCard>
        <BlueprintCard className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase">Total Debits</p>
              <p className="text-2xl font-bold text-danger-red mt-1 font-mono">-{totalDebits}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-danger-red/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-danger-red" />
            </div>
          </div>
        </BlueprintCard>
        <BlueprintCard className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase">Net Balance</p>
              <p className={`text-2xl font-bold mt-1 font-mono ${netBalance >= 0 ? 'text-earth-700' : 'text-danger-red'}`}>
                {netBalance >= 0 ? '+' : ''}{netBalance}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-earth-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-earth-700" />
            </div>
          </div>
        </BlueprintCard>
      </div>

      <BlueprintCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-earth-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-5 bg-earth-500 rounded-full" />
            <div>
              <h3 className="text-sm font-bold text-earth-800">
                {isAdminView ? 'All User Transactions' : 'My Transaction History'}
              </h3>
              <p className="text-[11px] text-steel-400">
                {isAdminView
                  ? 'Super admins and admins can monitor every transaction across the platform.'
                  : 'Only your own credits and debits are visible in this ledger.'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-earth-600">
            {visibleTransactions.length} record{visibleTransactions.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-earth-800">
                <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">ID</th>
                {isAdminView && (
                  <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">User</th>
                )}
                <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Description</th>
                <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Amount</th>
                <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Date</th>
                <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100/60">
              {visibleTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-earth-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="text-xs font-mono text-earth-600">{transaction.id}</span>
                  </td>
                  {isAdminView && <td className="px-5 py-3 text-sm font-medium text-earth-800">{transaction.user}</td>}
                  <td className="px-5 py-3 text-xs text-steel-500">{transaction.description}</td>
                  <td className="px-5 py-3">
                    <span className={`text-sm font-mono font-bold ${transaction.amount.startsWith('+') ? 'text-cyber-green' : 'text-danger-red'}`}>
                      {transaction.amount}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-steel-400">
                    {new Date(transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${transaction.status === 'completed' ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/20' : 'bg-warning-orange/10 text-warning-orange border-warning-orange/20'}`}>
                      {transaction.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BlueprintCard>
    </div>
  );
}

function AnalyticsPage() {
  const metrics = [
    { label: 'Completion Rate', value: '87%', change: '+5.2%', trend: 'up' },
    { label: 'Avg. Session Time', value: '42m', change: '+8.1%', trend: 'up' },
    { label: 'Active Users', value: '156', change: '-2.3%', trend: 'down' },
    { label: 'Total Submissions', value: '1,247', change: '+12.5%', trend: 'up' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <BlueprintCard key={m.label} className="p-5">
            <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-1">{m.label}</p>
            <p className="text-2xl font-bold text-earth-800 font-mono">{m.value}</p>
            <div className="flex items-center gap-1 mt-2">
              {m.trend === 'up' ? <ArrowUpRight className="w-3 h-3 text-cyber-green" /> : <ArrowDownRight className="w-3 h-3 text-danger-red" />}
              <span className={`text-[11px] font-mono ${m.trend === 'up' ? 'text-cyber-green' : 'text-danger-red'}`}>{m.change}</span>
              <span className="text-[10px] text-steel-300 ml-1">vs last week</span>
            </div>
          </BlueprintCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BlueprintCard className="p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-5 bg-earth-500 rounded-full" />
            <h3 className="text-sm font-bold text-earth-800">Performance Overview</h3>
          </div>
          {/* Simulated bar chart */}
          <div className="space-y-3">
            {[
              { label: 'CE-101', value: 87, color: 'bg-earth-600' },
              { label: 'CE-202', value: 72, color: 'bg-earth-400' },
              { label: 'CE-303', value: 94, color: 'bg-cyber-green' },
              { label: 'CE-404', value: 45, color: 'bg-warning-orange' },
            ].map((bar) => (
              <div key={bar.label} className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-steel-500 w-14">{bar.label}</span>
                <div className="flex-1 h-6 bg-earth-50 rounded-[2px] overflow-hidden border border-earth-100">
                  <div className={`h-full ${bar.color} rounded-[2px] transition-all duration-1000`} style={{ width: `${bar.value}%` }} />
                </div>
                <span className="text-xs font-mono font-bold text-earth-700 w-8 text-right">{bar.value}%</span>
              </div>
            ))}
          </div>
        </BlueprintCard>

        <BlueprintCard className="p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-5 bg-earth-500 rounded-full" />
            <h3 className="text-sm font-bold text-earth-800">Weekly Activity</h3>
          </div>
          {/* Simulated line chart area */}
          <div className="flex items-end gap-2 h-40">
            {[35, 52, 48, 75, 62, 88, 71].map((val, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-earth-100 rounded-t-[2px] border border-earth-200/30 border-b-0 relative" style={{ height: `${val}%` }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-earth-300/20 to-transparent rounded-t-[2px]" />
                </div>
                <span className="text-[9px] font-mono text-steel-400">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
              </div>
            ))}
          </div>
        </BlueprintCard>
      </div>
    </div>
  );
}

function FeedbackPage() {
  const feedback = [
    { id: 1, user: 'Emily Davis', rating: 5, comment: 'The suspension bridge challenge was incredibly engaging! Great learning experience.', date: '2 hours ago' },
    { id: 2, user: 'John Doe', rating: 4, comment: 'Good content but would love more interactive 3D models for foundation design.', date: '5 hours ago' },
    { id: 3, user: 'Sarah Wilson', rating: 5, comment: 'The scoring system really motivates me to improve my designs. Love it!', date: '1 day ago' },
    { id: 4, user: 'Michael Brown', rating: 3, comment: 'Some of the load calculations feel too simplified. Would appreciate more complexity.', date: '2 days ago' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BlueprintCard className="p-5">
          <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase">Avg Rating</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold text-earth-800 font-mono">4.3</p>
            <div className="flex gap-0.5">
              {[1,2,3,4].map(i => <Star key={i} className="w-4 h-4 text-warning-orange fill-warning-orange" />)}
              <Star className="w-4 h-4 text-steel-200" />
            </div>
          </div>
        </BlueprintCard>
        <BlueprintCard className="p-5">
          <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase">Total Reviews</p>
          <p className="text-2xl font-bold text-earth-800 font-mono mt-1">127</p>
        </BlueprintCard>
        <BlueprintCard className="p-5">
          <p className="text-[11px] font-mono text-steel-400 tracking-widest uppercase">Response Rate</p>
          <p className="text-2xl font-bold text-cyber-green font-mono mt-1">94%</p>
        </BlueprintCard>
      </div>

      <div className="space-y-3">
        {feedback.map((f) => (
          <BlueprintCard key={f.id} className="p-5 hover:border-earth-300/40 transition-all">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-earth-700 to-earth-500 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-white font-mono">{f.user.split(' ').map(n => n[0]).join('')}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-earth-800">{f.user}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {Array.from({length: 5}).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < f.rating ? 'text-warning-orange fill-warning-orange' : 'text-steel-200'}`} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-steel-300" />
                <span className="text-[10px] font-mono text-steel-400">{f.date}</span>
              </div>
            </div>
            <p className="text-sm text-steel-600 ml-12">{f.comment}</p>
          </BlueprintCard>
        ))}
      </div>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <BlueprintCard className="p-6 text-center">
          <div className="w-20 h-20 mx-auto rounded-xl bg-gradient-to-br from-earth-700 to-earth-500 flex items-center justify-center mb-4 border border-earth-400/30">
            <span className="text-2xl font-bold text-white font-mono">AM</span>
          </div>
          <h3 className="text-lg font-bold text-earth-800">Dr. Alex Morgan</h3>
          <p className="text-xs font-mono text-steel-400 mt-0.5">admin@civilcraft.edu</p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-earth-100 text-earth-700 rounded border border-earth-200/50">
            <Shield className="w-3 h-3" />
            <span className="text-[11px] font-mono font-semibold">SUPER ADMIN</span>
          </div>
          <div className="mt-5 pt-4 border-t border-earth-100 grid grid-cols-3 gap-3">
            <div>
              <p className="text-lg font-bold text-earth-700 font-mono">12</p>
              <p className="text-[10px] font-mono text-steel-400">Sections</p>
            </div>
            <div>
              <p className="text-lg font-bold text-earth-700 font-mono">156</p>
              <p className="text-[10px] font-mono text-steel-400">Users</p>
            </div>
            <div>
              <p className="text-lg font-bold text-earth-700 font-mono">4.8</p>
              <p className="text-[10px] font-mono text-steel-400">Rating</p>
            </div>
          </div>
        </BlueprintCard>

        <div className="lg:col-span-2">
          <BlueprintCard className="p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-1 h-5 bg-earth-500 rounded-full" />
              <h3 className="text-sm font-bold text-earth-800">Profile Settings</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Full Name', value: 'Dr. Alex Morgan' },
                { label: 'Email', value: 'admin@civilcraft.edu' },
                { label: 'Department', value: 'Civil Engineering' },
                { label: 'Institution', value: 'CivilCraft University' },
                { label: 'Phone', value: '+1 (555) 123-4567' },
                { label: 'Timezone', value: 'UTC-5 (Eastern)' },
              ].map((field) => (
                <div key={field.label}>
                  <label className="block text-[11px] font-mono text-steel-400 tracking-widest uppercase mb-1.5">{field.label}</label>
                  <input
                    type="text"
                    defaultValue={field.value}
                    className="w-full px-3 py-2.5 bg-earth-50/50 border border-earth-200 rounded-[4px] text-sm text-earth-800 focus:outline-none focus:border-earth-400 focus:ring-1 focus:ring-earth-300/30 transition-all"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button className="px-5 py-2.5 bg-earth-800 text-white rounded-[4px] text-sm font-medium hover:bg-earth-700 transition-colors border border-earth-600/30">
                Save Changes
              </button>
            </div>
          </BlueprintCard>
        </div>
      </div>
    </div>
  );
}

function GenericPlaceholder({ page }: { page: string }) {
  const icons: Record<string, typeof FolderKanban> = {
    sections: FolderKanban,
    leaderboard: Trophy,
    transactions: Receipt,
    analytics: BarChart3,
    feedback: MessageSquare,
    profile: UserCircle,
  };
  const Icon = icons[page] || FolderKanban;

  return (
    <div className="p-4 sm:p-6 flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <BlueprintCard className="max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-xl bg-earth-100 border border-earth-200/50 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-earth-600" />
        </div>
        <h2 className="text-xl font-bold text-earth-800 mb-2 capitalize">{page.replace('-', ' ')}</h2>
        <p className="text-sm text-steel-500">This section is under construction. Check back soon for updates.</p>
      </BlueprintCard>
    </div>
  );
}
