---
name: verify-ngorongoro-crater
description: "Verify Ngorongoro Crater in a real browser: launch the deployed site, drive the user path, capture proof. Use when shipping any change to this repo, when something looks wrong live, or for a scheduled verification round."
---

# Verify Ngorongoro Crater

Surface: flat 2D layered-canvas world, four chapters via a bottom dot dock (aria-label 'Faces of the crater'). Deployed static site; there is no local server to launch -
the user-facing surface is production, and pre-merge changes are verified on
the PR's Vercel preview (URL from the Vercel bot comment on the PR; branch
aliases over 63 chars get hashed, never construct one).

## Launch

Open https://ngorongoro-crater.vercel.app in the cloud browser (read lease is enough). Ready = the canvas
and the chapter navigation are present in the accessibility tree. Teardown:
release the lease.

## Doctor

Run first whenever anything looks off:
1. `curl -sI https://ngorongoro-crater.vercel.app` returns 200.
2. The served bundle carries the last merged marker for the change under test
   (grep the JS/CSS with a cache-buster query param; CDN cache lags ~30s).
3. In the browser, read-page shows the chapter controls as buttons with their
   aria labels. If controls are missing, the page failed to boot - capture the
   console via execute-js before concluding anything.

## Drive

The app throttles requestAnimationFrame in the cloud browser. Rules that make
drives honest here - do not skip them:

- Chapter/scene transitions need 20-25 seconds of wall-clock to settle before
  a frame is judged. Capturing early reads a mid-lerp frame as a bug.
- Chrome (wordmark, caption, whisper, navigation) auto-hides ~4.2s after the
  last input and the idle layer is pointer-events:none - the first tap wakes
  the chrome and does NOT reach the scene. Dispatch a real pointerdown on the
  canvas IMMEDIATELY before every navigation click, in the same batch.
- Chrome fades back IN over ~0.9s on wake; a capture inside that window fakes
  faintness. Settle disputes with computed style, not pixels.
- Navigate by accessibility refs from read-page (button aria labels), never
  coordinates.
- Drive both widths: desktop and 390px phone (set-viewport mobile). Every
  scene change is verified at both.

Chapter drive (dot dock):
- Click the dot labelled "The crater rim at dawn" (span "Rim"), wake first, settle 20-25s,
  screenshot; assert exactly that dot carries aria-current=true afterward.
- Click the dot labelled "The animal floor" (span "Floor"), wake first, settle 20-25s,
  screenshot; assert exactly that dot carries aria-current=true afterward.
- Click the dot labelled "The flamingo lake" (span "Lake"), wake first, settle 20-25s,
  screenshot; assert exactly that dot carries aria-current=true afterward.
- Click the dot labelled "The Maasai night on the rim" (span "Night"), wake first, settle 20-25s,
  screenshot; assert exactly that dot carries aria-current=true afterward.

## Evidence

Saved screenshots (screenshot --save) of every chapter at both widths after
settling, plus the DOM checks named per feature (e.g. aria-current, computed
ink color). Keep the /downloads paths; they are the proof bundle for the
round's report.

## Cleanup

Release the browser lease. Evidence survives in /downloads and in the round
report; no server-side state exists to tear down.

## Helpers

None. All drives use the cloud browser's standard actions.
