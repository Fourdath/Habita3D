# Third-party assets

All assets below are CC0 (public domain) and were downloaded once and committed locally;
none are fetched remotely at runtime.

## Textures — Poly Haven (CC0, 1K resolution)

Each texture set has `diffuse.jpg` (Base Color, sRGB), `normal.png` (OpenGL normal map,
`nor_gl`, linear), and `roughness.jpg` (linear). Downloaded via Poly Haven's public
`https://api.polyhaven.com/files/<slug>` API.

| Directory | Source | Used for |
| --- | --- | --- |
| `textures/leafy_grass/` | https://polyhaven.com/a/leafy_grass | Exterior terrain |
| `textures/oak_wood_planks/` | https://polyhaven.com/a/oak_wood_planks | Nordic style floor |
| `textures/white_stucco/` | https://polyhaven.com/a/white_stucco | Nordic style wall |
| `textures/rough_concrete/` | https://polyhaven.com/a/rough_concrete | Industrial style wall (general) |
| `textures/laminate_floor_02/` | https://polyhaven.com/a/laminate_floor_02 | Industrial style floor |
| `textures/brick_wall_003/` | https://polyhaven.com/a/brick_wall_003 | Industrial accent wall (prepared, not yet applied per-wall — see MaterialLibrary) |

## Furniture GLB — poly.pizza (CC0)

Individual models only — no ZIP bundle is committed. Fetched from the direct
`https://static.poly.pizza/<uuid>.glb` CDN link exposed on each model's poly.pizza page.

Nordic set — from Quaternius's "Ultimate House Interior Pack"
(https://poly.pizza/bundle/Ultimate-House-Interior-Pack-2SXnFbwFzm):

| File | Source model |
| --- | --- |
| `furniture/nordic/sofa.glb` | "Couch Medium" — https://poly.pizza/m/mWgQ94zhDZ |
| `furniture/nordic/table.glb` | "Table Round Small" — https://poly.pizza/m/oEArSZykyi |
| `furniture/nordic/chair.glb` | "Chair" — https://poly.pizza/m/iMNqRzPwwe |
| `furniture/nordic/bed.glb` | "Bed Single" — https://poly.pizza/m/ianC28eMOF |
| `furniture/nordic/nightstand.glb` | "Night Stand" — https://poly.pizza/m/9LI73c5uFA |

Industrial set — from Kenney's "Furniture Kit"
(https://poly.pizza/bundle/Furniture-Kit-NoG1sEUD1z):

| File | Source model |
| --- | --- |
| `furniture/industrial/sofa.glb` | "Lounge Design Sofa" — https://poly.pizza/m/xYNuGPF9wK |
| `furniture/industrial/table.glb` | "Table" — https://poly.pizza/m/41R2HTYj1O |
| `furniture/industrial/chair.glb` | "Chair" — https://poly.pizza/m/vHyrBYPBum |
| `furniture/industrial/bed.glb` | "Bed Double" — https://poly.pizza/m/wcmbCZ63mg |
| `furniture/industrial/nightstand.glb` | "Cabinet Bed Drawer" — https://poly.pizza/m/sssyoQUBUu |

All ten models are CC0 1.0 per their poly.pizza listing.

## Pre-existing demo assets

- `models/demo/collision-world.glb` — official three.js "games_fps" example scenario,
  kept from the viewer's first technical prototype; no longer loaded at runtime (see
  its own `models/demo/README.md`).
- `floorplans/model.svg` — CubiCasa5K demo floor plan ("high_quality_17"), the default
  plan loaded by `/viewer-3d`.
