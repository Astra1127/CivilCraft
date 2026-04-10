import {
  Users,
  FolderKanban,
  BarChart3,
  TrendingUp,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import BlueprintCard from '../components/BlueprintCard';

const metricCards = [
  { label: 'Total Users', value: '1,284', delta: '+6.4%', icon: Users },
  { label: 'Active Sections', value: '42', delta: '+3.1%', icon: FolderKanban },
  { label: 'Daily Sessions', value: '3,907', delta: '+8.9%', icon: Activity },
  { label: 'Platform Integrity', value: '99.9%', delta: 'stable', icon: ShieldCheck },
];

const sectionRows = [
  { code: 'CE-101', users: 145, avgScore: 88, completion: 82 },
  { code: 'CE-202', users: 121, avgScore: 84, completion: 76 },
  { code: 'CE-303', users: 98, avgScore: 91, completion: 88 },
  { code: 'CE-404', users: 112, avgScore: 79, completion: 69 },
];

export default function SuperAdminAnalytics() {
  return (
    <div className="animate-fade-in-up space-y-6 p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((item) => {
          const Icon = item.icon;
          return (
            <BlueprintCard key={item.label} className="p-5">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-steel-400">{item.label}</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-earth-800">{item.value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-earth-100">
                  <Icon className="h-5 w-5 text-earth-700" />
                </div>
              </div>
              <p className="inline-flex items-center gap-1 text-[11px] font-mono text-cyber-green">
                <TrendingUp className="h-3.5 w-3.5" /> {item.delta}
              </p>
            </BlueprintCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BlueprintCard className="overflow-hidden">
            <div className="border-b border-earth-100 px-5 py-4">
              <h3 className="text-sm font-bold text-earth-800">Global Section Analytics</h3>
              <p className="mt-1 text-xs text-steel-500">Cross-section monitoring for users, performance, and completion.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr className="bg-earth-50">
                    <th className="px-5 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-steel-400">Section</th>
                    <th className="px-5 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-steel-400">Users</th>
                    <th className="px-5 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-steel-400">Avg Score</th>
                    <th className="px-5 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-steel-400">Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100/60">
                  {sectionRows.map((row) => (
                    <tr key={row.code} className="hover:bg-earth-50/50">
                      <td className="px-5 py-3 text-sm font-semibold text-earth-800">{row.code}</td>
                      <td className="px-5 py-3 text-sm text-steel-500 font-mono">{row.users}</td>
                      <td className="px-5 py-3 text-sm text-earth-700 font-mono">{row.avgScore}</td>
                      <td className="px-5 py-3">
                        <div className="h-2 w-36 overflow-hidden rounded-full bg-earth-100">
                          <div className="h-full rounded-full bg-earth-500" style={{ width: `${row.completion}%` }} />
                        </div>
                        <p className="mt-1 text-[10px] font-mono text-steel-500">{row.completion}%</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </BlueprintCard>
        </div>

        <BlueprintCard className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-earth-600" />
            <h3 className="text-sm font-bold text-earth-800">Integrity Monitor</h3>
          </div>
          <div className="space-y-4">
            {[
              { label: 'API Success Rate', value: 99 },
              { label: 'Fraud Flags Resolved', value: 92 },
              { label: 'Role Drift Alerts', value: 4 },
              { label: 'Section Sync Health', value: 97 },
            ].map((kpi) => (
              <div key={kpi.label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-steel-400">{kpi.label}</span>
                  <span className="text-[10px] font-mono font-bold text-earth-700">{kpi.value}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-earth-100">
                  <div className="h-full rounded-full bg-cyber-green" style={{ width: `${kpi.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </BlueprintCard>
      </div>
    </div>
  );
}
