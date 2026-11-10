# Ngorongoro refinement - 2026-11-10

- Elevated rim looks across the whole crater floor; smooth shared terrain normals and coherent value noise replace faceted banding.
- Elephant family: smooth meshes, eyes, larger ears, continuous curved trunk, smaller calf, framed across the water.
- Irregular water boundary and animated ripple shader; static under reduced motion.
- Maasai group moved to a levelled rim patch and night camera aims at it. Fire glow added.
- Text uses a bounded high-opacity surface rather than scene-wide bands.
- Reset clears velocity. Actual drag/reset/held-angle test passed at 390 and 1440 in both motion modes, rim and floor.
- Navigation gate passed at 320x568 and 390x844 in both motion modes.
- Glyph-pixel contrast capture: 390x844 and 1440x900, all four chapters, caption, whisper, active masthead, all four navigation labels. Black/white diagnostic renders identify solid glyph cores; transparent-text render supplies the matching backdrop. Original rendered ink vs that backdrop gives worst ratio 6.786:1 across 56 element/chapter/viewport samples. This tests settled chapter states, not arbitrary camera positions or every transitional frame. Screenshots capture reduced motion.
- Audio: opt-in behavior/context state tested earlier; listening not verified. No claim of audio quality/completion.

Run capture with `OUT=docs/contrast/local SIZES='[[390,844]]' node tests/glyph-contrast-capture.cjs` while the app is served at port 8785 (or set BASE_URL). `OUT=docs/contrast/local python3 tests/glyph-contrast.py` requires Pillow and NumPy. Split CHAPTERS into [0,1] and [2,3] on slow renderers. Desktop SIZES=[[1440,900]]. Glyph captures intentionally freeze animation after settled state and force masthead visibility to avoid counting an idle-hidden label as passed.
