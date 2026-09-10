import { describe, expect, it } from 'vitest';
import {
  aggregateLabourRecords,
  categorizeLoss,
  computeAllocatedRevenue,
  computeDepartmentRollup,
  computeLabourChain,
  computeTrendSeries,
  deriveProductiveMinutes,
  naiveMeanTrueEfficiencyPct,
  validateDailyLogInput,
  type DailyLogInput,
  type LabourRecord,
} from './labourCalc';

// Worked example — hand-verified: paid 540min (9h), break 35min, changeover 45min,
// downtime 20min, idle 65min, productive 410min (540 − 35 − 45 − 20 − 65 = 375?
// no — see below), salary 220 AED, revenue 1850 AED, 12 units.
//
// productive = paid − break − changeover − downtime − idle = 540 − 35 − 45 − 20 − 65 = 375
// (this replaces the old fixture's directly-typed productiveMinutes: 410 — the new
// invariant means productive and idle can't both be picked freely, so idle here is
// chosen to reproduce a comparable, hand-checkable productive figure.)
const dayA: LabourRecord = {
  paidMinutes: 540,
  breakMinutes: 35,
  changeoverMinutes: 45,
  downtimeMinutes: 20,
  idleMinutes: 65,
  productiveMinutes: 375,
  unitsProduced: 12,
  dailySalaryCost: 220,
  revenueAttributed: 1850,
  daysLogged: 1,
};

describe('computeLabourChain — worked example (breaksArePaid: true)', () => {
  const result = computeLabourChain(dayA, { breaksArePaid: true });

  it('does not deduct breaks from availableMinutes when breaks are paid', () => {
    expect(result.availableMinutes).toBe(475); // 540 − 45 − 20
  });

  it('passes through the reported idle/other figure unchanged', () => {
    expect(result.idleMinutes).toBe(65);
  });

  it('computes utilisation, true efficiency, and performance-while-working as distinct figures', () => {
    expect(result.utilisationPct).toBeCloseTo(87.96296296296296, 10);
    expect(result.trueEfficiencyPct).toBeCloseTo(69.44444444444444, 10); // 375 / 540
    expect(result.performanceWhileWorkingPct).toBeCloseTo(78.94736842105263, 10); // 375 / 475
    // Performance while working must exceed true efficiency whenever there's any
    // operational loss (changeover/downtime) — it excuses exactly that loss.
    expect(result.performanceWhileWorkingPct!).toBeGreaterThan(result.trueEfficiencyPct);
  });

  it('computes labour economics', () => {
    expect(result.costPerProductiveHour).toBeCloseTo(35.2, 10); // 220 / (375/60)
    expect(result.costPerUnit).toBeCloseTo(18.333333333333332, 10); // 220 / 12
    expect(result.revenuePerLabourDirham).toBeCloseTo(8.409090909090908, 10); // 1850 / 220
    expect(result.revenuePerDay).toBe(1850); // 1850 / 1 day logged
  });
});

describe('breaksArePaid flag changes downstream figures', () => {
  it('unpaid breaks shrink availableMinutes and every metric derived from it', () => {
    const paid = computeLabourChain(dayA, { breaksArePaid: true });
    const unpaid = computeLabourChain(dayA, { breaksArePaid: false });

    expect(unpaid.availableMinutes).toBe(440); // 540 − 35 − 45 − 20
    expect(unpaid.performanceWhileWorkingPct).toBeCloseTo(85.22727272727273, 10);

    // trueEfficiencyPct doesn't route through availableMinutes, so it's unaffected.
    expect(unpaid.trueEfficiencyPct).toBe(paid.trueEfficiencyPct);
    // performanceWhileWorkingPct does — unpaid breaks shrink the denominator, raising it.
    expect(unpaid.performanceWhileWorkingPct!).toBeGreaterThan(paid.performanceWhileWorkingPct!);
    expect(unpaid.availableMinutes).toBeLessThan(paid.availableMinutes);
  });
});

describe('aggregation uses SUM/SUM, never a mean of percentages (§12)', () => {
  // productive = 480 − 30 − 30 − 60 − 40 = 320
  const dayB: LabourRecord = {
    paidMinutes: 480,
    breakMinutes: 30,
    changeoverMinutes: 30,
    downtimeMinutes: 60,
    idleMinutes: 40,
    productiveMinutes: 320,
    unitsProduced: 10,
    dailySalaryCost: 200,
    revenueAttributed: 1400,
    daysLogged: 1,
  };
  const config = { breaksArePaid: true };

  it('the correct aggregated figure differs from the naive mean of individual days', () => {
    const chainA = computeLabourChain(dayA, config);
    const chainB = computeLabourChain(dayB, config);
    const naive = naiveMeanTrueEfficiencyPct([chainA, chainB]);
    expect(naive).toBeCloseTo(68.05555555555554, 10);

    const rollup = computeDepartmentRollup([dayA, dayB], config);
    // Hand-verified against summed minutes: paid 1020, available 865, productive 695.
    expect(rollup.paidMinutes).toBe(1020);
    expect(rollup.availableMinutes).toBe(865);
    expect(rollup.productiveMinutes).toBe(695);
    expect(rollup.trueEfficiencyPct).toBeCloseTo(68.13725490196079, 10);

    expect(rollup.trueEfficiencyPct).not.toBeCloseTo(naive!, 1);
  });

  it('aggregateLabourRecords sums every extensive field, including idleMinutes, unitsProduced, and daysLogged', () => {
    const agg = aggregateLabourRecords([dayA, dayB]);
    expect(agg.paidMinutes).toBe(1020);
    expect(agg.productiveMinutes).toBe(695);
    expect(agg.idleMinutes).toBe(105);
    expect(agg.unitsProduced).toBe(22);
    expect(agg.dailySalaryCost).toBe(420);
    expect(agg.revenueAttributed).toBe(3250);
    expect(agg.daysLogged).toBe(2);
  });
});

describe('computeTrendSeries — rolls up each period independently', () => {
  it('never mixes days across periods together', () => {
    const series = computeTrendSeries(
      [
        { period: '2026-08-01', records: [dayA] },
        { period: '2026-08-02', records: [dayA] },
      ],
      { breaksArePaid: true },
    );
    expect(series).toHaveLength(2);
    expect(series[0].result).toEqual(computeLabourChain(dayA, { breaksArePaid: true }));
    expect(series[1].result).toEqual(series[0].result);
  });
});

describe('zero/degenerate inputs never produce Infinity or NaN', () => {
  const zeroRecord: LabourRecord = {
    paidMinutes: 0,
    breakMinutes: 0,
    changeoverMinutes: 0,
    downtimeMinutes: 0,
    idleMinutes: 0,
    productiveMinutes: 0,
    unitsProduced: 0,
    dailySalaryCost: 0,
    revenueAttributed: 0,
    daysLogged: 0,
  };

  it('returns null (not Infinity/NaN) for every ratio when everything is zero', () => {
    const result = computeLabourChain(zeroRecord, { breaksArePaid: true });
    expect(result.paidMinutes).toBe(0);
    expect(result.utilisationPct).toBe(0);
    expect(result.trueEfficiencyPct).toBe(0);
    expect(result.performanceWhileWorkingPct).toBeNull();
    expect(result.costPerProductiveHour).toBeNull();
    expect(result.costPerUnit).toBeNull();
    expect(result.revenuePerLabourDirham).toBeNull();
    expect(result.revenuePerDay).toBeNull();
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'number') expect(Number.isNaN(value), `${key} was NaN`).toBe(false);
    }
  });

  it('performanceWhileWorkingPct is null when downtime/changeover consume the whole shift', () => {
    const consumed: LabourRecord = { ...dayA, changeoverMinutes: 300, downtimeMinutes: 240, idleMinutes: 0, productiveMinutes: 0 };
    // 540 - 300 - 240 = -60 available -> null, not a negative or Infinity ratio
    const result = computeLabourChain(consumed, { breaksArePaid: true });
    expect(result.availableMinutes).toBeLessThanOrEqual(0);
    expect(result.performanceWhileWorkingPct).toBeNull();
  });
});

describe('categorizeLoss — controllable vs operational split (§9)', () => {
  it('splits changeover+downtime as operational and idle/other as controllable', () => {
    const result = computeLabourChain(dayA, { breaksArePaid: true });
    const loss = categorizeLoss(result);
    expect(loss.operationalMinutes).toBe(65); // 45 changeover + 20 downtime
    expect(loss.controllableMinutes).toBe(65); // reported idleMinutes
    expect(loss.operationalSharePct).toBeCloseTo(50, 10);
  });

  it('clamps a negative idle figure (bad/legacy data) to zero rather than showing negative controllable loss', () => {
    // A pre-migration row backfilled with idle = paid − break − changeover − downtime − productive
    // can legitimately land negative if the old self-reported productive figure was inflated —
    // exactly the kind of bad data this feature exists to stop happening going forward.
    const badData: LabourRecord = { ...dayA, idleMinutes: -20 };
    const result = computeLabourChain(badData, { breaksArePaid: true });
    expect(result.idleMinutes).toBeLessThan(0);
    const loss = categorizeLoss(result);
    expect(loss.controllableMinutes).toBe(0);
  });

  it('returns null operationalSharePct when there is no loss at all', () => {
    const perfect: LabourRecord = { ...dayA, changeoverMinutes: 0, downtimeMinutes: 0, idleMinutes: 0, productiveMinutes: 540 };
    const result = computeLabourChain(perfect, { breaksArePaid: true });
    expect(result.idleMinutes).toBe(0);
    const loss = categorizeLoss(result);
    expect(loss.operationalSharePct).toBeNull();
  });
});

describe('deriveProductiveMinutes — the ledger identity (paid = break + changeover + downtime + idle + productive)', () => {
  it('computes productive as the remainder after every other category', () => {
    expect(deriveProductiveMinutes({ paidMinutes: 540, breakMinutes: 35, changeoverMinutes: 45, downtimeMinutes: 20, idleMinutes: 65 })).toBe(375);
  });

  it('is unaffected by breaksArePaid — break time is never productive, paid or not', () => {
    // deriveProductiveMinutes takes no config; break is always subtracted.
    expect(deriveProductiveMinutes({ paidMinutes: 540, breakMinutes: 35, changeoverMinutes: 0, downtimeMinutes: 0, idleMinutes: 0 })).toBe(505);
  });

  it('can go negative — callers (validateDailyLogInput) are responsible for rejecting that', () => {
    expect(deriveProductiveMinutes({ paidMinutes: 100, breakMinutes: 50, changeoverMinutes: 50, downtimeMinutes: 50, idleMinutes: 0 })).toBe(-50);
  });
});

describe('validateDailyLogInput — daily log validation (§8)', () => {
  const valid: DailyLogInput = {
    date: '2026-08-15',
    shift: 'Morning',
    paidMinutes: 540,
    breakMinutes: 35,
    changeoverMinutes: 45,
    downtimeMinutes: 20,
    idleMinutes: 65,
    activityType: 'production',
    unitsProduced: 12,
    downtimeCauseCode: 'Equipment failure',
    changeoverCauseCode: 'Product changeover',
  };

  it('accepts a valid record', () => {
    expect(validateDailyLogInput(valid)).toEqual([]);
  });

  it('rejects when logged categories exceed the paid shift duration (the old over-capacity example, now expressed via idle instead of a directly-typed productive figure)', () => {
    // 8h paid shift: break 1h + downtime 2h + changeover 1h + idle 5h = 9h logged loss alone — more than the 8h paid, so derived productive goes negative.
    const impossible: DailyLogInput = {
      ...valid,
      paidMinutes: 480,
      breakMinutes: 60,
      changeoverMinutes: 60,
      downtimeMinutes: 120,
      idleMinutes: 300,
    };
    const errors = validateDailyLogInput(impossible);
    expect(errors).toContain('Break, changeover, downtime, and idle minutes exceed the paid shift duration. Please review your entries.');
  });

  it('rejects negative values', () => {
    const bad: DailyLogInput = { ...valid, downtimeMinutes: -5 };
    expect(validateDailyLogInput(bad)).toContain('Downtime minutes must be a non-negative number.');
  });

  it('rejects an invalid shift', () => {
    const bad: DailyLogInput = { ...valid, shift: 'Afternoon' };
    expect(validateDailyLogInput(bad).some((e) => e.startsWith('Shift must be one of'))).toBe(true);
  });

  it('rejects zero or unrealistic paid hours', () => {
    expect(validateDailyLogInput({ ...valid, paidMinutes: 0 })).toContain('Paid hours must be greater than zero.');
    expect(validateDailyLogInput({ ...valid, paidMinutes: 1200 })).toContain('Paid hours looks unrealistic for a single shift (over 16 hours).');
  });

  it('rejects a malformed date', () => {
    const bad: DailyLogInput = { ...valid, date: '15-08-2026' };
    expect(validateDailyLogInput(bad)).toContain('Date must be a valid date (YYYY-MM-DD).');
  });

  it('rejects a production shift with no units produced', () => {
    const bad: DailyLogInput = { ...valid, unitsProduced: null };
    expect(validateDailyLogInput(bad)).toContain('Units produced is required for a production shift (or mark this as a non-production shift).');
  });

  it('exempts a non-production shift from requiring units produced', () => {
    const ok: DailyLogInput = { ...valid, activityType: 'non_production', unitsProduced: null };
    expect(validateDailyLogInput(ok)).toEqual([]);
  });

  it('rejects an invalid activity type', () => {
    const bad: DailyLogInput = { ...valid, activityType: 'vacation' };
    expect(validateDailyLogInput(bad).some((e) => e.startsWith('Shift type must be one of'))).toBe(true);
  });

  it('requires a downtime cause when downtime minutes are greater than zero', () => {
    const bad: DailyLogInput = { ...valid, downtimeCauseCode: null };
    expect(validateDailyLogInput(bad)).toContain('Downtime cause is required when downtime minutes are greater than zero.');
  });

  it('rejects a downtime cause outside the fixed list', () => {
    const bad: DailyLogInput = { ...valid, downtimeCauseCode: 'Employee was slow' };
    expect(validateDailyLogInput(bad).some((e) => e.startsWith('Downtime cause must be one of'))).toBe(true);
  });

  it('requires a changeover cause when changeover minutes are greater than zero', () => {
    const bad: DailyLogInput = { ...valid, changeoverCauseCode: null };
    expect(validateDailyLogInput(bad)).toContain('Changeover cause is required when changeover minutes are greater than zero.');
  });

  it('does not require either cause code when its minutes are zero', () => {
    const ok: DailyLogInput = { ...valid, downtimeMinutes: 0, changeoverMinutes: 0, downtimeCauseCode: null, changeoverCauseCode: null, idleMinutes: 130 };
    expect(validateDailyLogInput(ok)).toEqual([]);
  });
});

describe('computeAllocatedRevenue — support department revenue attribution (§A4)', () => {
  it('multiplies division revenue by allocation weight', () => {
    expect(computeAllocatedRevenue(1850000, 0.022)).toBeCloseTo(40700, 10);
  });

  it('is zero when the department has no allocation weight', () => {
    expect(computeAllocatedRevenue(1850000, 0)).toBe(0);
  });
});
