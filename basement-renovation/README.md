# Basement Renovation

One long, narrow basement (~30–40 ft × 10–15 ft) becoming three zones with one
look: **gym / office / laundry**, with one consistent look across
all three (dark warm walls, black steel, brass, oak, built-in warm lighting). Fridges, coolers, and pantry shelving move to the garage
and are out of scope.

**Status: Phase 0 — planning.** Nothing is decided, nothing is ordered. The
dimensions below are estimates from Michael's description and two photos;
`backlog.md` Phase 0 is the measuring trip that turns estimates into facts.

## The map

| File | What it is |
|---|---|
| `docs/existing-conditions.md` | What's down there today, from the photos — plus the verify checklist |
| `docs/design-brief.md` | The vibe, the zone program, layout options |
| `docs/options.md` | Wall / ceiling / floor / partition choices with tradeoffs (incl. "paint the block or finish it?") |
| `docs/budget-tiers.md` | Three price points with line items: ~$3.5–6.5k, ~$18–32k, ~$40–70k |
| `docs/render-prompts.md` | Prompt pack for photorealistic AI renders (Nano Banana / any model), incl. same-room mode using `photos/` |
| `docs/inspiration.md` + `inspiration/` | Michael's reference images and the design language extracted from them — source of the warm-charcoal + light-as-architecture direction |
| `mockups/index.html` | Visual mockups: floor plan + per-tier look boards. Open in any browser. Also published (private to Michael's Claude account): <https://claude.ai/code/artifact/4fea912c-6902-4d43-8915-c9d3ac2a55b3> |
| `backlog.md` | Phased task list; Phase 0 is Michael-with-a-tape-measure |
| `photos/` | Current-state photos (Aug 2026), rotated upright |

## Decisions Michael owes the project

1. **Tier** — pick a price point (or a "start Tier 1, wire for Tier 2" path).
2. **Walls** — keep + paint the block, skim-coat it, or frame + drywall. See `docs/options.md`.
3. **Layout** — A (office in the middle) vs B (office at the far end). See `docs/design-brief.md`.
4. **Measurements** — run the Phase 0 checklist in `docs/existing-conditions.md`.

## Housekeeping: this should be its own repo

This project is parked on branch `claude/basement-renovation-4cvyox` of
`focus-reader` because the Claude GitHub integration can't create repositories.
It touches nothing else in the repo and should never merge to `main`. To
promote it once a real `basement-renovation` repo exists (create it empty on
GitHub, then either grant the Claude GitHub App access to it and ask a session
to do the move, or locally):

```bash
git clone -b claude/basement-renovation-4cvyox https://github.com/mkov1988/focus-reader fr-tmp
cd fr-tmp
git subtree split -P basement-renovation -b basement-only
git push https://github.com/mkov1988/basement-renovation basement-only:main
```
