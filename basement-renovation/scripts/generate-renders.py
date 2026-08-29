#!/usr/bin/env python3
"""Generate the five photorealistic renovation renders via the Gemini API.

Requires GEMINI_API_KEY in the environment (create one at
https://aistudio.google.com/apikey - the free tier covers the image model).
The key is read from env and never printed. Shot list mirrors
docs/render-prompts.md; same-room shots feed the real photos from photos/
so the output keeps the actual basement geometry.

Usage:
  python3 basement-renovation/scripts/generate-renders.py --probe
  python3 basement-renovation/scripts/generate-renders.py            # all shots
  python3 basement-renovation/scripts/generate-renders.py t1-gym
"""
import base64
import io
import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "mockups", "renders")
PHOTO_GYM = os.path.join(ROOT, "photos", "2026-08-gym-end.jpg")
PHOTO_LAUNDRY = os.path.join(ROOT, "photos", "2026-08-laundry-end.jpg")
MODELS = ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"]

SAME_ROOM = (
    "Renovate this exact basement room, keeping the same camera angle, room "
    "geometry and ceiling joists. Remove all cardboard boxes, coolers, wire "
    "shelving, food storage and the fridge. Then: "
)

SHOTS = {
    "t1-gym": {"photo": PHOTO_GYM, "prompt": SAME_ROOM + (
        "paint the cinder block walls a deep forest green-charcoal, keep the raw exposed wood "
        "joist ceiling and silver ducts as-is, lay black rubber stall-mat flooring with visible "
        "seams, keep the black steel power rack with wooden gymnastic rings and add a loaded "
        "barbell on it, adjustable bench nearby, the black folding treadmill parked against the "
        "side wall, hang two slim black linear LED shop lights under the joists casting warm "
        "pools of light, add a full-height dark charcoal blackout curtain closing off the near "
        "end, everything clean and organized. Budget DIY renovation, moody warm lighting, "
        "photorealistic interior photograph.")},
    "t2-gym": {"photo": PHOTO_GYM, "prompt": SAME_ROOM + (
        "give the block walls a smooth deep green painted finish, spray-paint the entire ceiling "
        "- joists, ducts and pipes - matte black, add two large black-framed mirrors against the "
        "long wall, glue down charcoal rubber roll flooring, keep the black power rack with "
        "wooden rings, add an oak shelf and steel pegs holding black bumper plates with aged "
        "brass wall hooks, hang suspended black linear pendant lights, and at the near end add a "
        "black-steel-framed glass partition wall with a glass door glowing warm from an office "
        "beyond. Boutique gym, warm accent lighting, photorealistic editorial interior "
        "photograph.")},
    "t3-gym": {"photo": PHOTO_GYM, "prompt": SAME_ROOM + (
        "transform it into a luxury boutique-hotel-style gym: one long wall clad in white oak "
        "slats with aged brass sconces and a floating oak bench, the opposite wall a full-height "
        "mirror wall reflecting the black power rack with barbell, a flush painted ceiling in "
        "warm near-black with recessed downlights and a warm cove glow washing the oak slats, "
        "premium charcoal rubber floor, and a cedar sauna door with a glass window in the far "
        "corner. Unlacquered brass details, dramatic warm lighting, photorealistic Architectural "
        "Digest interior photograph.")},
    "t2-laundry": {"photo": PHOTO_LAUNDRY, "prompt": (
        "Renovate this exact basement laundry room, keeping the same camera angle, room geometry "
        "and the two black front-load machines. Finish and paint all drywall warm white, mud and "
        "paint the unfinished wall seams, build a butcher-block oak counter over the two "
        "machines, add a white square-tile backsplash, deep green painted cabinets with aged "
        "brass knobs, a white utility sink, a drying rod with hangers, woven baskets, oak vinyl "
        "plank floor, bright even warm lighting. Photorealistic editorial interior photograph.")},
    "t2-office": {"photo": None, "aspect": "4:3", "prompt": (
        "Photorealistic interior photograph: a cozy refined basement home office, about 11 by 12 "
        "feet, warm white walls, oak luxury vinyl plank floor, walnut desk with a monitor and "
        "warm brass desk lamp, and behind the desk a black-steel-framed glass partition wall "
        "looking into a moody dark green home gym with a black power rack and warm accent "
        "lighting, warm wall sconce, dark green wool rug, one large framed art print, potted "
        "plant. Quiet, editorial interior photography.")},
}


def log(*a):
    print(*a, flush=True)


def call(model, payload, key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, {"_error": e.read()[:400].decode(errors="replace")}
    except Exception as e:  # noqa: BLE001
        return -1, {"_error": str(e)[:300]}


def build_payload(prompt, photo=None, aspect=None):
    parts = [{"text": prompt}]
    if photo:
        from PIL import Image
        im = Image.open(photo)
        im.thumbnail((1536, 1536))
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=85)
        parts.append({"inlineData": {"mimeType": "image/jpeg",
                                     "data": base64.b64encode(buf.getvalue()).decode()}})
    cfg = {"responseModalities": ["TEXT", "IMAGE"]}
    if aspect and not photo:
        cfg["imageConfig"] = {"aspectRatio": aspect}
    return {"contents": [{"role": "user", "parts": parts}], "generationConfig": cfg}


def extract_image(data):
    for cand in data.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"]), inline.get("mimeType", "image/png")
    return None, None


def main():
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        log("FATAL: GEMINI_API_KEY not set. Create one at https://aistudio.google.com/apikey "
            "and add it to the Claude environment's variables.")
        sys.exit(2)

    model = None
    tiny = build_payload("A plain red cube on a white studio background, product photo.")
    for m in MODELS:
        code, data = call(m, tiny, key)
        img, _ = extract_image(data) if code == 200 else (None, None)
        if img:
            model = m
            log(f"probe OK: model={m} ({len(img)//1024}KB)")
            break
        log(f"probe {m}: http={code} {str(data.get('_error',''))[:200]}")
    if not model:
        log("FATAL: no image-capable Gemini model reachable with this key.")
        sys.exit(2)
    if "--probe" in sys.argv:
        sys.exit(0)

    names = [a for a in sys.argv[1:] if not a.startswith("--")] or list(SHOTS)
    os.makedirs(OUT_DIR, exist_ok=True)
    failures = 0
    for name in names:
        s = SHOTS[name]
        payload = build_payload(s["prompt"], s.get("photo"), s.get("aspect"))
        for attempt in (1, 2):
            code, data = call(model, payload, key)
            if code == 200:
                img, mime = extract_image(data)
                if img:
                    ext = "png" if "png" in (mime or "") else "jpg"
                    path = os.path.join(OUT_DIR, f"{name}.{ext}")
                    with open(path, "wb") as f:
                        f.write(img)
                    log(f"{name}: saved {path} ({len(img)//1024}KB)")
                    break
                log(f"{name}: attempt {attempt}: 200, no image part "
                    f"(finishReason={data.get('candidates',[{}])[0].get('finishReason')})")
            else:
                log(f"{name}: attempt {attempt}: http={code} {str(data.get('_error',''))[:200]}")
            if attempt == 1:
                time.sleep(10)
        else:
            failures += 1
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
