# Realistic render prompt pack

Ready-to-run prompts for photorealistic mockups, one per money shot. Written
for Gemini's image model ("Nano Banana") but they work in any decent image
model. Two modes:

- **Same-room mode (best):** give the model one of the real photos from
  `photos/` **plus** the prompt, phrased as an edit instruction. Keeps the
  actual geometry — this is the "what OUR basement would look like" version.
- **Concept mode:** prompt only, no photo. Gets the vibe, invents geometry.

Status: not yet generated. A free keyless service (pollinations.ai) was
tried on 2026-08-28 and produced unusable smeary output — don't bother
again; use a real model (Vertex/Gemini, Weave, or Michael runs these by
hand). Store outputs as `mockups/renders/<name>.jpg`.

## Same-room preamble (prepend in same-room mode, with photos/2026-08-gym-end.jpg)

> Renovate this exact basement room, keeping the same camera angle, room
> geometry, ceiling joists, and the same black power rack with rings.
> Remove all boxes, coolers, wire shelving, and the fridge. Then:

## The five shots

**t1-gym — Tier 1 "Iron & Paint"**
> Cinder block walls painted warm bronze-charcoal (near-black warm brown), raw exposed wood
> joist ceiling with silver ducts left as-is, black rubber stall-mat floor
> with visible seams, black steel power rack with wooden gymnastic rings and
> a loaded barbell, adjustable bench, folded black treadmill against the
> side wall, two slim black linear LED shop lights hanging under the joists
> casting warm pools of light, a warm LED strip line where wall meets ceiling, full-height
> dark charcoal blackout curtain
> closing off the near end, clean and organized, budget DIY renovation,
> moody warm lighting, 35mm interior photograph.

**t2-gym — Tier 2 "The Boutique"**
> Smooth warm espresso painted block walls, ceiling joists, ducts and pipes all
> spray-painted matte black, a warm LED cove line at the ceiling edge, two large black-framed backlit mirrors with warm halo glow on the long
> wall, black-steel-framed glass partition wall with a glass door at the
> near end glowing warm from an office beyond, suspended black linear
> pendant lights, oak shelf and steel pegs holding black bumper plates, aged
> brass wall hooks, charcoal rubber roll flooring, black power rack with
> wooden rings, warm accent lighting, editorial interior photograph.

**t3-gym — Tier 3 "The Club"**
> White oak slat feature wall with aged brass sconces and a floating oak
> bench, opposite wall a full-height mirror wall reflecting a black power
> rack with barbell, flush ceiling painted warm near-black with recessed
> downlights and a warm cove glow washing the oak slats, premium charcoal
> rubber floor, cedar sauna door with a glass window in the far corner, warm
> umber accent wall, unlacquered brass details, dramatic warm lighting,
> Architectural Digest interior photograph.

**t2-office — Tier 2 office** (concept mode, or same-room on a photo of the middle zone)
> Cozy refined basement home office, warm white walls, oak LVP floor, walnut
> desk with monitor and warm brass desk lamp, black-steel-framed glass
> partition behind the desk looking into a moody warm charcoal home gym with a
> black power rack, warm wall sconce, charcoal wool rug, one large framed
> print, potted plant, quiet editorial interior photograph.

**t2-laundry — Tier 2 laundry** (same-room mode with photos/2026-08-laundry-end.jpg; keep the black LG machines)
> Finished painted walls, butcher-block oak counter over the two black
> front-load machines, white square-tile backsplash, espresso-painted
> cabinets with aged brass knobs, white utility sink, drying rod with
> hangers, woven baskets, oak LVP floor, bright even warm lighting,
> editorial interior photograph.

## Integration once generated

Drop files in `mockups/renders/`, then have a session embed them at the top
of each tier board in `mockups/index.html` (data URIs ≤ ~400 KB each,
recompress to ~1400px wide q80) and republish the artifact. Keep the SVG
elevations below the renders as the dimensioned diagrams.

## Style reference mode (recommended)

Attach one image from `inspiration/` as a SECOND input image after the room
photo, and append to the prompt: *"Match the lighting mood, material palette
and level of finish of the last reference image (it is style inspiration,
not the room)."* The generation script does this automatically:

| Shot | Style ref |
|---|---|
| t1-gym | inspiration/02-black-light-bars.jpg |
| t2-gym, t2-office, t2-laundry | inspiration/01-halo-mirrors-cove.jpg |
| t3-gym | inspiration/03-wood-ceiling-luxe.jpg |
