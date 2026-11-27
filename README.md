# MuscleFit 5.0 — PWA prototype
Deploy all files to an HTTPS static host (e.g. GitHub Pages), or run `python -m http.server 8000` locally and open http://localhost:8000. On Android Chrome open the HTTPS URL and choose Install app / Add to home screen. No app store required.

Three.js modules load from jsDelivr on first visit. The service worker caches successful requests, but first use needs internet. Imported GLB models are not persisted; reopen them after restarting. Workout history is local to the browser.

Model workflow: use MakeHuman or MPFB in Blender to create a clothed character, rig and animate it, then export GLB with animations enabled. Import the GLB and select a matching clip manually. The optional online MakeHuman OBJ is the unrigged source base, not a finished athlete. No professional animation clips were downloaded or bundled; no muscle activation overlay is implemented in this version. Exercise selection is independent of imported clips. Do not treat the animations as validated medical or biomechanical guidance.

MakeHuman bundled assets: CC0, https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md . Three.js: MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE . No third-party exercise-animation repository code copied. No paid assets required. Hosting is not provisioned. Browser/device runtime not tested.
