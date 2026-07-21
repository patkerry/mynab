// Categorical chart palette — the dataviz-validated theme (see the bundled "dataviz" skill). Hues are
// assigned to series in FIXED slot order and never cycled; a 9th series must fold into "Other".
// Validated with scripts/validate_palette.js: passes the lightness, chroma, CVD-separation (worst
// adjacent ΔE 9.1 light / 8.4 dark) and normal-vision (19.6 / 19.3) gates in both modes. Three light
// hues sit just under 3:1 surface contrast — the "relief rule" covers them, satisfied because every
// chart ships a legend, hover tooltips, and direct value labels (identity is never color-alone).
export const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#008300", // 2 green
  "#e87ba4", // 3 magenta
  "#eda100", // 4 yellow
  "#1baf7a", // 5 aqua
  "#eb6834", // 6 orange
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

// Pick a color for slot i (never wraps past the fixed order — callers cap series at 8 / fold to "Other").
export const catColor = (i: number) => CATEGORICAL[i] ?? "#8a8a86";
