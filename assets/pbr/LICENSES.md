# assets/pbr — sources and licences

Everything in this folder is used by `js/three/pbr.js` on the **Medium / High** graphics tiers only (Low loads none of it).
All third-party files are **CC0 1.0 (public domain dedication)**: free for commercial use, no payment, no attribution
required. The originals were downloaded from public GitHub mirrors (the only hosts reachable from the build machine) and
re-encoded here; the "processing" column says what was done. Nothing with an unclear licence was taken.

## Environment maps (`env/`) — image-based lighting

1024 × 512 equirect JPEG holding `(min(radiance, max) / max)^(1/2.2)`; decoded to HDR and prefiltered (PMREM) at runtime.
`env/manifest.json` holds `max`, the mean radiance and the sun position of each map.

| File | Original | Author / publisher | Licence | Downloaded from | Processing |
|---|---|---|---|---|---|
| `env/interior.jpg` (29 KB) | **Lebombo** — https://polyhaven.com/a/lebombo | Greg Zaal / Poly Haven | CC0 | `hdri/lebombo_1k.hdr` in https://github.com/pmndrs/drei-assets (commit 456060a) | clipped at 12, Gaussian blur 2 px, gamma-encoded |
| `env/day.jpg` (38 KB) | **Kloppenheim 05** — https://polyhaven.com/a/kloppenheim_05 | Poly Haven | CC0 | `hdri/kloppenheim_05_1k.hdr` in https://github.com/gkjohnson/3d-demo-data (commit 1be9486) | clipped at 24 (the sun disc is replaced by the scene's own sun light), blur 0.7 px |
| `env/dusk.jpg` (31 KB) | **Blouberg Sunrise 2** — https://polyhaven.com/a/blouberg_sunrise_2 | Poly Haven | CC0 | `examples/textures/equirectangular/blouberg_sunrise_2_1k.hdr` in https://github.com/mrdoob/three.js (tag r160) | clipped at 16, blur 0.7 px |
| `env/night.jpg` (30 KB) | **Moonless Golf** — https://polyhaven.com/a/moonless_golf | Poly Haven | CC0 | `examples/textures/equirectangular/moonless_golf_1k.hdr` in https://github.com/mrdoob/three.js (tag r160) | clipped at 6, blur 1 px |

Poly Haven licence: https://polyhaven.com/license — "All our assets are released under the CC0 license", commercial work
included (checked on https://docs.polyhaven.com/en/faq, October 2026). The mirror repositories state the origin:
drei-assets README "HDRIs from HDRI Haven", 3d-demo-data README "HDRI files are from Polyhaven.com".

## Detail maps (`detail/`) — fine relief and sheen on the procedural materials

One packed, tileable JPEG per material kind, 1024 px and 512 px: **R, G** = tangent-space normal (OpenGL, +Y up),
**B** = roughness variation around 0.5 (large-scale drift removed). Colour maps of the originals are not shipped — every
interior style keeps its own procedural colours.

| Files | Original | Publisher | Licence | Downloaded from | Processing |
|---|---|---|---|---|---|
| `detail/marble_*.jpg` | **Marble 006** — https://ambientcg.com/view?id=Marble006 | ambientCG (Lennart Demes) | CC0 | `files/materials/marble/Marble006_1K_{Normal,Roughness}.jpg` in https://github.com/pmndrs/market-assets (commit c9cfa02) | normal converted DirectX → OpenGL, low frequencies removed; roughness high-passed |
| `detail/mineral_*.jpg` (concrete, epoxy, outdoor tiles) | **Rock 020** — https://ambientcg.com/view?id=Rock020 | ambientCG | CC0 | `files/materials/rock/Rock020_1K_{Normal,Roughness}.jpg`, same repository | as above |
| `detail/wood_*.jpg` (plank floors) | **Wood Floor 043** — https://ambientcg.com/view?id=WoodFloor043 | ambientCG | CC0 | `files/materials/wood-floor-43/WoodFloor043_1K_{Color,Normal,Roughness,Displacement}.jpg`, same repository | plank seams of the photograph removed (in-painted), grain relief rebuilt from the fine structure of the colour map, 2 : 1 tile |
| `detail/fabric_*.jpg` | **Fabric Pattern 07** — https://polyhaven.com/a/fabric_pattern_07 | Poly Haven | CC0 | `3d/soft_body_physics/textures/polyhaven/fabric_pattern_07_{nor_gl,arm}_1k.jpg` in https://github.com/godotengine/godot-demo-projects (commit 3e08537) | normal low frequencies removed; roughness (ARM green channel) high-passed |
| `detail/plaster_*.jpg` | — (no third-party source) | generated for this project | project's own | — | procedural roller-stipple relief made with NumPy noise; no CC0 plaster set was obtainable from the reachable hosts |

ambientCG licence: https://docs.ambientcg.com/license/ — all ambientCG assets are published under CC0 1.0 Universal. (That
page could not be opened from the build machine; the statement rests on ambientCG's published terms and on the
pmndrs market catalogue, which lists these three sets with `"creator": "ambientcg"` and its public-domain licence code.)

Not used, and why: no CC0 concrete, asphalt or plaster photograph was available on the reachable hosts (concrete and
epoxy use the Rock 020 relief at low strength; asphalt and paving outdoors keep the procedural grain that
`environment.js` already generates; plaster is procedural). The three.js example textures `hardwood2_*`, `brick_*`,
`floors/*` and the normal maps in pmndrs/drei-assets carry no licence statement and were skipped.

## Code

`site/vendor/addons/postprocessing/Pass.js`, `site/vendor/addons/shaders/{GTAOShader,FXAAShader,BokehShader}.js` are
unmodified files of three.js r160 (MIT, © 2010-2023 three.js authors — `site/vendor/addons/LICENSE-three.js.txt`).
FXAA is by Timothy Lottes (NVIDIA), the bokeh shader by Martins Upitis, as credited in those files.
