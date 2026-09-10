// Labour economics config — brief §A3, extended for daily logging (Employee
// Portal §7).
//
// breaksArePaid controls which side of the availableMinutes deduction breaks land
// on: unpaid breaks are subtracted from paidMinutes (they shrink the denominator
// of every downstream percentage), paid breaks are not subtracted at all. Flipping
// this flag must change every efficiency figure with no other code edits — every
// calculation in src/lib/labourCalc.ts reads breaksArePaid from this object rather
// than a hardcoded assumption. It is NOT a confirmed Grandiose policy — pending GM
// clarification — and is not shown to the `employee` role in the UI, only as a
// small assumptions indicator for manager/HR (a client-side app can't truly hide a
// bundled constant from someone reading the JS, but it's kept out of the employee
// workspace's UI).
//
// shiftLengthHours/breakMinutesPerShift are no longer baked into the arithmetic —
// each daily log row supplies its own paidMinutes/breakMinutes directly (a half
// shift or overtime is just a different number, not a special case). These two
// values are only the Daily Log form's default prefill.
export const LABOUR_CONFIG = {
  shiftLengthHours: 9.0,
  breaksArePaid: true, // TODO: CONFIRM WITH GM — flipping this changes every efficiency figure
  breakMinutesPerShift: 35, // TODO: CONFIRM WITH GM
  revenueAttributionBasis: 'allocated' as const,
} as const;

// Documented GM productivity benchmark — brief §A6.
export const GM_PRODUCTIVITY_BENCHMARK_AED_PER_DAY = 1000;

export type LabourConfig = typeof LABOUR_CONFIG;
