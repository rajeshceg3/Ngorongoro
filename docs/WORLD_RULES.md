# Worlds Rulebook

Standing design and engineering rules for every world in the fleet. This file is
canonical; each public world repo carries a verbatim copy at `docs/WORLD_RULES.md`,
re-synced from here during that world's improvement round.

## Interaction

1. **360 look-around is the default world interaction** for 3D worlds: horizontal
   drag rotates the view with unbounded azimuth; vertical range stays shallow so
   the horizon keeps its dignity. Camera inertia is tuned per world - floating
   drift where calm is the point, direct low- or no-inertia control where
   precision matters.
2. **Gestures never fight.** A drag that starts on navigation chrome or a sheet
   never rotates the world; a drag on the world never steals navigation. World
   drag is reserved for looking around.
3. **Chapter navigation is scoped, not imposed.** Ordered chapters/scenes accept
   a horizontal swipe within their navigation control, and every gesture has a
   tap and a keyboard alternative (arrow keys when the control is focused).
   Sheets open and close vertically. Existing tap-only docks are in scope for
   the horizontal chapter swipe; nothing forces bottom sheets onto worlds that
   do not want them.
4. **Chapter transitions preserve the intended view.** Switching chapters keeps
   the viewer's azimuth unless the chapter deliberately defines its own entry
   view.

## Motion and accessibility

5. **Reduced motion is a mode, not a lesser world.** Suppress unsolicited
   ambient motion; keep user-directed look-around available with direct,
   low- or no-inertia control. Verify the mode in an emulated
   `prefers-reduced-motion` environment before shipping - behavior, not code
   review alone.
6. **Accessibility guard.** Visible focus styles, honest aria states on custom
   controls, labels that describe the world rather than instruct the user.

## Content and depth

7. **Progressive disclosure.** Depth folds behind a named invitation, never an
   instruction ("tap to learn more"). No eyebrows, no repeated template
   furniture, no instruction-like captions.
8. **Facts are verified and humble.** Check against authoritative sources,
   phrase without guarantees, attribute assessments, qualify conditions.
9. **Clutter-free is the constraint, not the finish line.** Reward curiosity
   without filling every quiet space; emptiness can be the content.

## Quality

10. **Blind-spot audit.** In every 360 world, inspect all four quadrants in
    every scene state. Each quadrant should reward looking - a heuristic, not
    a quota that overrides calm composition. Transitions between quadrants
    must never cross a void.
11. **Verify behavior, not labels.** Drive the real user path at pointer level,
    at 390px and laptop widths, against preview before merge and production
    after merge. Screenshots settle: scroll-driven animations need settle time
    before a capture is judged.
12. **Flat 2D worlds that want 360 are explicit rebuild work** - tracked,
    scoped, never silently excluded and never a bolted-on rotation.

## Fleet operations

13. Ship via pull request; merge only after browser verification; re-verify
    production after merge. Keep a repeatable verification harness per world.
14. Every world update report carries the final production URL and honest
    below-bar notes.
