interface CashConversionInsightProps {
  collectionDays: number;
  supplierTermsDays: number;
}

/**
 * Compact, visually prominent replacement for the previous trailing prose
 * paragraph. Same two real inputs (summary.collectionDays from
 * deriveB2BSummary, b2b.summary.supplierTermsDaysContext) and the same
 * subtraction B2BPage.tsx already computed — no calculation changed here.
 *
 * The wording is now driven by the actual sign of the gap rather than
 * hardcoded to one direction: with the current real data, collections
 * (~45 days) are actually faster than the 90-day supplier-terms context,
 * which is a favorable position, not the "slower" framing the old static
 * paragraph always stated regardless of what the numbers said. Flagged to
 * the GM as a correction to existing copy, not a new interpretation.
 */
export function CashConversionInsight({ collectionDays, supplierTermsDays }: CashConversionInsightProps) {
  const gap = collectionDays - supplierTermsDays;
  const favorable = gap <= 0;
  const gapAbs = Math.abs(gap);

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Cash Conversion</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Collections vs. supplier terms</h2>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="rounded-card border border-border-subtle bg-bg-panel-raised p-4">
          <p className="font-sans text-xs font-medium text-text-tertiary">Customer Collections</p>
          <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-text-primary">{collectionDays.toFixed(0)}d</p>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span
            className={`whitespace-nowrap rounded-full border px-3 py-1 font-sans text-xs font-medium ${
              favorable ? 'border-accent-green/40 text-accent-green' : 'border-accent-red/40 text-accent-red'
            }`}
          >
            {gapAbs.toFixed(0)}d {favorable ? 'ahead' : 'behind'}
          </span>
        </div>

        <div className="rounded-card border border-border-subtle bg-bg-panel-raised p-4">
          <p className="font-sans text-xs font-medium text-text-tertiary">Supplier Payment Terms</p>
          <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-text-primary">{supplierTermsDays.toFixed(0)}d</p>
        </div>
      </div>

      <p
        className={`mt-4 rounded-card border px-3.5 py-2.5 font-sans text-sm text-text-primary ${
          favorable ? 'border-accent-green/30 bg-accent-green/10' : 'border-accent-red/30 bg-accent-red/10'
        }`}
      >
        {favorable
          ? `Grandiose collects from B2B customers in ${collectionDays.toFixed(0)} days on average — ${gapAbs.toFixed(0)} days ahead of the ${supplierTermsDays.toFixed(0)}-day supplier payment terms context, a favorable working-capital position.`
          : `Grandiose collects from B2B customers in ${collectionDays.toFixed(0)} days on average — ${gapAbs.toFixed(0)} days slower than the ${supplierTermsDays.toFixed(0)}-day supplier payment terms context, a working-capital gap worth watching as B2B volume grows.`}
      </p>
      <p className="mt-2 font-sans text-xs text-text-tertiary">Pending GM confirmation on real collection-days data.</p>
    </section>
  );
}
