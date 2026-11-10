// AG Studio theme: every value points at Rebuttal's own design tokens (src/app/globals.css), so the dashboard,
// its grids and charts follow light and dark mode with the rest of the site. Charts lead with neutral inks: red and
// green mean denied and allowed everywhere else on the site, so a chart must not paint "fight" red by accident.
import { studioTheme } from "ag-studio";

const v = (name: string) => `var(--${name})`;
const line = (color: string) => ({ width: 1, color: v(color) });
const inks = ["act", "hold", "graphite", "faint", "allow", "deny", "act", "hold", "graphite", "faint"];
const palette = Object.fromEntries(inks.flatMap((c, i) => [[`chartPaletteFills${i + 1}Color`, v(c)], [`chartPaletteStrokes${i + 1}Color`, v(c)]]));

export const rebuttalStudioTheme = studioTheme.withParams({
  fontFamily: "var(--font-public-sans), ui-sans-serif, system-ui, sans-serif",
  fontSize: 14,
  textColor: v("ink"),
  foregroundColor: v("ink"),
  subtleTextColor: v("graphite"),
  backgroundColor: v("paper"),
  borderColor: v("rule"),
  accentColor: v("act"),
  iconColor: v("graphite"),
  rowHoverColor: v("sunk"),

  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: v("paper"),
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: v("paper"),
  studioCanvasPadding: 4,
  studioCanvasRowHeight: 18,

  // Widgets read as filed sheets: paper, one rule, a small radius, no shadow.
  studioWidgetBackgroundColor: v("paper"),
  studioWidgetBorder: line("rule"),
  studioWidgetBorderRadius: 4,
  studioWidgetPadding: 10,
  studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 700,
  studioWidgetTitleTextColor: v("ink"),
  studioWidgetSubtitleFontSize: 13,
  studioWidgetSubtitleTextColor: v("graphite"),
  studioWidgetCaptionTextColor: v("faint"),
  studioWidgetResizeBorderColor: v("act"),

  studioPanelContainerBackgroundColor: v("paper"),
  studioPanelContainerBorder: line("rule"),
  studioPanelDividerColor: v("rule"),
  studioPanelDividerActiveColor: v("act"),
  studioPanelSectionBorderColor: v("rule"),
  studioToggleButtonActiveBackgroundColor: v("sunk"),
  studioToggleButtonActiveBorderColor: v("act"),
  studioToggleButtonActiveColor: v("act"),

  gridFontSize: 13,
  gridCellTextColor: v("ink"),
  gridHeaderBackgroundColor: v("sunk"),
  gridHeaderTextColor: v("graphite"),
  gridHeaderFontWeight: 600,
  gridRowHeight: 36,
  gridRowBorder: line("rule"),
  gridHeaderRowBorder: line("rule"),
  gridRowHoverColor: v("sunk"),
  gridWrapperBorder: false,

  chartTextColor: v("ink"),
  chartSubtleTextColor: v("graphite"),
  chartAxisLineColor: v("rule"),
  chartGridLineColor: v("rule"),
  ...palette,
});
