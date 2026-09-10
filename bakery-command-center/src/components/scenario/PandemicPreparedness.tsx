import { useMemo, useState } from 'react';
import { scenariosFile } from '../../data';
import { Slider } from './Slider';

const { pandemicPreparedness } = scenariosFile.scenarioResilience;
const { customerRetention, supplyChain } = pandemicPreparedness;

function StatusBadge({ flags }: { flags: string[] }) {
  const hasFlags = flags.length > 0;
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide ${
        hasFlags ? 'border-accent-red/40 text-accent-red' : 'border-accent-green/40 text-accent-green'
      }`}
    >
      {hasFlags ? 'Needs attention' : 'Within healthy range'}
    </span>
  );
}

/** Streamlit Module 3 — Pandemic Preparedness (app.py lines 2302-2337). No formula of its own — just threshold-based flags on the raw slider values, exactly as the source computes them. */
export function PandemicPreparedness() {
  const [repeatRate, setRepeatRate] = useState(customerRetention.repeatPurchaseRatePct.default);
  const [deliveryShare, setDeliveryShare] = useState(customerRetention.deliverySharePct.default);
  const [basketSize, setBasketSize] = useState(customerRetention.basketSizeAed.default);

  const [safetyDays, setSafetyDays] = useState(supplyChain.safetyStockDays.default);
  const [altSuppliers, setAltSuppliers] = useState(supplyChain.alternateSuppliersPerIngredient.default);
  const [singleSourced, setSingleSourced] = useState(supplyChain.singleSourcedPct.default);

  const retentionFlags = useMemo(() => {
    const flags: string[] = [];
    if (repeatRate < customerRetention.repeatPurchaseFlagBelow) flags.push('Repeat-purchase rate below healthy baseline');
    if (deliveryShare < customerRetention.deliveryShareFlagBelow) flags.push('Delivery share low — limited resilience to footfall shocks');
    return flags;
  }, [repeatRate, deliveryShare]);

  const supplyFlags = useMemo(() => {
    const flags: string[] = [];
    if (safetyDays < supplyChain.safetyStockFlagBelow) flags.push('Safety stock below 7-day resilience threshold');
    if (altSuppliers < supplyChain.alternateSuppliersFlagBelow) flags.push('Fewer than 2 qualified alternates — concentration risk');
    if (singleSourced > supplyChain.singleSourcedFlagAbove) flags.push('Over 40% of ingredients single-sourced');
    return flags;
  }, [safetyDays, altSuppliers, singleSourced]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">🦠 PANDEMIC PREPAREDNESS</p>
        <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Two linked panels</h3>
        <p className="mt-1 max-w-2xl font-mono text-xs text-text-secondary">
          Customer retention/attraction (demand side) and supply chain optimization (supply side).
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border-subtle p-5">
            <div className="flex items-center justify-between">
              <h4 className="font-sans text-sm font-semibold text-text-primary">👥 Customer retention / attraction</h4>
              <StatusBadge flags={retentionFlags} />
            </div>
            <div className="mt-4 flex flex-col gap-4">
              <Slider id="pan-repeat" label="REPEAT-PURCHASE RATE (%)" value={repeatRate} min={customerRetention.repeatPurchaseRatePct.min} max={customerRetention.repeatPurchaseRatePct.max} unit="%" onChange={setRepeatRate} />
              <Slider id="pan-delivery" label="DELIVERY/ONLINE-ORDER REVENUE SHARE (%)" value={deliveryShare} min={customerRetention.deliverySharePct.min} max={customerRetention.deliverySharePct.max} unit="%" onChange={setDeliveryShare} />
              <Slider id="pan-basket" label="AVERAGE BASKET SIZE (AED)" value={basketSize} min={customerRetention.basketSizeAed.min} max={customerRetention.basketSizeAed.max} onChange={setBasketSize} />
            </div>
            {retentionFlags.map((f) => (
              <p key={f} className="mt-2 font-mono text-xs text-accent-red">
                ⚠️ {f}
              </p>
            ))}
          </div>

          <div className="rounded-lg border border-border-subtle p-5">
            <div className="flex items-center justify-between">
              <h4 className="font-sans text-sm font-semibold text-text-primary">🚚 Supply chain optimization</h4>
              <StatusBadge flags={supplyFlags} />
            </div>
            <div className="mt-4 flex flex-col gap-4">
              <Slider id="pan-safety" label="SAFETY STOCK (DAYS OF COVER)" value={safetyDays} min={supplyChain.safetyStockDays.min} max={supplyChain.safetyStockDays.max} unit="d" onChange={setSafetyDays} />
              <Slider id="pan-alt" label="QUALIFIED ALTERNATE SUPPLIERS / KEY INGREDIENT" value={altSuppliers} min={supplyChain.alternateSuppliersPerIngredient.min} max={supplyChain.alternateSuppliersPerIngredient.max} onChange={setAltSuppliers} />
              <Slider id="pan-single" label="% INGREDIENTS SINGLE-SOURCED" value={singleSourced} min={supplyChain.singleSourcedPct.min} max={supplyChain.singleSourcedPct.max} unit="%" onChange={setSingleSourced} />
            </div>
            {supplyFlags.map((f) => (
              <p key={f} className="mt-2 font-mono text-xs text-accent-red">
                ⚠️ {f}
              </p>
            ))}
          </div>
        </div>

        <p className="mt-5 font-mono text-[11px] text-text-secondary">{pandemicPreparedness.context}</p>
      </section>
    </div>
  );
}
