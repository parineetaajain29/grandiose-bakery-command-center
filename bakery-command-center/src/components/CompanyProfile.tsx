import { scenariosFile } from '../data';
import { GM_PRODUCTIVITY_BENCHMARK_AED_PER_DAY } from '../config/labourConfig';
import { DataSourceBadge } from './shared/DataSourceBadge';

const { companyProfile } = scenariosFile;

/**
 * Ported from the Streamlit Company Profile page (app.py lines 2921-2998).
 * Unlike Command Center / Scenario & Resilience, this content is GM-meeting
 * material, not placeholder data — see scenarios.json's companyProfile._note
 * for the one disclosed content edit (a dated "next steps" section trimmed).
 */
export function CompanyProfile() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-sans text-xs font-medium text-text-tertiary">Company Profile</p>
          <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Grandiose Bakery / Flour Country</h2>
        </div>
        <DataSourceBadge source="gm-confirmed" />
      </div>
      <p className="max-w-2xl font-sans text-xs text-text-secondary">{companyProfile.meetingCaption}</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {companyProfile.sections.map((section) =>
          section.title === 'Productivity benchmark' ? (
            <section key={section.title} className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
              <h3 className="font-sans text-base font-semibold text-text-primary">{section.title}</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-sans font-tabular text-3xl font-semibold text-accent-blue">AED {GM_PRODUCTIVITY_BENCHMARK_AED_PER_DAY.toLocaleString('en-AE')}</span>
                <span className="font-sans text-xs text-text-secondary">/ employee / day</span>
              </div>
              <ul className="mt-4 flex flex-col gap-2">
                {section.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm text-text-secondary">
                    <span className="text-text-secondary">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section key={section.title} className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
              <h3 className="font-sans text-base font-semibold text-text-primary">{section.title}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {section.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm text-text-secondary">
                    <span className="text-text-secondary">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
