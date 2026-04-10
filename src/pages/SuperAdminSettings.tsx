import { useState } from 'react';
import { Save, SlidersHorizontal, ShieldCheck, Gauge } from 'lucide-react';
import BlueprintCard from '../components/BlueprintCard';

type Config = {
  stabilityWeight: number;
  efficiencyWeight: number;
  complexityWeight: number;
  budgetLimit: number;
  loadLimit: number;
  timeConstraint: number;
};

export default function SuperAdminSettings() {
  const [config, setConfig] = useState<Config>({
    stabilityWeight: 40,
    efficiencyWeight: 35,
    complexityWeight: 25,
    budgetLimit: 100,
    loadLimit: 120,
    timeConstraint: 45,
  });
  const [savedAt, setSavedAt] = useState<string>('');

  const update = (key: keyof Config, value: number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSavedAt(new Date().toLocaleTimeString());
  };

  const totalWeight = config.stabilityWeight + config.efficiencyWeight + config.complexityWeight;

  return (
    <div className="animate-fade-in-up space-y-6 p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <BlueprintCard className="p-5">
            <div className="mb-5 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-earth-600" />
              <h3 className="text-sm font-bold text-earth-800">Scoring Weights</h3>
            </div>
            <p className="mb-4 text-xs text-steel-500">Configure global scoring priorities applied to all sections and challenges.</p>

            <div className="space-y-4">
              {[
                { key: 'stabilityWeight', label: 'Stability', value: config.stabilityWeight },
                { key: 'efficiencyWeight', label: 'Efficiency', value: config.efficiencyWeight },
                { key: 'complexityWeight', label: 'Complexity', value: config.complexityWeight },
              ].map((row) => (
                <div key={row.key}>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-steel-500">{row.label}</label>
                    <span className="text-xs font-mono font-bold text-earth-700">{row.value}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={row.value}
                    onChange={(e) => update(row.key as keyof Config, Number(e.target.value))}
                    className="w-full accent-earth-600"
                  />
                </div>
              ))}
            </div>

            <div className={`mt-4 rounded border px-3 py-2 text-xs font-mono ${totalWeight === 100 ? 'border-cyber-green/30 bg-cyber-green/10 text-cyber-green' : 'border-warning-orange/30 bg-warning-orange/10 text-warning-orange'}`}>
              Total weight = {totalWeight}% {totalWeight === 100 ? '(balanced)' : '(should be 100%)'}
            </div>
          </BlueprintCard>

          <BlueprintCard className="p-5">
            <div className="mb-5 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-earth-600" />
              <h3 className="text-sm font-bold text-earth-800">Difficulty Parameters</h3>
            </div>
            <p className="mb-4 text-xs text-steel-500">Global constraints for budget, load limits, and timed challenge execution.</p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-steel-500">Budget Limit (%)</span>
                <input
                  type="number"
                  value={config.budgetLimit}
                  onChange={(e) => update('budgetLimit', Number(e.target.value))}
                  className="w-full rounded border border-earth-200 bg-earth-50/60 px-3 py-2 text-sm text-earth-800"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-steel-500">Load Limit (%)</span>
                <input
                  type="number"
                  value={config.loadLimit}
                  onChange={(e) => update('loadLimit', Number(e.target.value))}
                  className="w-full rounded border border-earth-200 bg-earth-50/60 px-3 py-2 text-sm text-earth-800"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-steel-500">Time Constraint (min)</span>
                <input
                  type="number"
                  value={config.timeConstraint}
                  onChange={(e) => update('timeConstraint', Number(e.target.value))}
                  className="w-full rounded border border-earth-200 bg-earth-50/60 px-3 py-2 text-sm text-earth-800"
                />
              </label>
            </div>
          </BlueprintCard>
        </div>

        <div className="space-y-6">
          <BlueprintCard className="p-5 bg-earth-800 border-earth-600/40">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-earth-300" />
              <h3 className="text-sm font-bold text-earth-200">Platform Integrity</h3>
            </div>
            <div className="space-y-3 text-xs font-mono">
              {[
                'Account management policies enforced',
                'Role assignment audit trail active',
                'Automated system monitoring online',
                'Daily integrity checks passing',
              ].map((line) => (
                <p key={line} className="text-earth-200/80">- {line}</p>
              ))}
            </div>
          </BlueprintCard>

          <BlueprintCard className="p-5">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex w-full items-center justify-center gap-2 rounded bg-earth-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-earth-700"
            >
              <Save className="h-4 w-4" /> Save Global Configuration
            </button>
            <p className="mt-3 text-xs font-mono text-steel-400">
              {savedAt ? `Last saved at ${savedAt}` : 'No unsaved changes committed yet.'}
            </p>
          </BlueprintCard>
        </div>
      </div>
    </div>
  );
}
