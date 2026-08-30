# Image generation routes (verified 2026-08-29)

Ground truth from a 24-agent research sweep, every claim adversarially
re-tested. Constraint: no new spending. "Server" = the Claude workspace box.

## Working now, server-side (no user action)

**Local SDXL-Turbo pipeline** — produced the current renders in
`mockups/renders/`. Recipe: mask-recolor the real photo to the plan's
materials (walls/floor/ceiling polygons + luminance-preserving tint, LED
line drawn with glow), then SDXL-Turbo img2img fuse at strength 0.4–0.6,
bf16 on CPU, ~2 min per image. One render process at a time (15GB RAM).

**Local FLUX.1-schnell** — one quality tier up. stable-diffusion.cpp is
built at `scratchpad/stable-diffusion.cpp/build/bin/sd-cli` (rebuild:
clone leejet/stable-diffusion.cpp, `cmake -B build -DGGML_NATIVE=ON`,
`cmake --build build -j2` — **-j2 mandatory**, -j4 OOMs). Non-gated model
set (~9.6GB, no account needed):
- `city96/FLUX.1-schnell-gguf` → flux1-schnell-Q4_K_S.gguf (6.3GB)
- `city96/t5-v1_1-xxl-encoder-gguf` → Q4_K_M (2.7GB)
- `comfyanonymous/flux_text_encoders` → clip_l.safetensors
- `second-state/FLUX.1-schnell-GGUF` → ae.safetensors (the official BFL
  repo is login-gated — don't use it)

Run: `sd-cli --diffusion-model ... --t5xxl ... --clip_l ... --vae ...
-i in.png --strength 0.55 -p "..." -W 768 -H 960 --steps 4 --cfg-scale 1.0
--sampling-method euler -t 4 --diffusion-fa --vae-tiling --mmap -o out.png`
(~11.5GB peak; run standalone.)

**HuggingFace ZeroGPU, anonymous** — roughly ONE free GPU run per 24h per
IP, no account. FLUX.1-Kontext-Dev does true same-room edits (photo +
instruction). Flow: POST photo to
`https://black-forest-labs-flux-1-kontext-dev.hf.space/gradio_api/upload`
(multipart `files=`), then `gradio_api/queue/join` with
`{"data":[{"path":"<uploaded>","meta":{"_type":"gradio.FileData"}},
"<edit prompt>",0,true,2.5,28],"fn_index":2,"session_hash":"X"}`, then SSE
`gradio_api/queue/data?session_hash=X`. Quota error = window spent, retry
after reset. A daily self-wake trigger is set to spend this on hero shots.

## One-time 90-second task that unlocks the real engine

**Cloudflare Workers AI** — Michael ALREADY HAS the account (verified
2026-08-30): it runs the focus-reader Pages site (focus-reader-48z.pages.dev)
and the R2 buckets. The `CLOUDFLARE_API_TOKEN` stored in this repo's GitHub
secrets is deliberately scoped Pages:Edit-only (per deploy-pages.yml) — it
cannot call Workers AI, and GitHub secrets are unreadable by design, so a
NEW token is needed. Setup in the existing account: dash.cloudflare.com →
My Profile → API Tokens → Create Token → "Workers AI" template → paste the
token to a session once, plus the Account ID (dashboard sidebar, or the
R2_ENDPOINT line in the local `.r2.env`). Free allocation: 10,000
neurons/day ≈ ~170 FLUX-schnell images/day; FLUX.2-klein does generation
AND reference-photo editing. Then:
`POST https://api.cloudflare.com/client/v4/accounts/{ACCT}/ai/run/@cf/black-forest-labs/flux-1-schnell`
with `Authorization: Bearer <token>`, JSON `{"prompt":"...","steps":4}` →
base64 image back. This turns every future "tweak the render" into a
30-second server-side operation at high quality.

## Phone, manual (free or already paid)

- **Gemini app** (Michael already pays): upload room photo + edit prompt =
  the best same-room edits available to us (Nano Banana). ~20+/day on paid.
- **AI Studio web** (aistudio.google.com, free, works in phone browser /
  PWA): bulk Nano Banana generations on the separate free web quota.
- **HF Spaces in phone browser** (no account): Qwen-Image-Edit and
  FLUX.1-Kontext-Dev accept photo uploads — a few free edits/day.
- **Google Flow** (labs.google/fx/tools/flow, or the rebranded Whisk
  Android app): free 50 credits/day, reference-image "Ingredients".

## Dead ends (do not retry)

- Gemini API free tier: every image model is free-tier limit **0**
  (pricing page marks all Nano Banana models "Not available" on free).
- Figma Weave via MCP: hard-blocked — "MCP tools are only available on a
  paid Weave plan" ($24/mo). Figma Pro does NOT include Weave. Public
  showcase flow IDs resolve read-only but can never run server-side free.
- pollinations.ai anonymous: unusable quality (tested).
- HF serverless inference without token: 401 (tested).
- ImageFX / Whisk: retired 2026-04-30, folded into Google Flow.
