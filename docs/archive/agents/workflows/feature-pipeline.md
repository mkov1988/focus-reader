---
description: Pipeline for orchestrating UX, UI, Dev, and QA roles to build a new feature.
---
# Feature Development Pipeline

This workflow orchestrates the development of a new feature by sequentially adopting different expert personas. Use this when the user asks to build a substantial new feature.

## Step 1: UX Phase
1. Read `.agents/skills/ux_agent.md` to adopt the UX Designer persona.
2. Read the user's request and **ALL relevant project research** (including the `docs/Research/`, `docs/Requirements/` folders, and querying any summarizing Knowledge Items).
3. Output a `ux_spec.md` (or detailed markdown plan) detailing the step-by-step user flow, edge cases to handle, and required elements. Do NOT write production code yet.

## Step 2: UI Phase
1. Read `.agents/skills/ui_agent.md` to adopt the UI Designer persona.
2. Review the `ux_spec.md` generated in Step 1.
3. Output a `ui_spec.md` detailing the visual aesthetic, CSS classes/styles, colors, layout structures, and specific micro-interactions needed.

## Step 3: Dev Phase
1. Read `.agents/skills/dev_agent.md` to adopt the Senior Developer persona.
2. Review the `ux_spec.md` and `ui_spec.md`.
3. Plan and execute code edits. Implement the necessary React components, state logic, and styling.

## Step 4: QA Phase
1. Read `.agents/skills/qa_agent.md` to adopt the QA Engineer persona.
2. Review the implemented code changes against the specs.
3. If running a local dev server, deploy the browser subagent to interact with the new feature and visually verify its correctness.
4. Fix any bugs found, or provide a final summary confirming the feature is complete.
