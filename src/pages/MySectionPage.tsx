import BlueprintCard from '../components/BlueprintCard';
import { BookOpen, AlertTriangle } from 'lucide-react';

export default function MySectionPage() {
  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in-up">
      {/* ── Main Section Card ── */}
      <BlueprintCard className="overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-earth-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-earth-800 tracking-tight">CE-101: Structural Mechanics</h2>
            <p className="text-sm text-earth-600 mt-1">Professor: [Not Assigned]</p>
          </div>
          <div className="bg-earth-50 border border-earth-200 px-4 py-3 rounded sm:text-right w-full sm:w-auto">
            <p className="text-[10px] text-earth-500 font-mono uppercase tracking-wider mb-0.5">Site Code</p>
            <p className="text-sm font-bold text-earth-800 font-mono">CE101-S2026</p>
          </div>
        </div>
        
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <BookOpen className="w-5 h-5 text-earth-600" />
            <h3 className="text-sm font-bold text-earth-800 tracking-tight">ENGINEER PERFORMANCE</h3>
          </div>
          <p className="text-xs text-steel-500 mb-6 font-mono">Track your progress compared to crew members</p>

          <div className="hidden md:grid grid-cols-6 gap-4 text-[11px] font-bold text-earth-600 font-mono uppercase tracking-wider mb-2 border-b border-earth-200 pb-2">
            <div>RANK</div>
            <div>ENGINEER</div>
            <div>OVERALL SCORE</div>
            <div>STABILITY</div>
            <div>EFFICIENCY</div>
            <div>STATUS</div>
          </div>

          {/* Mobile-friendly column labels */}
          <div className="grid grid-cols-2 gap-2 md:hidden text-[10px] font-bold text-earth-600 font-mono uppercase tracking-wider mb-4">
            <div className="bg-earth-50 border border-earth-200 rounded px-2 py-1.5">Rank</div>
            <div className="bg-earth-50 border border-earth-200 rounded px-2 py-1.5">Engineer</div>
            <div className="bg-earth-50 border border-earth-200 rounded px-2 py-1.5">Overall Score</div>
            <div className="bg-earth-50 border border-earth-200 rounded px-2 py-1.5">Stability</div>
            <div className="bg-earth-50 border border-earth-200 rounded px-2 py-1.5">Efficiency</div>
            <div className="bg-earth-50 border border-earth-200 rounded px-2 py-1.5">Status</div>
          </div>

          <div className="py-6 sm:py-8 flex flex-col items-center justify-center text-steel-400 gap-2 text-center">
            <AlertTriangle className="w-8 h-8 opacity-50" />
            <p className="text-sm font-mono">No performance data available.</p>
          </div>
        </div>
      </BlueprintCard>

      {/* ── My Build History ── */}
      <div className="bg-earth-800 text-white rounded-sm p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div>
          <h3 className="text-lg font-bold tracking-tight">My Build History</h3>
          <p className="text-xs text-earth-300 mt-1 font-mono tracking-wide">View your completed assignments and performance records</p>
        </div>
        <div className="bg-cyber-green text-white px-4 py-2 rounded text-sm font-bold font-mono">
          0 Completed
        </div>
      </div>
    </div>
  );
}
