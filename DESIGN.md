---
name: Rebuttal
description: A PayPal dispute agent that cannot be talked out of the rules. Light, white and blue, plain on purpose; the firewall verdict box is the one loud element.
colors:
  paper: "#ffffff"
  sunk: "oklch(0.97 0.004 260)"
  ink: "oklch(0.145 0 0)"
  graphite: "oklch(0.47 0.01 260)"
  faint: "oklch(0.52 0.01 260)"
  rule: "oklch(0.922 0.004 260)"
  act: "oklch(0.546 0.245 263)"
  act-ink: "#ffffff"
  allow: "#1e6b45"
  allow-tint: "#e3f0e8"
  deny: "#b3261e"
  deny-tint: "#f8e4e2"
  hold: "#8a5a00"
  hold-tint: "#f6ecd6"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: "\"tnum\" 1"
  body-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
  id:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8em"
    fontWeight: 400
rounded:
  sm: "4px"
  stamp: "6px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.act}"
    textColor: "{colors.act-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.body-sm}"
  button-quiet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.body-sm}"
  button-quiet-hover:
    backgroundColor: "{colors.sunk}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
    typography: "{typography.body-sm}"
  sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "20px"
  receipt:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    typography: "{typography.label}"
  badge-allow:
    backgroundColor: "{colors.allow-tint}"
    textColor: "{colors.allow}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
    typography: "{typography.label}"
  badge-deny:
    backgroundColor: "{colors.deny-tint}"
    textColor: "{colors.deny}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
    typography: "{typography.label}"
  badge-hold:
    backgroundColor: "{colors.hold-tint}"
    textColor: "{colors.hold}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
    typography: "{typography.label}"
  stamp-deny:
    textColor: "{colors.deny}"
    rounded: "{rounded.stamp}"
    padding: "5.6px 11.2px 6.4px"
  synthetic-banner:
    backgroundColor: "{colors.hold-tint}"
    textColor: "{colors.hold}"
    padding: "6px 16px"
    typography: "{typography.label}"
---

# Design System: Rebuttal

> **Nov 2026 overhaul.** Geist and Geist Mono on a plain white page, one blue for the next click (`.btn-primary`), quiet
> outlined buttons (`.btn-quiet`), rounded-2xl `.card` sheets with a hairline shadow, and a frosted sticky header. Token values live
> in `src/app/globals.css`. Where this file's older notes on Public Sans, IBM Plex Mono, paper tones or flat sheets disagree with that,
> the overhaul wins; the stamp inks and the story rules are unchanged.
>
> **No decoration that moves on its own.** No glows, grid patterns, moving borders, gradient text or counting numbers: the
> interactive parts (the intro card, the chat, the firewall playground, the tamper test) carry the page. Motion is only a reply to
> something the visitor did. The current walkthrough step is marked with a solid blue border.
>
> **No stamps, no pills.** The rotated ink stamp is gone. A firewall verdict is a plain box (`Verdict` in `src/app/desk/ui.tsx`):
> an icon, "Blocked by the firewall" / "Allowed by the firewall" / "Held for Mira to approve", and the rule in words.
> Nothing is pill-shaped: buttons and choices use 12px corners. On every screen exactly one blue `.btn-primary` is the next
> click (full width on phones via `.btn-go`); options the visitor picks from are full-width `.choice` rows with an arrow.
> On phones the run walkthrough's Back / Next bar is fixed to the bottom of the screen.
>
> **Every page opens the same way.** `PageHead` (`src/app/flow.tsx`): a blue `.eyebrow` (the chapter, or where the page sits, such as
> "Sandbox store"), a 3xl/5xl semibold title, one lead paragraph. Content then sits in `.card` sheets; notices are rounded-xl tinted boxes.

## Overview

**Creative North Star: "The Filing Desk"**

Rebuttal looks like a clerk's desk where cases are decided on paper: cool off-white sheets, blue-black ink, thin rule lines between records, and a rubber stamp for the verdict. It is a filing desk, not a dashboard. Nothing glows, floats or gradients. Authority comes from the deterministic decision, so the one loud thing on any page is the firewall's stamp, and everything around it is quiet, typeset record.

Density is that of a well-kept file: generous reading measure (about 42rem for prose), a single centred column (64rem on the home page, 56rem on inner pages), records separated by hairline rules rather than boxed into cards. Pages are walked in order, as a story in three chapters. The header shows the three chapters (current one in action blue, earlier ones ticked), each page says "Chapter n of 3" above its headline, and closes with one Next button. Each page has one primary action at a time; detail waits behind a step, a tab or a disclosure.

The system has one light theme on purpose, whatever the visitor's OS is set to. Every colour is a CSS custom property on `:root` in `src/app/globals.css`; the frontmatter records the values. Working sheets (the opening scene, the case, each walkthrough step, the chat) sit on white with a hairline border and 12px corners.

**Key Characteristics:**
- Cool paper, blue-black ink, hairline rules; flat, no shadows.
- Three stamp inks (allow green, deny red, hold amber) are the only saturated colours, and each always means a verdict or a status.
- One action blue for buttons, links and focus.
- Public Sans for everything people read; IBM Plex Mono only for identifiers.
- Tabular figures everywhere, so money and counts line up.
- Every page ends with one Next step.

## Colors

A near-monochrome paper-and-ink palette with one working blue and three meaning-bound stamp inks.

### Primary
- **Action Blue** (act): buttons, text links, focus rings and text selection. It never marks a verdict or status. Text on it is **Act Ink** (act-ink), white in light mode and near-black navy in dark (6.8:1 and 7.7:1).

### Secondary: the stamp inks
Each ink has a pale tint for fills behind it (5.0:1 to 5.5:1 against its tint).
- **Allow Green** (allow, on allow-tint): ALLOWED stamps, allowed badges, a signed ledger, and Rebuttal's 0 attacks that got through.
- **Deny Red** (deny, on deny-tint): DENIED stamps, attacks that succeeded, injected buyer text (dashed deny border on a deny tint), rate-limit refusals.
- **Hold Amber** (hold, on hold-tint): HELD FOR SELLER stamps, an unsigned ledger, and the sandbox and synthetic notices (the site-wide banner and the per-run "Synthetic dispute" strip).

### Neutral
- **Paper** (paper): the page and every sheet. Cool, faintly green-grey off-white.
- **Sunk Paper** (sunk): one step down. Used for hover fills, grid headers, receipts and neutral badges.
- **Ink** (ink): headings, body copy, the heavy rule that opens a door or a Next step, and the current route number.
- **Graphite** (graphite): secondary prose, leads, notes, nav at rest.
- **Faint** (faint): the quietest text: captions, provenance lines, rubric item ids, door numerals.
- **Rule** (rule): every hairline: borders, dividers, table rows, field strokes.

### Named Rules
**The Stamp Ink Rule.** Allow green, deny red and hold amber are the only saturated colours, and they always carry their meaning (allowed, denied, held or caution). A chart, illustration or decoration never uses red or green for anything else.

**The One Blue Rule.** Action blue means "you can click this" and nothing else.

**The Faint Floor Rule.** Faint holds WCAG AA on paper (4.58:1 light, 5.4:1 dark). It is for text on paper only; on sunk paper it drops to 4.25:1, so text on sunk uses graphite or ink.

## Typography

**Body Font:** Public Sans (with ui-sans-serif, system-ui)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace), weights 400 and 500

**Character:** One plain, civic grotesque does all the talking, heavy (800) and tightly tracked for headings, regular for reading. Plex Mono appears only where a value is an identifier, so it reads as "this was copied from a record".

### Hierarchy
- **Display** (800, 2.25rem rising to 3rem, line-height 1.05, tight tracking): the home page headline only, at most about 48rem wide.
- **Headline** (800, 1.875rem rising to 2.25rem, tight tracking): the one h1 on each inner page, directly under the route bar.
- **Title** (700, 1.25rem, tight tracking): section and door headings; 1.125rem for lesser sections ("Or run another case").
- **Body** (400, 1rem, line-height 1.625): prose, capped at about 42rem; leads step up to 1.125rem in graphite.
- **Body small** (400, 0.875rem, line-height 1.625): the workhorse for door copy, tables, nav and buttons.
- **Label** (400 to 600, 0.75rem): provenance lines, receipts, badges, the sandbox banner. Never uppercase.
- **Identifier** (Plex Mono 400, 0.8em of its context, usually graphite): dispute ids, rubric item ids, source ids, hashes, model names, file paths.

### Named Rules
**The Mono Is For Identifiers Rule.** Plex Mono is reserved for identifiers: ids, hashes, source citations, model names and file paths. Prose, labels, numbers and headings stay in Public Sans.

**The Tabular Rule.** The body sets `tnum` on, so every amount, score and count lines up in columns. Large proof figures also use tabular numerals.

## Layout

A single centred column with a 16px gutter: 64rem on the home page, 56rem on inner pages. Inner pages open 40px down with the route bar, then the headline 32px below it. Within a page, the rhythm runs on a 4px base: 8 to 16px between a heading and its copy, 24 to 32px between blocks, 48px between sections, 64px before the closing Next step.

The home page sets its three doors as a three-column grid at `md` (768px) and up, 32px apart, and stacks them in order below that, 48px apart. Records are lists divided by hairlines (a rule above and below, a rule between rows), not grids of cards. Tables scroll sideways inside their own bordered box on narrow screens. The layout was checked down to 375px.

**The Walk In Order Rule.** The header carries the three chapters on every page. Each chapter page ends with one Next step: a hairline rule, a sentence, and one primary button to the next chapter. On the run page the Next step appears only once the walkthrough reaches the verdict, so there is never more than one primary button on screen.

**The One Primary Rule.** One primary (action blue) button per section. Any other action in that section is a quiet button or a text link.

## Elevation & Depth

Flat. There are no drop shadows anywhere, including the AG Studio canvas and widgets. Depth comes from tone and line: sunk paper sits one step below paper, hairline rules separate records, and a 2px ink rule marks the start of something important (a door, the lead run form, the Next step). The only box-shadow in the system is the stamp's inset double ring, which draws a second border inside the stamp. It does not lift anything.

**The Paper Is Flat Rule.** Nothing floats. If a surface needs separating, give it a rule line or sunk paper, never a shadow.

## Shapes

Corners are barely softened. Buttons, fields, badges, notices and receipts use 4px. Larger bordered sheets (rubric tables, policy and verifier panels) use 8px. The stamp is the one shape with character: 6px corners, a 2.5px border in its own ink with an inset inner ring, and a fixed -2.5° tilt, like a rubber stamp pressed by hand. Route numbers sit in full circles 24px across. Borders are 1px rule lines. The two heavier strokes are the 2px ink opening rule and the stamp's border.

## Components

### Buttons
Plain and certain, with no icons and no gradients.
- **Shape:** gently squared (4px), 600-weight small text, 8px by 16px padding; the lead action on the desk grows to 12px by 24px at body size.
- **Primary:** action blue with act-ink text; on hover the fill fades to 85%.
- **Quiet:** paper with a rule-line border and ink text; on hover the fill turns sunk.
- **Focus:** a 2px action-blue outline, offset 2px (global `:focus-visible`).
- **Disabled:** 40% opacity and a not-allowed cursor.

### Stamp (signature component)
The firewall's verdict, and the one loud element on any page. Its word is set in 800-weight capitals (ALLOWED, DENIED, HELD FOR SELLER) with 0.06em tracking, above a small 700-weight line naming the rule in plain words ("I1: more than was paid", or "all ten rules pass"). The colour comes only from the verdict's ink. It is exposed as `role="img"` with a spoken label. On first paint it may land: 360ms from -7° and 112% scale down to -2.5° and 100%, on `cubic-bezier(0.2, 0.9, 0.3, 1.2)`, only when reduced motion is not requested. The animation starts fully visible, so a stamp that never animates still reads correctly. It never moves after that.

### Badges
Small inline status for lists and tables: a 0.75rem 600-weight label on a 4px tint with its ink (allow, deny or hold); neutral badges are graphite on sunk.

### Cards / Containers
- **Doors and sections:** no box at all. A 2px ink rule on top, 20 to 24px down to the content.
- **Sheets:** paper with a 1px rule border and 8px corners, padded 12 to 20px, for tables and panels.
- **Receipt:** a sunk, 4px-cornered label-size definition list (ledger head, entry count, signature), with identifiers in mono.
- **Notices:** a 4px strip in the tint of their meaning: hold for synthetic and sandbox notices, deny for refusals, sunk for neutral confirmations. They are marked `role="status"` where they report a result.

### Inputs / Fields
Paper fill, a 1px rule border, 4px corners, 6px by 10px padding, small ink text, with a label above. Focus is the global action-blue outline.

### Navigation
- **Header:** the wordmark "Rebuttal" (800, 1.125rem, tight tracking) at left, and four nav items in small graphite text (Watch, Try to fool it, Receipts, Dashboard) on the right. On hover an item gets a sunk fill and ink text. It wraps on narrow screens.
- **Sandbox banner:** a full-width strip under the header, label text in hold ink on hold tint at 60%. It is present on every page.
- **Footer:** secondary links (live disputes, policy, store, code) in graphite, which turn ink and underline on hover, and a faint attribution line.
- **Links in prose:** action blue, with a 40%-blue underline offset 3px that turns solid on hover.
- **Skip link:** the first focusable element, an action-blue pill when focused.

### Story nav, walkthrough and Next step (signature components)
See the Walk In Order Rule. The story nav (`src/app/nav.tsx`) is an ordered list of the three chapters with `aria-current="step"` on the current one. The walkthrough (`src/app/walkthrough.tsx`) shows a run one stage at a time with Back / Next and a "Show all steps" toggle; tabs (`src/app/tabs.tsx`) split chapter 2 into chat, firewall and results. The Next step is a labelled section: one sentence of body text up to about 42rem wide, then the primary button.

### Dashboard (AG Studio)
The dashboard is themed entirely through the tokens, so it follows light and dark mode. Widgets are paper sheets with a single rule border, 4px corners, no shadow, ink titles and graphite subtitles. Grids have sunk headers in graphite, rule row lines and a sunk hover. Charts cycle act, hold, graphite, faint and ink, and never use allow or deny. The custom verdict-stamps widget reuses the stamp inks for verdicts.

## Do's and Don'ts

### Do:
- **Do** keep allow green, deny red and hold amber for their meanings (allowed, denied, held or caution), and use them nowhere else.
- **Do** compute every figure on a page from committed data (the eval report, the recorded run, the ledger) and label anything synthetic, simulated or replayed in plain words next to it.
- **Do** date proof figures and name their model and run count in a label line beneath them.
- **Do** set identifiers in IBM Plex Mono and everything else in Public Sans.
- **Do** give each section one primary button; extra actions are quiet buttons or links.
- **Do** end every chapter page with the Next step, and keep one primary action on screen at a time.
- **Do** separate records with rule lines and sunk paper.
- **Do** check new text colours for AA against the surface they sit on; faint is cleared on paper only.

### Don't:
- **Don't** use red or green in a chart, illustration or decoration for anything other than denied or allowed.
- **Don't** add drop shadows, glows or gradients.
- **Don't** use PayPal's logos, brand colours or anything that imitates its checkout button. "PayPal" appears only as plain text.
- **Don't** use mono for prose, labels or headings to make them look technical.
- **Don't** animate the stamp after it lands, or animate it at all when reduced motion is requested.
- **Don't** show a number that is not read from committed data, or a synthetic case without its label.
