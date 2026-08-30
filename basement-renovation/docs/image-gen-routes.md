# Image generation routes (verified 2026-08-29)

Ground truth from a 24-agent research sweep, every claim adversarially
re-tested. Constraint: no new spending. "Server" = the Claude workspace box.

## Working now, server-side (no user action)

**Cloudflare Workers AI — THE engine (verified live 2026-08-30).** Michael
made a Workers AI token in his existing account; token + account ID live in
the session scratchpad only (never in the repo — rotate the token at
<https://dash.cloudflare.com/profile/api-tokens> when the project wraps).
Free allocation ~10,000 neurons/day ≈ ~170 images/day. Two verified call
shapes against `https://api.cloudflare.com/client/v4/accounts/{ACCT}/ai/run/…`:

- `@cf/black-forest-labs/flux-2-klein-9b` — **same-room edits** (what made
  the current renders in `mockups/renders/`: t1/t2/t3-gym, t2-laundry).
  Multipart form ONLY (`prompt` text field + `image` jpeg file ≤1024px);
  a JSON body is rejected with "required properties … 'multipart'".
  Response JSON, base64 under `result.image`. Keeps the real walls, rack
  and machines.
- `@cf/black-forest-labs/flux-1-schnell` — text-to-image concepts (bath,
  desk-nook renders). JSON `{"prompt":"...","steps":8}`; a `seed` key is
  rejected. Response may be raw PNG or base64 JSON.

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
