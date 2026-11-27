# MuscleFit 6.0

MuscleFit is an installable workout tracker with interactive 3D demos for all 14 exercises in the workout catalog. Select an exercise to start its demo. Red marks the primary muscles and orange marks the secondary muscles. Drag or use the arrow buttons to rotate, and pinch, scroll or use the zoom buttons to change the view. Use Camera angle for front, side, back or overhead views. Drag Rep position to pause and inspect a point in the movement. Select Reset view to bring the whole athlete back into frame. If your device requests reduced motion, press Play to start.

Existing exercises remain available for logging. MuscleFit 6.0 reads and writes the existing browser workout history on the same site and browser profile. You can also import a self-contained GLB and select one of its embedded animation clips.

## Run locally

From the repository root, run `python -m http.server 8000` and open `http://localhost:8000`. For deployment, serve the repository on an HTTPS static host. The service worker caches the app, viewer and model during the first successful online visit. After setup, the bundled demos, workout history and local GLB import work offline.

## Licenses

- The bundled athlete mesh and skeletal data come from [FormLab Motion Atlas at commit 460f0a35](https://github.com/dcdyouget/formlab-motion-atlas/blob/460f0a35b4e058c191853d5c90baf94bcf244ceb/athlete-model.js). Its [asset license notice](https://github.com/dcdyouget/formlab-motion-atlas/blob/460f0a35b4e058c191853d5c90baf94bcf244ceb/ASSET-LICENSES.md) identifies the processed model, MakeHuman source mesh, morph targets and skin weights as CC0 1.0. The bundled file is unchanged and its SHA-256 is `76f9267f743c6519693c3a076347e065441adbeea56d74efd2531a91926d4612`. See the [CC0 legal code](assets/LICENSE-athlete-CC0.txt).
- Three.js r174 and its bundled add-ons are distributed under the [MIT license](assets/vendor/LICENSE-three.txt). They run locally without a CDN.
- The exercise poses, equipment geometry and app code are covered by this repository’s [MIT license](LICENSE). The exercise demos are illustrative.
