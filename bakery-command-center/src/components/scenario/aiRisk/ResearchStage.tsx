import { useState } from 'react';
import type { AiGeography, AiRawMaterialFilter, AiResearchDepth, AiResearchParams, AiRiskType, AiTimeHorizon } from '../../../data/api';

const SUGGESTED_PROMPTS = [
  'Wheat supply risk',
  'Red Sea shipping disruption',
  'Cocoa price outlook',
  'Dairy/butter price outlook',
  'Geopolitical risk to UAE food imports',
  'Which bakery raw materials should concern us most over the next 90 days?',
];

const HORIZONS: AiTimeHorizon[] = ['7d', '30d', '90d', '6mo', '12mo'];
const RISK_TYPES: AiRiskType[] = ['All', 'Commodity', 'Geopolitical', 'Supply Chain', 'Logistics', 'Supplier', 'Climate', 'Regulatory', 'FX'];
const RAW_MATERIALS: AiRawMaterialFilter[] = ['All', 'Wheat-Flour', 'Butter-Dairy', 'Sugar', 'Cocoa', 'Nuts', 'Oils', 'Eggs', 'Yeast', 'Packaging'];
const GEOGRAPHIES: AiGeography[] = ['Global', 'UAE', 'GCC', 'Europe', 'Black Sea', 'Asia'];
const DEPTHS: { value: AiResearchDepth; label: string }[] = [
  { value: 'quick', label: 'Quick Scan' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed Analysis' },
];

function SelectPills<T extends string>({ label, options, value, onChange }: { label: string; options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.12em] text-text-secondary">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              value === opt ? 'border-accent-blue text-accent-blue' : 'border-border-subtle text-text-secondary hover:text-text-primary'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ResearchStageProps {
  configured: boolean;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (params: AiResearchParams, forceRefresh: boolean) => void;
}

/** Stage 1 of 3 — the only stage visible until a search runs. */
export function ResearchStage({ configured, submitting, errorMessage, onSubmit }: ResearchStageProps) {
  const [question, setQuestion] = useState('');
  const [horizon, setHorizon] = useState<AiTimeHorizon>('90d');
  const [riskType, setRiskType] = useState<AiRiskType>('All');
  const [rawMaterial, setRawMaterial] = useState<AiRawMaterialFilter>('All');
  const [depth, setDepth] = useState<AiResearchDepth>('quick');
  const [geography, setGeography] = useState<AiGeography>('UAE');
  const [showDetailedConfirm, setShowDetailedConfirm] = useState(false);

  function handleSubmit() {
    if (!question.trim()) return;
    if (depth === 'detailed' && !showDetailedConfirm) {
      setShowDetailedConfirm(true);
      return;
    }
    setShowDetailedConfirm(false);
    onSubmit({ question: question.trim(), horizon, riskType, rawMaterial, depth, geography }, false);
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">STAGE 1 OF 3 — RESEARCH</p>
      <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">What would you like to investigate?</h3>

      {!configured && (
        <p className="mt-3 rounded-lg border border-accent-orange/40 px-3 py-2 font-mono text-xs text-accent-orange">
          Live research isn't configured — a manager or HR admin needs to add an OpenAI API key in Settings.
        </p>
      )}

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="e.g. What's the outlook for wheat flour costs over the next 90 days?"
        rows={2}
        className="mt-4 w-full resize-none rounded-lg border border-border-subtle bg-bg-primary px-3.5 py-2.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setQuestion(prompt)}
            className="rounded-full border border-border-subtle px-2.5 py-1 font-mono text-[11px] text-text-secondary transition-colors hover:border-accent-blue/50 hover:text-text-primary"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SelectPills label="TIME HORIZON" options={HORIZONS} value={horizon} onChange={setHorizon} />
        <SelectPills label="RISK TYPE" options={RISK_TYPES} value={riskType} onChange={setRiskType} />
        <SelectPills label="RAW MATERIAL" options={RAW_MATERIALS} value={rawMaterial} onChange={setRawMaterial} />
        <SelectPills
          label="DEPTH"
          options={DEPTHS.map((d) => d.value)}
          value={depth}
          onChange={(v) => {
            setDepth(v);
            setShowDetailedConfirm(false);
          }}
        />
        <SelectPills label="GEOGRAPHY" options={GEOGRAPHIES} value={geography} onChange={setGeography} />
      </div>

      {showDetailedConfirm && (
        <div className="mt-4 rounded-lg border border-accent-orange/40 bg-bg-primary/40 p-3">
          <p className="font-mono text-xs text-accent-orange">
            Detailed Analysis uses more searches and costs more than Quick Scan or Standard. Continue?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-lg border border-accent-orange bg-accent-orange px-3 py-1.5 font-mono text-xs font-semibold text-[#04070d]"
            >
              Yes, run Detailed Analysis
            </button>
            <button
              type="button"
              onClick={() => setShowDetailedConfirm(false)}
              className="rounded-lg border border-border-subtle px-3 py-1.5 font-mono text-xs text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {errorMessage && <p className="mt-4 font-mono text-xs text-accent-red">{errorMessage}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !question.trim() || !configured}
        className="mt-5 rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-mono text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Researching…' : 'Research'}
      </button>
    </section>
  );
}
