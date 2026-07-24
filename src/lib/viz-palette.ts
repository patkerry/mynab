// Categorical chart palette — brand-warm (sage/clay family first) instead of the generic
// blue/green/magenta placeholder set, so Reports reads as the same app as the rest of the UI.
// Hues are assigned to series in FIXED slot order and never cycled; a 9th series must fold into
// "Other" (catColor falls back to a neutral). Built with the bundled "dataviz" skill's method and
// VALIDATED (scripts/validate_palette.js), not eyeballed:
//   - adjacent-pair gate: ALL CHECKS PASS in both modes (light surface #f8f4ec, dark #2b2620) —
//     lightness band, chroma floor, CVD separation (worst adjacent ΔE 8.0 deutan), normal-vision
//     floor (worst adjacent 15.3), contrast ≥3:1 (one dark-mode WARN at 2.73 — relief satisfied:
//     every chart ships a legend, axis labels, and hover tooltips, so identity is never
//     color-alone).
//   - slot order additionally search-optimized so the first 7 (top-6 + "Other", the trend chart's
//     simultaneous set) maximize worst ALL-pairs separation; violet was dropped entirely because
//     every step of it is deutan-identical to blue (ΔE 0.7).
export const CATEGORICAL = [
  "#4f8a52", // 1 sage (brand accent family)
  "#2f74c9", // 2 denim blue
  "#bd5a33", // 3 clay (brand)
  "#ab4f96", // 4 plum
  "#b0801f", // 5 gold
  "#0d968c", // 6 teal
  "#ad4a3a", // 7 brick
  "#8a8a2a", // 8 olive
];

// Pick a color for slot i (never wraps past the fixed order — callers cap series at 8 / fold to "Other").
export const catColor = (i: number) => CATEGORICAL[i] ?? "#8a8a86";
