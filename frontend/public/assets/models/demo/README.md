# Demo model

`collision-world.glb` is a **temporary** placeholder scenario used by
`frontend/src/app/features/viewer-3d` while the real Habita3D scene pipeline
(floor-plan processing, project scenes) doesn't exist yet.

- **Source:** official three.js "games_fps" example
  https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/models/gltf/collision-world.glb
- **Upstream example:** https://github.com/mrdoob/three.js/blob/r185/examples/games_fps.html
- **License:** MIT (three.js), bundled here as a static asset — not fetched at runtime.
- **Why local:** requirement to keep the demo self-contained and not depend on an
  external CDN/network fetch at runtime.

Replace this file (and `MODEL_URL` in `engine/viewer-3d.constants.ts`) once a real
scene is available.
