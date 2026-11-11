---
target: the home page
total_score: 21
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
target_identity: "file:/Users/shauryajain/Documents/Documents - Shaurya’s MacBook Air/Competitions/rebuttal-ai/src/app/page.tsx"
target_fingerprint: "sha256:58c2f904f492c4cd4427cdfc968848fd4e8bc86f379c5145b18babd5f2af9031"
target_path: /Users/shauryajain/Documents/Documents - Shaurya’s MacBook Air/Competitions/rebuttal-ai/src/app/page.tsx
timestamp: 2026-11-11T10-19-36Z
slug: src-app-page-tsx
---
Method: dual-agent (design review + detector/browser)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Eval date computed (ev.date) but never shown |
| 2 | Match System / Real World | 2 | Specimen speaks schema: mentionsAmountCents 50000, claimType NONE, "hero 3" |
| 3 | User Control and Freedom | 3 | Simple page, persistent nav |
| 4 | Consistency and Standards | 3 | One destination, three names (Evaluation / See / Read the attack results) |
| 5 | Error Prevention | 3 | Little to get wrong |
| 6 | Recognition Rather Than Recall | 2 | Cents→dollars; 24 vs 19 denominators unexplained |
| 7 | Flexibility and Efficiency | n/a | One-visit persuasion page |
| 8 | Aesthetic and Minimalist Design | 3 | Key numbers at body weight; flat lower half |
| 9 | Error Recovery | 2 | heroSpecimen() unguarded: missing replay file 500s the homepage |
| 10 | Help and Documentation | n/a | Landing page |
| Total | | 21/32 | Acceptable |

Design specificity: hero authored (real run, DENIED stamp); below the fold generic (3-col feature grid, 2-col list); Mira absent.
Detector: CLI 0 findings. Overlay: low-contrast x3 (--faint #7c8591 3.5:1, real), bounce-easing on .stamp-land (real, deliberate), tiny-text on stamp <small> (false positive), line-length on prior-art note (false positive).

Priority issues:
1. [P1] "What Rebuttal sent instead" (page.tsx ~99) claims a send that never happened; say "proposed instead (the firewall allowed it)". clarify
2. [P1] Headline proof undated and at body weight; render "0 / 24" vs "9 / 19" as large figures with a dated mono receipt and explain the 19 denominator. typeset/bolder
3. [P2] Specimen speaks schema; Mira missing. Add plain glosses, replace "hero 3". clarify
4. [P2] --faint fails WCAG AA in light mode (darken to ~#6a7380); guard heroSpecimen() with a fallback. harden
5. [P2] Mobile: peak ~1.5 screens down, 9 first-screen choices, nav orphans "Store", stamps stack. Reorder on small screens, cut nav to 4. adapt

Personas: Jordan (jargon, Desk/Dashboard/Evaluation confusion), Riley (24 vs 19, "sent", unlinked Nov 10 claim), Casey (stacked stamps, orphan nav, mid-token break), judge (no link to /desk/live or /dashboard; ends on a disclaimer).
Minor: dead lower-left in hero; ragged promise links; off-site link uncued; verdict inks reused for Real/Simulated; untracked AGENTS.md from next dev.
Questions: carry stamps into each promise; let the judge run the attack; serve Mira or the judge explicitly.
