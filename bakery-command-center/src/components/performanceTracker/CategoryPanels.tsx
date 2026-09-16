import type { CategoryPanel } from '../../data/types';

interface CategoryPanelsProps {
  panels: CategoryPanel[];
}

/** Streamlit category_panels (app.py lines 505-526) — literal label/value pairs, no formulas. */
export function CategoryPanels({ panels }: CategoryPanelsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {panels.map((panel) => (
        <div key={panel.title} className="rounded-card border border-border-subtle bg-bg-panel p-5">
          <h3 className="font-sans text-sm font-semibold text-text-primary">{panel.title}</h3>
          <dl className="mt-3 flex flex-col gap-2.5">
            {panel.metrics.map((m) => (
              <div key={m.label}>
                <dt className="font-sans text-[11px] font-medium text-text-tertiary">{m.label}</dt>
                <dd className="font-sans font-tabular text-sm font-semibold text-text-primary">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
