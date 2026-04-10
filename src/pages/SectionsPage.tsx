import { useState } from 'react';
import {
  Wrench, Users, TrendingUp, Clock, CheckCircle2, ChevronLeft,
  Search, Download, ArrowUpRight, ArrowDownRight, Star,
  BookOpen, Shield, Target, BarChart3, Link2
} from 'lucide-react';
import BlueprintCard from '../components/BlueprintCard';
import { useAuth } from '../context/AuthContext';

/* ─── Types ─────────────────────────────────────────────── */

interface Student {
  id: string;
  name: string;
  initials: string;
  email: string;
  score: number;
  stability: number;
  efficiency: number;
  completed: number;
  active: number;
  trend: 'up' | 'down' | 'same';
  rank: number;
}

interface Section {
  id: string;
  code: string;
  name: string;
  professor: string;
  crew: number;
  rating: number;
  active: number;
  done: number;
  status: 'active' | 'completed' | 'draft';
  avgStability: number;
  avgEfficiency: number;
  students: Student[];
  projectCode: string;
}

/* ─── Mock Data ──────────────────────────────────────────── */

const SECTIONS: Section[] = [
  {
    id: '1',
    code: 'CE-101',
    name: 'Structural Mechanics I',
    professor: 'Prof. Sarah Chen',
    crew: 5,
    rating: 87,
    active: 0,
    done: 2,
    status: 'completed',
    avgStability: 89,
    avgEfficiency: 85,
    projectCode: 'SM1-2026',
    students: [
      { id: 's1', name: 'John Doe', initials: 'JD', email: 'john.doe@students.civilcraft.edu', score: 93, stability: 95, efficiency: 91, completed: 8, active: 0, trend: 'up', rank: 1 },
      { id: 's2', name: 'Emily Davis', initials: 'ED', email: 'emily.davis@students.civilcraft.edu', score: 90, stability: 92, efficiency: 89, completed: 8, active: 0, trend: 'up', rank: 2 },
      { id: 's3', name: 'Michael Brown', initials: 'MB', email: 'michael.brown@students.civilcraft.edu', score: 86, stability: 88, efficiency: 83, completed: 7, active: 1, trend: 'down', rank: 3 },
      { id: 's4', name: 'Sarah Wilson', initials: 'SW', email: 'sarah.wilson@students.civilcraft.edu', score: 82, stability: 84, efficiency: 80, completed: 7, active: 0, trend: 'up', rank: 4 },
      { id: 's5', name: 'Alex Johnson', initials: 'AJ', email: 'alex.johnson@students.civilcraft.edu', score: 78, stability: 79, efficiency: 76, completed: 6, active: 1, trend: 'same', rank: 5 },
    ],
  },
  {
    id: '2',
    code: 'CE-202',
    name: 'Structural Mechanics II',
    professor: 'Prof. Sarah Chen',
    crew: 4,
    rating: 86,
    active: 0,
    done: 1,
    status: 'completed',
    avgStability: 87,
    avgEfficiency: 84,
    projectCode: 'SM2-2026',
    students: [
      { id: 's6', name: 'Lisa Park', initials: 'LP', email: 'lisa.park@students.civilcraft.edu', score: 94, stability: 96, efficiency: 93, completed: 9, active: 0, trend: 'up', rank: 1 },
      { id: 's7', name: 'Ryan Torres', initials: 'RT', email: 'ryan.torres@students.civilcraft.edu', score: 88, stability: 89, efficiency: 86, completed: 8, active: 0, trend: 'up', rank: 2 },
      { id: 's8', name: 'Nina Patel', initials: 'NP', email: 'nina.patel@students.civilcraft.edu', score: 83, stability: 85, efficiency: 81, completed: 7, active: 1, trend: 'down', rank: 3 },
      { id: 's9', name: 'Carlos Lee', initials: 'CL', email: 'carlos.lee@students.civilcraft.edu', score: 79, stability: 80, efficiency: 77, completed: 6, active: 0, trend: 'up', rank: 4 },
    ],
  },
  {
    id: '3',
    code: 'CE-303',
    name: 'Foundation Engineering',
    professor: 'Dr. Rachel Kim',
    crew: 6,
    rating: 91,
    active: 2,
    done: 3,
    status: 'active',
    avgStability: 93,
    avgEfficiency: 90,
    projectCode: 'FE-2026',
    students: [
      { id: 's10', name: 'Mia Zhang', initials: 'MZ', email: 'mia.zhang@students.civilcraft.edu', score: 96, stability: 97, efficiency: 95, completed: 10, active: 1, trend: 'up', rank: 1 },
      { id: 's11', name: 'Omar Hassan', initials: 'OH', email: 'omar.hassan@students.civilcraft.edu', score: 91, stability: 93, efficiency: 89, completed: 9, active: 0, trend: 'up', rank: 2 },
      { id: 's12', name: 'Zoe Williams', initials: 'ZW', email: 'zoe.williams@students.civilcraft.edu', score: 89, stability: 91, efficiency: 88, completed: 9, active: 1, trend: 'same', rank: 3 },
      { id: 's13', name: 'Ben Carter', initials: 'BC', email: 'ben.carter@students.civilcraft.edu', score: 85, stability: 87, efficiency: 83, completed: 8, active: 0, trend: 'up', rank: 4 },
      { id: 's14', name: 'Ava Mitchell', initials: 'AM', email: 'ava.mitchell@students.civilcraft.edu', score: 81, stability: 83, efficiency: 80, completed: 7, active: 0, trend: 'down', rank: 5 },
      { id: 's15', name: 'Jake Rivera', initials: 'JR', email: 'jake.rivera@students.civilcraft.edu', score: 77, stability: 79, efficiency: 75, completed: 6, active: 0, trend: 'up', rank: 6 },
    ],
  },
  {
    id: '4',
    code: 'CE-404',
    name: 'Fluid Mechanics Lab',
    professor: 'Unassigned',
    crew: 0,
    rating: 0,
    active: 0,
    done: 0,
    status: 'draft',
    avgStability: 0,
    avgEfficiency: 0,
    projectCode: 'FM-2026',
    students: [],
  },
];

/* ─── Helper Functions ───────────────────────────────────── */

function statusBadge(status: Section['status']) {
  const map = {
    active: 'bg-cyber-green/15 text-cyber-green border-cyber-green/30',
    completed: 'bg-blue-500/15 text-blue-600 border-blue-400/30',
    draft: 'bg-steel-100 text-steel-400 border-steel-200',
  };
  return map[status];
}



function initBg(initials: string) {
  const colors = [
    'bg-earth-700', 'bg-earth-600', 'bg-earth-500',
    'bg-blue-700', 'bg-blue-600', 'bg-teal-600',
  ];
  const idx = initials.charCodeAt(0) % colors.length;
  return colors[idx];
}

/* ─── Section Detail View ────────────────────────────────── */

function SectionDetail({ section, onBack }: { section: Section; onBack: () => void }) {
  const [search, setSearch] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const filtered = section.students.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

  const avgScore = section.students.length
    ? Math.round(section.students.reduce((a, b) => a + b.score, 0) / section.students.length)
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      {/* Back + Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-mono text-earth-600 hover:text-earth-800 transition-colors group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back
          </button>
          <div className="w-px h-5 bg-earth-200" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold bg-earth-700 text-white px-2 py-0.5 rounded">
                {section.code}
              </span>
              <h2 className="text-lg font-bold text-earth-800">{section.name}</h2>
              <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${statusBadge(section.status)}`}>
                {section.status}
              </span>
            </div>
            <p className="text-xs text-steel-400 font-mono mt-0.5">
              Section Code: {section.code} &nbsp;·&nbsp; Project Code: {section.projectCode} &nbsp;·&nbsp; {section.professor}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsUploadOpen(true)} 
            className="flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold text-white bg-earth-800 rounded hover:bg-earth-700 transition-all"
          >
            + Upload Students
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold text-earth-700 border border-earth-300 rounded hover:bg-earth-50 transition-all">
            <Download className="w-3.5 h-3.5" />
            Export Data
          </button>
        </div>
      </div>

      {/* Measurement divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-earth-200" />
        <span className="text-[10px] font-mono text-steel-300 tracking-widest">SECTION OVERVIEW</span>
        <div className="flex-1 h-px bg-earth-200" />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: section.crew, icon: Users, color: 'text-earth-700', bg: 'bg-earth-50' },
          { label: 'Average Score', value: avgScore, icon: Star, color: 'text-warning-orange', bg: 'bg-amber-50' },
          { label: 'Avg Stability', value: section.avgStability, icon: Shield, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Avg Efficiency', value: section.avgEfficiency, icon: Target, color: 'text-cyber-green', bg: 'bg-emerald-50' },
        ].map((stat) => (
          <BlueprintCard key={stat.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-steel-400">{stat.label}</p>
              <div className={`w-7 h-7 ${stat.bg} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-earth-800 font-mono">{stat.value}</p>
          </BlueprintCard>
        ))}
      </div>

      {/* Student Performance Table */}
      <BlueprintCard className="p-0 overflow-hidden">
        {/* Table Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-earth-100 bg-white/50">
          <div>
            <h3 className="text-sm font-bold text-earth-800">Student Performance</h3>
            <p className="text-[11px] text-steel-400 font-mono mt-0.5">Detailed view of all students in this section</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-steel-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs font-mono border border-earth-200 rounded bg-white text-earth-700 placeholder-steel-300 focus:outline-none focus:border-earth-400 w-44"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-blue-50/60 border-b border-blue-100">
                <th className="text-left px-5 py-3 text-[11px] font-mono font-bold text-steel-500 uppercase tracking-wider">Student</th>
                <th className="text-center px-4 py-3 text-[11px] font-mono font-bold text-steel-500 uppercase tracking-wider">Rank</th>
                <th className="text-center px-4 py-3 text-[11px] font-mono font-bold text-steel-500 uppercase tracking-wider">Overall Score</th>
                <th className="px-4 py-3 text-[11px] font-mono font-bold text-steel-500 uppercase tracking-wider">Stability</th>
                <th className="px-4 py-3 text-[11px] font-mono font-bold text-steel-500 uppercase tracking-wider">Efficiency</th>
                <th className="text-center px-4 py-3 text-[11px] font-mono font-bold text-steel-500 uppercase tracking-wider">Completed</th>
                <th className="text-center px-4 py-3 text-[11px] font-mono font-bold text-steel-500 uppercase tracking-wider">Trend</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-steel-300 text-sm font-mono">
                    No students found
                  </td>
                </tr>
              ) : (
                filtered.map((student, idx) => (
                  <tr
                    key={student.id}
                    className={`border-b border-earth-50 hover:bg-earth-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/30'}`}
                  >
                    {/* Student */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold font-mono flex-shrink-0 ${initBg(student.initials)}`}>
                          {student.initials}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-earth-800">{student.name}</p>
                          <p className="text-[11px] text-steel-400 font-mono">{student.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Rank */}
                    <td className="px-4 py-3.5 text-center">
                      <span className={`text-xs font-mono font-bold w-7 h-7 rounded-full flex items-center justify-center mx-auto
                        ${student.rank === 1 ? 'bg-amber-100 text-amber-700' : student.rank === 2 ? 'bg-steel-100 text-steel-600' : student.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-earth-50 text-earth-500'}`}>
                        #{student.rank}
                      </span>
                    </td>

                    {/* Overall Score */}
                    <td className="px-4 py-3.5 text-center">
                      <span className={`text-base font-bold font-mono
                        ${student.score >= 90 ? 'text-cyber-green' : student.score >= 80 ? 'text-warning-orange' : 'text-danger-red'}`}>
                        {student.score}
                      </span>
                    </td>

                    {/* Stability bar */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <div className="flex-1 h-2 bg-steel-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyber-green"
                            style={{ width: `${student.stability}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono font-bold text-cyber-green w-8 text-right">{student.stability}%</span>
                      </div>
                    </td>

                    {/* Efficiency bar */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <div className="flex-1 h-2 bg-steel-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                            style={{ width: `${student.efficiency}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono font-bold text-blue-600 w-8 text-right">{student.efficiency}%</span>
                      </div>
                    </td>

                    {/* Completed */}
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyber-green" />
                        <span className="text-sm font-mono font-bold text-earth-700">{student.completed}</span>
                      </div>
                    </td>

                    {/* Trend */}
                    <td className="px-4 py-3.5 text-center">
                      {student.trend === 'up' && (
                        <div className="flex items-center justify-center gap-0.5 text-cyber-green">
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                      )}
                      {student.trend === 'down' && (
                        <div className="flex items-center justify-center gap-0.5 text-danger-red">
                          <ArrowDownRight className="w-4 h-4" />
                        </div>
                      )}
                      {student.trend === 'same' && (
                        <div className="flex items-center justify-center">
                          <span className="text-[10px] font-mono text-steel-400">—</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        {section.students.length > 0 && (
          <div className="px-5 py-3 bg-earth-50/50 border-t border-earth-100 flex items-center justify-between">
            <span className="text-[11px] font-mono text-steel-400">
              Showing {filtered.length} of {section.students.length} students
            </span>
            <div className="flex items-center gap-1 text-[10px] font-mono text-steel-300">
              <div className="w-2 h-2 rounded-full bg-cyber-green" />
              <span>Stability</span>
              <div className="w-2 h-2 rounded-full bg-blue-500 ml-2" />
              <span>Efficiency</span>
            </div>
          </div>
        )}
      </BlueprintCard>

      {/* Performance Summary */}
      {section.students.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BlueprintCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-earth-600" />
              <h4 className="text-xs font-mono font-bold text-earth-700 uppercase tracking-wider">Score Distribution</h4>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Excellent (90+)', count: section.students.filter(s => s.score >= 90).length, color: 'bg-cyber-green' },
                { label: 'Good (80–89)', count: section.students.filter(s => s.score >= 80 && s.score < 90).length, color: 'bg-warning-orange' },
                { label: 'Average (70–79)', count: section.students.filter(s => s.score >= 70 && s.score < 80).length, color: 'bg-blue-400' },
                { label: 'Below 70', count: section.students.filter(s => s.score < 70).length, color: 'bg-danger-red' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-[11px] font-mono text-steel-500">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-steel-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`}
                        style={{ width: section.students.length ? `${(item.count / section.students.length) * 100}%` : '0%' }} />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-earth-700 w-4 text-right">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </BlueprintCard>

          <BlueprintCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-earth-600" />
              <h4 className="text-xs font-mono font-bold text-earth-700 uppercase tracking-wider">Completion Stats</h4>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] font-mono text-steel-500">Tasks Completed</span>
                  <span className="text-[11px] font-mono font-bold text-earth-700">
                    {section.students.reduce((a, b) => a + b.completed, 0)}
                  </span>
                </div>
                <div className="h-1.5 bg-steel-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-earth-400 to-earth-600 rounded-full" style={{ width: '82%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] font-mono text-steel-500">Active Tasks</span>
                  <span className="text-[11px] font-mono font-bold text-warning-orange">
                    {section.students.reduce((a, b) => a + b.active, 0)}
                  </span>
                </div>
                <div className="h-1.5 bg-steel-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-warning-orange/60 to-warning-orange rounded-full" style={{ width: '20%' }} />
                </div>
              </div>
              <div className="pt-2 border-t border-earth-100">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-steel-500">Avg Tasks/Student</span>
                  <span className="text-sm font-bold font-mono text-earth-800">
                    {section.students.length ? (section.students.reduce((a, b) => a + b.completed, 0) / section.students.length).toFixed(1) : '0'}
                  </span>
                </div>
              </div>
            </div>
          </BlueprintCard>

          <BlueprintCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4 text-earth-600" />
              <h4 className="text-xs font-mono font-bold text-earth-700 uppercase tracking-wider">Section Info</h4>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Section Code', value: section.code },
                { label: 'Project Code', value: section.projectCode },
                { label: 'Professor', value: section.professor.replace('Prof. ', '').replace('Dr. ', '') },
                { label: 'Status', value: section.status.toUpperCase() },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-1 border-b border-earth-50 last:border-0">
                  <span className="text-[11px] font-mono text-steel-400">{item.label}</span>
                  <span className="text-[11px] font-mono font-bold text-earth-700">{item.value}</span>
                </div>
              ))}
            </div>
          </BlueprintCard>
        </div>
      )}

      {/* Upload Students Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 bg-stone-900/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1c23] rounded-xl w-full max-w-lg p-6 shadow-xl relative border border-gray-800 animate-scale-in">
            <button onClick={() => setIsUploadOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
              ×
            </button>
            <h3 className="text-xl font-bold text-white mb-1">Upload Students - {section.code}</h3>
            <p className="text-xs text-gray-400 mb-6">Upload an Excel file containing student information to register them in the section.</p>

            <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 flex flex-col items-center justify-center bg-[#252836] hover:bg-[#2b2e3d] transition-colors cursor-pointer mb-6">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
                <Download className="w-8 h-8 text-indigo-400 transform rotate-180" />
              </div>
              <p className="text-base font-bold text-white mb-2">Upload Excel File</p>
              <p className="text-xs text-gray-400 mb-6">File should contain columns: Email, FirstName, LastName</p>
              
              <button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold text-sm px-6 py-2.5 rounded-full flex items-center gap-2 shadow-lg transition-transform hover:scale-105">
                <Download className="w-4 h-4 transform rotate-180" />
                Choose Excel File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Section Card (Project Card) ───────────────────────── */

function SectionCard({ section, onOpen }: { section: Section; onOpen: () => void }) {
  return (
    <BlueprintCard className="p-0 overflow-hidden flex flex-col hover:border-earth-300/60 transition-all glow-hover">
      {/* Card Top Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono font-bold bg-earth-700 text-white px-2.5 py-1 rounded">
            {section.code}
          </span>
          <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded border ${statusBadge(section.status)}`}>
            {section.status}
          </span>
        </div>

        <h3 className="text-base font-bold text-earth-800 leading-snug mb-1">{section.name}</h3>
        <p className="text-[11px] text-steel-400 font-mono">{section.professor}</p>
      </div>

      {/* Divider with wrench icon */}
      <div className="flex items-center px-4 py-1">
        <div className="flex-1 h-px bg-earth-100" />
        <Wrench className="w-3 h-3 text-earth-300 mx-2" />
        <div className="flex-1 h-px bg-earth-100" />
      </div>

      {/* Stats 2x2 grid */}
      <div className="grid grid-cols-2 gap-2 px-4 py-3 flex-1">
        {/* Crew */}
        <div className="bg-white border border-earth-100 rounded p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Users className="w-3 h-3 text-steel-400" />
            <span className="text-[9px] font-mono text-steel-400 uppercase tracking-wider">Crew</span>
          </div>
          <p className="text-xl font-bold font-mono text-earth-800">{section.crew}</p>
        </div>

        {/* Rating */}
        <div className="bg-white border border-earth-100 rounded p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-steel-400" />
            <span className="text-[9px] font-mono text-steel-400 uppercase tracking-wider">Rating</span>
          </div>
          <p className="text-xl font-bold font-mono text-earth-800">{section.rating || '—'}</p>
        </div>

        {/* Active */}
        <div className="bg-white border border-earth-100 rounded p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3 text-steel-400" />
            <span className="text-[9px] font-mono text-steel-400 uppercase tracking-wider">Active</span>
          </div>
          <p className="text-xl font-bold font-mono text-warning-orange">{section.active}</p>
        </div>

        {/* Done */}
        <div className="bg-white border border-earth-100 rounded p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <CheckCircle2 className="w-3 h-3 text-steel-400" />
            <span className="text-[9px] font-mono text-steel-400 uppercase tracking-wider">Done</span>
          </div>
          <p className="text-xl font-bold font-mono text-cyber-green">{section.done}</p>
        </div>
      </div>

      {/* Open button */}
      <button
        onClick={onOpen}
        disabled={section.students.length === 0}
        className={`w-full py-3 text-xs font-mono font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2
          ${section.students.length === 0
            ? 'bg-steel-100 text-steel-400 cursor-not-allowed'
            : 'bg-earth-800 hover:bg-earth-700 text-white cursor-pointer'
          }`}
      >
        {section.students.length === 0 ? 'No Students Yet' : <>Open Project <ArrowUpRight className="w-3.5 h-3.5" /></>}
      </button>
    </BlueprintCard>
  );
}

/* ─── Main Sections Page ─────────────────────────────────── */

export default function SectionsPage() {
  const { user } = useAuth();
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // If a section is selected, show its detail
  if (selectedSection) {
    return (
      <SectionDetail
        section={selectedSection}
        onBack={() => setSelectedSection(null)}
      />
    );
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isProfessor = user?.role === 'professor';

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">

      {/* Project Management Banner */}
      <BlueprintCard className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-earth-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-earth-700" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-earth-800">Project Management Center</h3>
            <p className="text-[11px] text-steel-400 font-mono">
              {isProfessor || isAdmin
                ? 'Manage your active projects below. Share project codes with your crew members to give them access to the construction site.'
                : 'View your assigned sections and track your progress across all active projects.'}
            </p>
          </div>
          {(isProfessor || isAdmin) && (
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold bg-earth-700 text-white rounded hover:bg-earth-600 transition-colors flex-shrink-0"
            >
              + New Section
            </button>
          )}
        </div>
      </BlueprintCard>

      {/* Measurement divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-earth-200" />
        <span className="text-[10px] font-mono text-steel-300 tracking-widest">
          {isAdmin ? 'ALL SECTIONS' : isProfessor ? 'MY PROJECTS' : 'MY SECTIONS'}
        </span>
        <div className="flex-1 h-px bg-earth-200" />
      </div>

      {/* Section Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-5">
        {SECTIONS.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            onOpen={() => setSelectedSection(section)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2">
        <span className="text-[10px] font-mono text-steel-300">LEGEND:</span>
        {[
          { label: 'Active', color: 'bg-cyber-green' },
          { label: 'Completed', color: 'bg-blue-500' },
          { label: 'Draft', color: 'bg-steel-300' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${item.color}`} />
            <span className="text-[10px] font-mono text-steel-400">{item.label}</span>
          </div>
        ))}
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#F5F2EA] rounded-xl w-full max-w-md p-6 shadow-xl relative animate-scale-in border border-earth-200">
            <button onClick={() => setIsCreateModalOpen(false)} className="absolute top-4 right-4 text-earth-400 hover:text-earth-600 transition-colors">
              ×
            </button>
            <h2 className="text-xl font-bold text-earth-800 mb-1">Create Section</h2>
            <p className="text-xs text-earth-500 mb-4">Create a new section and assign it to a professor.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold text-earth-400 mb-1 uppercase tracking-wider">Section Code</label>
                <input type="text" placeholder="CE101-S2026" className="w-full bg-[#5C3D2E] text-white px-3 py-2.5 rounded-lg text-sm placeholder-earth-300 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-mono font-bold text-earth-400 mb-1 uppercase tracking-wider">Section Name</label>
                <input type="text" placeholder="Structural Mechanics I" className="w-full bg-[#5C3D2E] text-white px-3 py-2.5 rounded-lg text-sm placeholder-earth-300 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-mono font-bold text-earth-400 mb-1 uppercase tracking-wider">Capacity</label>
                <input type="text" placeholder="25" className="w-full bg-[#5C3D2E] text-white px-3 py-2.5 rounded-lg text-sm placeholder-earth-300 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-mono font-bold text-earth-400 mb-1 uppercase tracking-wider">Select Professor</label>
                <select className="w-full bg-[#5C3D2E] text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option>Select a professor</option>
                  <option>Prof. Sarah Chen</option>
                  <option>Dr. Rachel Kim</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setIsCreateModalOpen(false)} className="px-5 py-2 text-sm font-bold text-white bg-[#5C3D2E] rounded-lg hover:bg-[#4a3124] transition-colors">
                Cancel
              </button>
              <button onClick={() => setIsCreateModalOpen(false)} className="px-5 py-2 text-sm font-bold text-white bg-[#5C3D2E] rounded-lg hover:bg-[#4a3124] transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
