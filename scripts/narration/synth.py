"""Narration pipeline, step 2: synthesize planned units with Kokoro.

Runs in Michael's terminal (long-run rule). One-time setup, from
scripts/narration/:

    python3.11 -m venv .venv
    .venv/bin/pip install -r requirements.txt     # (Windows: .venv\\Scripts\\pip)
    # espeak-ng must be installed system-wide (Kokoro's fallback for unusual
    # words); ffmpeg must be on PATH for the finish step.

Audition (pick which pack carries each persona, then edit voices.json):

    python synth.py --sample

Pilot run (resumable — rerun after any interruption, done units are skipped):

    python synth.py --ids=84,1342,14838 --voices=marlowe,rowan,hazel [--device=cuda]

Outputs per unit, under work/<id>/<persona>/:
    unit-XXXXX.wav          24 kHz mono PCM
    unit-XXXXX.tokens.json  Kokoro token timings, offsets already accumulated
                            across internal chunks, relative to the unit WAV

The finish step (finish.mjs) aligns these to reader token ids and hard-fails
on any mismatch — this script never edits or reflows the planned text.
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE / "work"
VOICES = json.loads((HERE / "voices.json").read_text(encoding="utf-8"))
SAMPLE_RATE = 24000


def load_blend(pipeline, spec):
    """A voice is a pack name or a 'pack*w+pack*w' blend of pack tensors."""
    import torch

    parts = []
    for term in spec.split("+"):
        term = term.strip()
        if "*" in term:
            name, w = term.split("*")
            parts.append((name.strip(), float(w)))
        else:
            parts.append((term, 1.0))
    total = sum(w for _, w in parts)
    tensors = [pipeline.load_voice(name) * (w / total) for name, w in parts]
    return torch.stack(tensors).sum(dim=0)


def make_pipeline(spec, device):
    """British packs (b*) need lang 'b', American (a*) lang 'a'."""
    from kokoro import KPipeline

    lang = "b" if spec.strip()[0] == "b" else "a"
    return KPipeline(lang_code=lang, device=device)


def synth_unit(pipeline, voice_tensor, text, speed):
    """Synthesize one unit; returns (audio float32 mono, tokens).

    Kokoro chunks long text internally; token timestamps are per-chunk, so
    accumulate the running audio offset into every token's start/end.
    """
    import numpy as np

    audio_parts = []
    tokens = []
    offset = 0.0
    for result in pipeline(text, voice=voice_tensor, speed=speed):
        audio = result.audio
        if audio is None:
            continue
        audio = audio.detach().cpu().numpy().astype("float32")
        for t in result.tokens or []:
            if t.start_ts is None or t.end_ts is None:
                # Punctuation-only tokens sometimes carry no timing; keep them
                # with zero width at the current edge so the char stream stays
                # complete for alignment.
                edge = (tokens[-1]["end"] if tokens else offset)
                tokens.append({"text": t.text, "ws": t.whitespace, "start": edge, "end": edge})
            else:
                tokens.append({
                    "text": t.text,
                    "ws": t.whitespace,
                    "start": offset + float(t.start_ts),
                    "end": offset + float(t.end_ts),
                })
        audio_parts.append(audio)
        offset += len(audio) / SAMPLE_RATE
    if not audio_parts:
        # A unit with nothing voiced (a '* * *' separator paragraph) can
        # legitimately synthesize to nothing: emit a short deliberate silence
        # with no tokens — alignment resolves its words to zero width and the
        # pause reads as the scene break it is. Anything with voiced
        # characters producing no audio is a real failure.
        if not any(c.isalnum() for c in text):
            return np.zeros(int(SAMPLE_RATE * 0.6), dtype="float32"), []
        raise RuntimeError("Kokoro produced no audio for unit with voiced text")
    return np.concatenate(audio_parts), tokens


def write_unit(dir_, i, audio, tokens):
    """Both files land atomically, tokens LAST — the resume check requires the
    pair, so a crash between writes can only leave a WAV that gets redone."""
    import soundfile as sf

    wav = dir_ / f"unit-{i:05d}.wav"
    tmp = dir_ / f"unit-{i:05d}.wav.tmp"
    sf.write(str(tmp), audio, SAMPLE_RATE, subtype="PCM_16", format="WAV")
    tmp.replace(wav)
    tok = dir_ / f"unit-{i:05d}.tokens.json"
    tok_tmp = dir_ / f"unit-{i:05d}.tokens.json.tmp"
    tok_tmp.write_text(
        json.dumps({"v": 1, "sampleRate": SAMPLE_RATE, "durS": len(audio) / SAMPLE_RATE, "tokens": tokens}),
        encoding="utf-8",
    )
    tok_tmp.replace(tok)


def run_sample(device):
    """Synthesize the audition paragraph in every candidate voice."""
    out = WORK / "_samples"
    out.mkdir(parents=True, exist_ok=True)
    text = VOICES["sampleText"]
    speed = VOICES["speed"]
    for persona, cfg in VOICES["personas"].items():
        for spec in cfg["candidates"]:
            safe = spec.replace("*", "x").replace("+", "-").replace(".", "")
            dest = out / f"{persona}--{safe}.wav"
            if dest.exists():
                print(f"skip {dest.name} (exists)")
                continue
            pipeline = make_pipeline(spec, device)
            voice = load_blend(pipeline, spec)
            audio, _ = synth_unit(pipeline, voice, text, speed)
            import soundfile as sf

            sf.write(str(dest), audio, SAMPLE_RATE, subtype="PCM_16", format="WAV")
            print(f"wrote {dest.name} ({len(audio) / SAMPLE_RATE:.1f}s)")
    print(f"\nSamples in {out} — listen, then set each persona's `kokoro` in voices.json.")


def run_books(ids, personas, device, speed, limit_units):
    for book_id in ids:
        plan_path = WORK / book_id / "plan.json"
        if not plan_path.exists():
            print(f"{book_id}: no plan.json — run plan.mjs first (or the book was excluded).", file=sys.stderr)
            sys.exit(1)
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        for persona in personas:
            cfg = VOICES["personas"].get(persona)
            if not cfg:
                print(f"unknown persona '{persona}' — keys: {', '.join(VOICES['personas'])}", file=sys.stderr)
                sys.exit(1)
            spec = cfg["kokoro"]
            dir_ = WORK / book_id / persona
            dir_.mkdir(parents=True, exist_ok=True)
            pipeline = make_pipeline(spec, device)
            voice = load_blend(pipeline, spec)
            units = plan["units"][:limit_units] if limit_units else plan["units"]
            done = 0
            for unit in units:
                i = unit["i"]
                if (dir_ / f"unit-{i:05d}.wav").exists() and (dir_ / f"unit-{i:05d}.tokens.json").exists():
                    done += 1
                    continue
                audio, tokens = synth_unit(pipeline, voice, unit["text"], speed)
                write_unit(dir_, i, audio, tokens)
                done += 1
                if done % 25 == 0 or done == len(units):
                    print(f"{book_id}/{persona}: {done}/{len(units)} units")
            print(f"{book_id}/{persona}: complete ({len(units)} units, voice {spec}, speed {speed})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="")
    ap.add_argument("--voices", default=",".join(VOICES["personas"].keys()))
    ap.add_argument("--device", default=None, help="cuda or cpu (default: Kokoro's choice)")
    ap.add_argument("--speed", type=float, default=VOICES["speed"])
    ap.add_argument("--sample", action="store_true", help="synthesize the audition clips instead of books")
    ap.add_argument("--limit-units", type=int, default=0, help="smoke-test: only the first N units")
    args = ap.parse_args()

    if args.sample:
        run_sample(args.device)
        return
    ids = [s.strip() for s in args.ids.split(",") if s.strip()]
    if not ids:
        ap.error("pass --ids=84,1342,14838 (or --sample)")
    personas = [s.strip() for s in args.voices.split(",") if s.strip()]
    run_books(ids, personas, args.device, args.speed, args.limit_units)


if __name__ == "__main__":
    main()
