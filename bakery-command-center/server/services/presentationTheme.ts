// AI Presentation Builder — visual theming. A deck picks ONE of these at
// generation time (see pickRandomTheme()) so consecutive decks don't all
// look identical, while every individual deck stays internally consistent
// (one theme end to end, never mixed mid-deck).
//
// Two roles never rotate with the theme, on purpose:
//  - The FIXED semantic chart colors (over/under target red/green, gap-
//    driven amber/red, receivables-aging escalation, current/optimized
//    neutral gray) — presentationCharts.ts's DECK_COLORS. Those colors
//    carry meaning (dataviz skill: "color follows the entity, never its
//    rank" / status colors are reserved) and rotating them would make the
//    same finding read as a different verdict from one deck to the next.
//  - The chart plot surface, which stays white/off-white regardless of
//    theme — data slides are always rendered in the theme's LIGHT mode
//    (see pptxBuilder.ts) specifically so charts stay legible.
//
// What DOES rotate is: the deck's dark/light "ground" pair (used for the
// title slide and the text-only recommendations/sources slides, full-bleed)
// and the one neutral chart accent hue (used wherever a chart currently has
// no semantic color to carry — a single trend line, a SKU ranking bar, an
// uploaded sheet's column averages). Six candidates, each individually
// validated against the dataviz skill's checks before being added here:
// lightness band + chroma floor (not muddy/washed out), >=3:1 contrast for
// the accent against a white chart surface, and >=4.5:1 contrast for ink
// text against its own ground — see this repo's chat history for the
// validator runs. They are NOT mutually CVD-differentiated from each other,
// because that check only matters when two colors appear on the same chart
// at once, and two themes' accents never do (only one theme is ever active
// per deck).
export interface DeckTheme {
  name: string;
  /** Full-bleed dark background — title slide, recommendations, sources. */
  ground: string;
  /** Text/ink color on top of `ground`. */
  groundInk: string;
  /** Full-bleed light background — every data slide (chart/table legibility). */
  light: string;
  /** Text/ink color on top of `light` — kept close to DECK_COLORS.textPrimary across themes so data-slide body text stays familiar; themes differentiate mainly through `ground`/`accent`. */
  lightInk: string;
  /** The one rotating "no special meaning" chart color — trend lines, ranking bars, uploaded-sheet columns. */
  accent: string;
}

export const DECK_THEMES: DeckTheme[] = [
  { name: 'Midnight Navy', ground: '#14304A', groundInk: '#F3EFE3', light: '#FAF7EF', lightInk: '#1B2430', accent: '#2F6FB0' },
  { name: 'Forest & Sand', ground: '#1F3B2E', groundInk: '#F4EEDD', light: '#FAF6EC', lightInk: '#1D2A22', accent: '#B5750A' },
  { name: 'Bordeaux & Blush', ground: '#3B1620', groundInk: '#F3E7E2', light: '#FBF3F0', lightInk: '#2A1418', accent: '#A14A5C' },
  { name: 'Slate & Olive', ground: '#2B2E38', groundInk: '#F2EFE6', light: '#F8F6F0', lightInk: '#23252C', accent: '#6B7A1E' },
  { name: 'Espresso & Cream', ground: '#3A2A1E', groundInk: '#F5EEE2', light: '#FAF5EC', lightInk: '#2A2018', accent: '#C1481F' },
  { name: 'Charcoal & Teal', ground: '#22252B', groundInk: '#F1EFE8', light: '#F7F6F2', lightInk: '#1D1F24', accent: '#0C8C74' },
];

export function pickRandomTheme(): DeckTheme {
  return DECK_THEMES[Math.floor(Math.random() * DECK_THEMES.length)];
}
