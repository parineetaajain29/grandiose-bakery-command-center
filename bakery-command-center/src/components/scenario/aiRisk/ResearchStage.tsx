import { useState, type ReactNode } from 'react';
import type { AiGeography, AiRawMaterialFilter, AiResearchDepth, AiResearchParams, AiRiskType, AiTimeHorizon } from '../../../data/api';
import { BarChartIcon, BoxIcon, CalendarIcon, ChevronDownIcon, FileIcon, PinIcon, SearchIcon, SparkleIcon } from './icons';

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

const DEFAULTS = { horizon: '90d' as AiTimeHorizon, riskType: 'All' as AiRiskType, rawMaterial: 'All' as AiRawMaterialFilter, depth: 'quick' as AiResearchDepth, geography: 'UAE' as AiGeography };

function FilterSelect<T extends string>({
  label,
  icon,
  options,
  value,
  onChange,
  display,
}: {
  label: string;
  icon: ReactNode;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  display?: (v: T) => string;
}) {
  return (
    <div>
      <p className="font-sans text-xs font-medium text-text-secondary">{label}</p>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">{icon}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="w-full appearance-none rounded-lg border border-border-subtle bg-bg-panel py-2.5 pl-9 pr-9 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {display ? display(opt) : opt}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
          <ChevronDownIcon />
        </span>
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
  const [horizon, setHorizon] = useState<AiTimeHorizon>(DEFAULTS.horizon);
  const [riskType, setRiskType] = useState<AiRiskType>(DEFAULTS.riskType);
  const [rawMaterial, setRawMaterial] = useState<AiRawMaterialFilter>(DEFAULTS.rawMaterial);
  const [depth, setDepth] = useState<AiResearchDepth>(DEFAULTS.depth);
  const [geography, setGeography] = useState<AiGeography>(DEFAULTS.geography);
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

  function handleReset() {
    setHorizon(DEFAULTS.horizon);
    setRiskType(DEFAULTS.riskType);
    setRawMaterial(DEFAULTS.rawMaterial);
    setDepth(DEFAULTS.depth);
    setGeography(DEFAULTS.geography);
    setShowDetailedConfirm(false);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <h3 className="font-sans text-lg font-semibold text-text-primary">What would you like to investigate?</h3>

        {!configured && (
          <p className="mt-3 rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-3 py-2 font-sans text-sm text-accent-orange">
            Live research isn't configured — a manager or HR admin needs to add an OpenAI API key in Settings.
          </p>
        )}

        <div className="relative mt-4">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g. Analyse wheat supply risk for UAE bakeries over the next 90 days…"
            className="w-full rounded-lg border border-border-subtle bg-bg-primary py-3 pl-10 pr-32 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !question.trim() || !configured}
            className="absolute right-1.5 top-1.5 flex items-center gap-1.5 rounded-md bg-accent-blue px-3.5 py-1.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <SparkleIcon width={14} height={14} />
            {submitting ? 'Researching…' : 'Research'}
          </button>
        </div>

        <p className="mt-4 font-sans text-xs font-medium text-text-secondary">Try these example prompts:</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setQuestion(prompt)}
              className="rounded-full border border-border-subtle bg-bg-panel-raised px-3 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:border-accent-blue/50 hover:text-text-primary"
            >
              {prompt}
            </button>
          ))}
        </div>

        {showDetailedConfirm && (
          <div className="mt-4 rounded-lg border border-accent-orange/40 bg-accent-orange/10 p-3">
            <p className="font-sans text-sm text-accent-orange">
              Detailed Analysis uses more searches and costs more than Quick Scan or Standard. Continue?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-lg border border-accent-orange bg-accent-orange px-3 py-1.5 font-sans text-xs font-semibold text-[#04070d]"
              >
                Yes, run Detailed Analysis
              </button>
              <button
                type="button"
                onClick={() => setShowDetailedConfirm(false)}
                className="rounded-lg border border-border-subtle px-3 py-1.5 font-sans text-xs text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {errorMessage && <p className="mt-4 font-sans text-sm text-accent-red">{errorMessage}</p>}
      </section>

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h4 className="font-sans text-sm font-semibold text-text-primary">Research Parameters</h4>
          <button type="button" onClick={handleReset} className="font-sans text-xs font-medium text-accent-blue hover:underline">
            Reset
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <FilterSelect label="Time Horizon" icon={<CalendarIcon />} options={HORIZONS} value={horizon} onChange={setHorizon} />
          <FilterSelect label="Risk Type" icon={<BarChartIcon />} options={RISK_TYPES} value={riskType} onChange={setRiskType} />
          <FilterSelect label="Raw Material" icon={<BoxIcon />} options={RAW_MATERIALS} value={rawMaterial} onChange={setRawMaterial} />
          <FilterSelect label="Geography" icon={<PinIcon />} options={GEOGRAPHIES} value={geography} onChange={setGeography} />
          <FilterSelect
            label="Research Depth"
            icon={<FileIcon />}
            options={DEPTHS.map((d) => d.value)}
            value={depth}
            onChange={(v) => {
              setDepth(v);
              setShowDetailedConfirm(false);
            }}
            display={(v) => DEPTHS.find((d) => d.value === v)?.label ?? v}
          />
        </div>
      </section>
    </div>
  );
}
