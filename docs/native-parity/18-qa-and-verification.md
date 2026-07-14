# QA and verification

After the parity packs and the reader dial-in landed, an independent QA pass re-checked all of it against the actual code, on the principle that agent self reports and reviews are not proof. Fourteen agents read the committed code and the web reference and tried to falsify every claim. A QA lead then re-verified anything surprising before writing the verdict.

**Overall verdict: safe to ship.** Nothing blocks the APK build.

## What was confirmed

- **The research is accurate where it matters most.** Every numeric constant stated in the reader feel playbook was grep verified against live code in both repos: the pacing multipliers, the scrub physics, the densities, the focus and paragraph constants, the haptics, all of it. Every number matched. The three corrections the deep pass made to the first draft were confirmed true in code.
- **The shipping code is clean.** All six reader dial-in commits were checked for the per frame React work that is this app's recurring on device stutter bug, and they are free of it. The scrub worklet does no per frame allocation. All 16 parity packages are present, reachable on the branch, and their claimed file lists match what git actually shows.
- **Ground truth checks pass.** Both repos type check clean, and the web test suite (the boilerplate strip and chapter detection pipeline) passes.

## What was found, and what was done

Seven findings. Six were in the documentation, not the code, and all are now fixed.

- Playbook stated the cover peel as about 24 degrees and credited the wrong file; it is actually up to 50 degrees in `BookOpenTransition.tsx`. This one mattered because future book lift work would reference it. **Corrected.**
- Playbook had a self contradiction about a phantom 8px lift on the Focus reel, an overly broad claim that no JavaScript runs while dragging, and two stale line references. **All corrected.**
- The one genuine code finding was a nit: solid tint covers used label paper white instead of the web's cream for their stitching, imperceptible on a saturated tile but a real mismatch. **Fixed and committed** (`6aefe0c`).
- One non issue: the reduce motion additions in the chrome commit turned out to be redundant, since the animation library already honors the system setting by default. The code is correct, the commit message just slightly oversold it. No change needed.

## Bottom line

The code is sound and the research is now accurate too. The path to a real installable APK is clear. Once the APK is judged on device and the feel is signed off, the remaining housekeeping is merging the `feat/native-ui-web-parity` branch into the native repo's main line.
