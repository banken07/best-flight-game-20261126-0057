# Atoll Run — Island Flight

A low-poly 3D flight game for the make.fun "Make the best flight game"
bounty (best-flight-game-20261126-0057).

One sortie, three stages: fly 5 glowing rings over the atoll, drop supply
crates on both island huts, then land on runway 36 — with fuel management
across the whole sortie and a full score breakdown at the end.

The renderer is a hand-rolled software 3D engine in plain Canvas 2D: a
perspective chase camera, a flat-shaded island heightmap with beach, hills,
pines and huts, a solid low-poly plane that visibly banks in turns, glowing
rings, and distance fog. No external libraries, no network requests.

## Play

Serve `game/` locally and open it in a desktop browser:

```
node serve.ts        # then open http://localhost:8080
```

Controls: W/S throttle, arrow keys fly, A/D rudder, Space drop the crate,
R restart, P pause, M mute.

## Tests

```
node ../test-atoll-3d.mjs
```

Runs the autopilot headlessly through the full sortie (Node 22 +
Playwright Chromium) and captures the four staged screenshots into
`screenshots/`.

## License

MIT. See LICENSE.
