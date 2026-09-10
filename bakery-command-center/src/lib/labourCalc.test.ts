import { describe, expect, it } from 'vitest';
import {
  aggregateLabourRecords,
  categorizeLoss,
  computeAllocatedRevenue,
  computeDepartmentRollup,
  computeLabourChain,
  computeTrendSeries,
  naiveMeanTrueEfficiencyPct,
  validateDailyLogInput,
  type DailyLogInput,
  type LabourRecord,
} from './labourCalc';

// Worked example — hand-verified: paid 540min (9h), break 35min, changeover 45min,
// downtime 20min, productive 410min, salary 220 AED, revenue 1850 AED.
const dayA: LabourRecord = {
  paidMinutes: 540,
  breakMinutes: 35,
  changeoverMinutes: 45,
  downtimeMinutes: 20,
  productiveMinutes: 410,
  dailySalaryCost: 220,
  revenueAttributed: 1850,
  daysLogged: 1,
};

describe('computeLabourChain — worked example (breaksArePaid: true)', () => {
  const result = computeLabourChain(dayA, { breaksArePaid: true });

  it('does not deduct breaks from availableMinutes when breaks are paid', () => {
    expect(result.availableMinutes).toBe(475); // 540 − 45 − 20
  });

  it('computes the idle/other residual', () => {
    expect(result.idleMinutes).toBe(65); // 475 − 410
  });

  it('computes utilisation, true efficiency, and performance-while-working as distinct figures', () => {
    expect(result.utilisationPct).toBeCloseTo(87.96296296296296, 10);
    expect(result.trueEfficiencyPct).toBeCloseTo(75.92592592592592, 10);
    expect(result.performanceWhileWorkingPct).toBeCloseTo(86.31578947368422, 10);
    // Performance while working must exceed true efficiency whenever there's any
    // operational loss (changeover/downtime) — it excuses exactly that loss.
    expect(result.performanceWhileWorkingPct!).toBeGreaterThan(result.trueEfficiencyPct);
  });

  it('computes labour economics', () => {
    expect(result.costPerProductiveHour).toBeCloseTo(32.19512195121951, 10); // 220 / (410/60)
    expect(result.revenuePerLabourDirham).toBeCloseTo(8.409090909090908, 10); // 1850 / 220
    expect(result.revenuePerDay).toBe(1850); // 1850 / 1 day logged
  });
});

describe('breaksArePaid flag changes downstream figures', () => {
  it('unpaid breaks shrink availableMinutes and every metric derived from it', () => {
    const paid = computeLabourChain(dayA, { breaksArePaid: true });
    const unpaid = computeLabourChain(dayA, { breaksArePaid: false });

    expect(unpaid.availableMinutes).toBe(440); // 540 − 35 − 45 − 20
    expect(unpaid.performanceWhileWorkingPct).toBeCloseTo(93.18181818181817, 10);

    // trueEfficiencyPct doesn't route through availableMinutes, so it's unaffected.
    expect(unpaid.trueEfficiencyPct).toBe(paid.trueEfficiencyPct);
    // performanceWhileWorkingPct does — unpaid breaks shrink the denominator, raising it.
    expect(unpaid.performanceWhileWorkingPct!).toBeGreaterThan(paid.performanceWhileWorkingPct!);
    expect(unpaid.availableMinutes).toBeLessThan(paid.availableMinutes);
  });
});

describe('aggregation uses SUM/SUM, never a mean of percentages (§12)', () => {
  const dayB: LabourRecord = {
    paidMinutes: 480,
    breakMinutes: 30,
    changeoverMinutes: 30,
    downtimeMinutes: 60,
    productiveMinutes: 320,
    dailySalaryCost: 200,
    revenueAttributed: 1400,
    daysLogged: 1,
  };
  const config = { breaksArePaid: true };

  it('the correct aggregated figure differs from the naive mean of individual days', () => {
    const chainA = computeLabourChain(dayA, config);
    const chainB = computeLabourChain(dayB, config);
    const naive = naiveMeanTrueEfficiencyPct([chainA, chainB]);
    expect(naive).toBeCloseTo(71.29629629629629, 10);

    const rollup = computeDepartmentRollup([dayA, dayB], config);
    // Hand-verified against summed minutes: paid 1020, available 865, productive 730.
    expect(rollup.paidMinutes).toBe(1020);
    expect(rollup.availableMinutes).toBe(865);
    expect(rollup.productiveMinutes).toBe(730);
    expect(rollup.trueEfficiencyPct).toBeCloseTo(71.56862745098039, 10);

    expect(rollup.trueEfficiencyPct).not.toBeCloseTo(naive!, 1);
  });

  it('aggregateLabourRecords sums every extensive field, including daysLogged', () => {
    const agg = aggregateLabourRecords([dayA, dayB]);
    expect(agg.paidMinutes).toBe(1020);
    expect(agg.productiveMinutes).toBe(730);
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
    productiveMinutes: 0,
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
    expect(result.revenuePerLabourDirham).toBeNull();
    expect(result.revenuePerDay).toBeNull();
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'number') expect(Number.isNaN(value), `${key} was NaN`).toBe(false);
    }
  });

  it('performanceWhileWorkingPct is null when downtime/changeover consume the whole shift', () => {
    const consumed: LabourRecord = { ...dayA, changeoverMinutes: 300, downtimeMinutes: 240, productiveMinutes: 0 };
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
    expect(loss.controllableMinutes).toBe(65); // idleMinutes residual
    expect(loss.operationalSharePct).toBeCloseTo(50, 10);
  });

  it('clamps a negative idle residual to zero rather than showing negative controllable loss', () => {
    // 540 paid − 400 changeover − 200 downtime = −60 available (bad/legacy data)
    const badData: LabourRecord = { ...dayA, changeoverMinutes: 400, downtimeMinutes: 200, productiveMinutes: 0 };
    const result = computeLabourChain(badData, { breaksArePaid: true });
    expect(result.idleMinutes).toBeLessThan(0);
    const loss = categorizeLoss(result);
    expect(loss.controllableMinutes).toBe(0);
  });

  it('returns null operationalSharePct when there is no loss at all', () => {
    // breaksArePaid: true means availableMinutes = paidMinutes (540) with no changeover/downtime.
    const perfect: LabourRecord = { ...dayA, changeoverMinutes: 0, downtimeMinutes: 0, productiveMinutes: 540 };
    const result = computeLabourChain(perfect, { breaksArePaid: true });
    expect(result.idleMinutes).toBe(0);
    const loss = categorizeLoss(result);
    expect(loss.operationalSharePct).toBeNull();
  });
});

describe('validateDailyLogInput — daily log validation (§8)', () => {
  const config = { breaksArePaid: true };
  const valid: DailyLogInput = {
    date: '2026-08-15',
    shift: 'Morning',
    paidMinutes: 540,
    breakMinutes: 35,
    changeoverMinutes: 45,
    downtimeMinutes: 20,
    productiveMinutes: 410,
    unitsProduced: 120,
  };

  it('accepts a valid record', () => {
    expect(validateDailyLogInput(valid, config)).toEqual([]);
  });

  it('rejects the exact over-capacity example from the brief (§8)', () => {
    // 8h paid shift, but break 1h + downtime 2h + changeover 1h + productive 6h = 10h > 8h paid.
    const impossible: DailyLogInput = {
      date: '2026-08-15',
      shift: 'Morning',
      paidMinutes: 480,
      breakMinutes: 60,
      changeoverMinutes: 60,
      downtimeMinutes: 120,
      productiveMinutes: 360,
    };
    const errors = validateDailyLogInput(impossible, config);
    expect(errors).toContain('Logged activity exceeds the paid shift duration. Please review your entries.');
  });

  it('rejects productive time exceeding available working time', () => {
    const bad: DailyLogInput = { ...valid, changeoverMinutes: 500, productiveMinutes: 100 };
    const errors = validateDailyLogInput(bad, config);
    expect(errors).toContain('Productive time cannot exceed available working time (paid time minus breaks, changeover, and downtime).');
  });

  it('rejects negative values', () => {
    const bad: DailyLogInput = { ...valid, downtimeMinutes: -5 };
    expect(validateDailyLogInput(bad, config)).toContain('Downtime minutes must be a non-negative number.');
  });

  it('rejects an invalid shift', () => {
    const bad: DailyLogInput = { ...valid, shift: 'Afternoon' };
    expect(validateDailyLogInput(bad, config).some((e) => e.startsWith('Shift must be one of'))).toBe(true);
  });

  it('rejects zero or unrealistic paid hours', () => {
    expect(validateDailyLogInput({ ...valid, paidMinutes: 0 }, config)).toContain('Paid hours must be greater than zero.');
    expect(validateDailyLogInput({ ...valid, paidMinutes: 1200 }, config)).toContain(
      'Paid hours looks unrealistic for a single shift (over 16 hours).',
    );
  });

  it('rejects a malformed date', () => {
    const bad: DailyLogInput = { ...valid, date: '15-08-2026' };
    expect(validateDailyLogInput(bad, config)).toContain('Date must be a valid date (YYYY-MM-DD).');
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
