import * as T from 'three';
import {OrbitControls} from './assets/vendor/OrbitControls.js';
import {createAthlete, muscleGroups, muscleNames} from './athlete.js';

const $ = id => document.getElementById(id);
const library = {
  Chest: [['Push-up', 10, 'Keep your torso straight.'], ['Floor press', 12, 'Keep wrists above elbows.']],
  Arms: [['Biceps curl', 15, 'Keep elbows stationary.'], ['Hammer curl', 12, 'Keep palms facing inward.'], ['Alternating curl', 12, 'Curl one arm at a time and keep your elbows close.']],
  Abs: [['Crunch', 15, 'Lift shoulder blades without pulling the neck.'], ['Leg raise', 10, 'Keep the lower back supported.']],
  Shoulders: [['Lateral raise', 12, 'Avoid shrugging.'], ['Shoulder press', 12, 'Keep ribs down.'], ['Front raise', 12, 'Raise both weights forward to shoulder height.']],
  Back: [['Bent-over row', 15, 'Hinge at hips with a neutral spine.']],
  Legs: [['Goblet squat', 15, 'Keep heels planted.'], ['Calf raise', 20, 'Rise and lower slowly.'], ['Glute bridge', 15, 'Press through both feet and lift your hips.']],
};
const historyKey = 'mf5';
let history = [];
try {
  const saved = JSON.parse(localStorage.getItem(historyKey) || '[]');
  if (Array.isArray(saved)) history = saved;
} catch (error) {
  console.warn('Could not read workout history', error);
}

let group = 'Arms';
let index = 0;
let restEnds = 0;
let restTimer;
let viewer;
const exercise = () => library[group][index];
const today = () => new Date().toLocaleDateString();

function choice(label, selected, select) {
  const button = document.createElement('button');
  button.textContent = label;
  button.setAttribute('aria-pressed', selected);
  button.onclick = select;
  return button;
}

function refreshWorkout() {
  const [name, reps, tip] = exercise();
  $('title').textContent = name;
  $('tip').textContent = tip;
  const sets = history.filter(entry => entry.name === name && entry.date === today()).length;
  $('stats').textContent = `3 sets × ${reps} reps · ${sets} logged today`;
  $('history').replaceChildren(...history.slice(-15).reverse().map(entry => {
    const row = document.createElement('p');
    row.textContent = `${entry.date} · ${entry.name} · ${entry.reps} reps`;
    return row;
  }));
}

function selectExercise() {
  $('groups').replaceChildren(...Object.keys(library).map(key => choice(key, group === key, () => {
    group = key;
    index = 0;
    selectExercise();
  })));
  $('exercises').replaceChildren(...library[group].map(([name], i) => choice(name, index === i, () => {
    index = i;
    selectExercise();
  })));
  refreshWorkout();
  viewer?.select(exercise()[0]);
}

function updateRest() {
  const seconds = Math.max(0, Math.ceil((restEnds - Date.now()) / 1000));
  $('rest').textContent = seconds ? `Recovery: ${seconds} seconds` : '';
  if (!seconds) clearInterval(restTimer);
}

$('log').onclick = () => {
  const [name, reps] = exercise();
  history.push({date: today(), name, reps});
  localStorage.setItem(historyKey, JSON.stringify(history));
  restEnds = Date.now() + 60000;
  clearInterval(restTimer);
  refreshWorkout();
  updateRest();
  restTimer = setInterval(updateRest, 250);
};
$('reset').onclick = () => {
  if (confirm('Clear workout history?')) {
    localStorage.removeItem(historyKey);
    history = [];
    refreshWorkout();
  }
};

let installPrompt;
addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('install').hidden = false;
});
$('install').onclick = async () => {
  await installPrompt?.prompt();
  installPrompt = undefined;
  $('install').hidden = true;
};
addEventListener('appinstalled', () => { $('install').hidden = true; });

if ('serviceWorker' in navigator) {
  const workers = navigator.serviceWorker;
  const hasController = Boolean(workers.controller);
  const update = $('update');
  let reloadOnActivate = false;
  workers.addEventListener('controllerchange', () => {
    if (!hasController) return;
    if (reloadOnActivate) {
      location.reload();
      return;
    }
    update.hidden = false;
    update.onclick = () => location.reload();
  });
  workers.register('./sw.js').then(registration => {
    function showUpdate() {
      if (!workers.controller || !registration.waiting) return;
      update.hidden = false;
      update.onclick = () => {
        reloadOnActivate = true;
        registration.waiting?.postMessage('activate-update');
      };
    }
    showUpdate();
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', showUpdate);
    });
  }).catch(console.warn);
}

function contactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
    map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .003;
  return mesh;
}

function createViewer() {
  const stage = $('stage');
  const renderer = new T.WebGLRenderer({antialias: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  stage.append(renderer.domElement);
  const scene = new T.Scene();
  const backdrop = document.createElement('canvas');
  backdrop.width = 512;
  backdrop.height = 256;
  const brush = backdrop.getContext('2d');
  const wash = brush.createLinearGradient(0, 0, 0, 256);
  wash.addColorStop(0, '#172429');
  wash.addColorStop(.42, '#314046');
  wash.addColorStop(.50, '#506063');
  wash.addColorStop(1, '#506063');
  brush.fillStyle = wash;
  brush.fillRect(0, 0, 512, 256);
  const studio = new T.CanvasTexture(backdrop);
  studio.colorSpace = T.SRGBColorSpace;
  studio.mapping = T.EquirectangularReflectionMapping;
  scene.background = studio;
  scene.fog = new T.Fog(0x506063, 4.5, 11);
  // Broad softboxes provide reflections on the chrome even when orbiting.
  const reflections = document.createElement('canvas');
  reflections.width = 512;
  reflections.height = 256;
  const panels = reflections.getContext('2d');
  panels.drawImage(backdrop, 0, 0);
  panels.fillStyle = '#fff3df';
  panels.fillRect(65, 40, 105, 48);
  panels.fillStyle = '#d6e9f6';
  panels.fillRect(328, 52, 48, 84);
  scene.environment = new T.CanvasTexture(reflections);
  scene.environment.colorSpace = T.SRGBColorSpace;
  scene.environment.mapping = T.EquirectangularReflectionMapping;
  scene.environmentIntensity = .45;
  const camera = new T.PerspectiveCamera(37, 1, .03, 25);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * .48;
  controls.minDistance = .75;
  controls.maxDistance = 7;
  controls.autoRotateSpeed = 1.2;
  scene.add(new T.HemisphereLight(0xffeee2, 0x87959f, 1.25));
  const key = new T.DirectionalLight(0xffe5ce, 2.85);
  key.position.set(-2.4, 4.8, 3);
  key.target.position.y = .85;
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, {left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: .5, far: 10});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias = .012;
  const rim = new T.DirectionalLight(0xddf4ff, 2.9);
  rim.position.set(2, 2.4, -2);
  scene.add(key, key.target, rim);
  const ground = new T.Mesh(new T.PlaneGeometry(32, 32), new T.MeshStandardMaterial({color: 0x303b49, roughness: 1}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.065;
  ground.receiveShadow = true;
  // Fine rubber flecks repeat in floor space and mipmap down at a distance.
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const rubber = tile.getContext('2d');
  rubber.fillStyle = '#3c494a';
  rubber.fillRect(0, 0, 128, 128);
  let seed = 17;
  function sample() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let n = 0; n < 3600; n++) {
    rubber.fillStyle = n % 4 ? '#364244' : '#566365';
    rubber.fillRect(sample() * 128, sample() * 128, 1.3, 1);
  }
  const texture = new T.CanvasTexture(tile);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(70, 70);
  ground.material.color.setHex(0xffffff);
  ground.material.map = texture;
  // A shallow rubber platform gives the athlete and the cast shadow a common surface.
  const matTexture = texture.clone();
  matTexture.repeat.set(5, 5);
  const mat = new T.Mesh(new T.CylinderGeometry(1.26, 1.28, .060, 80),
    new T.MeshStandardMaterial({map: matTexture, color: 0x899795, roughness: .96}));
  mat.position.y = -.031;
  mat.receiveShadow = true;
  const edge = new T.Mesh(new T.RingGeometry(1.205, 1.213, 80),
    new T.MeshStandardMaterial({color: 0x637570, roughness: .87}));
  edge.rotation.x = -Math.PI / 2;
  const shadow = contactShadow();
  shadow.material.opacity = .4;
  scene.add(ground, mat, edge, shadow);

  const athlete = createAthlete(window.ATLAS_MODEL_DATA);
  scene.add(athlete.root);
  const zoomButtons = {left: -.30, right: .30, closer: .82, farther: 1.22};
  Object.entries(zoomButtons).forEach(([id, step]) => {
    $(id).onclick = () => {
      const vector = camera.position.clone().sub(controls.target);
      if (id === 'left' || id === 'right') vector.applyAxisAngle(camera.up, step);
      else vector.setLength(T.MathUtils.clamp(vector.length() * step, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(vector);
      controls.update();
      dirty = true;
    };
  });

  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let name, imported, mixer, clips = [], phase = 0, dirty = true, speed = 1, last = null;
  let importRequest = 0;
  function updatePlayback() {
    renderer.shadowMap.needsUpdate = true;
    $('rep-position').hidden = Boolean(imported || !muscleGroups[name]);
    const available = imported ? clips.length > 0 : Boolean(muscleGroups[name]);
    $('play').disabled = $('speed').disabled = !available;
    $('play').textContent = playing ? 'Pause' : 'Play';
  }

  function frameAthlete() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const push = name === 'Push-up';
    const crunch = name === 'Crunch';
    const floor = push || crunch || name === 'Glute bridge' || name === 'Leg raise' || name === 'Floor press';
    const overhead = name === 'Shoulder press';
    const row = name === 'Bent-over row';
    const raise = name === 'Lateral raise';
    const halfVertical = T.MathUtils.degToRad(camera.fov / 2);
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
    const verticalRadius = floor ? .87 : overhead ? 1.25 : row ? .85 : 1.04;
    const horizontalRadius = floor ? 1.12 : raise ? .89 : .65;
    const distance = Math.max(verticalRadius / Math.sin(halfVertical), horizontalRadius / Math.sin(halfHorizontal));

    controls.target.set(0, floor ? .39 : overhead ? 1.10 : row ? .76 : .94, push ? .1 : crunch ? -.08 : row ? .12 : 0);
    const angle = new T.Vector3(row ? 2.6 : floor ? 2.5 : 1.5, crunch ? 1.6 : floor ? 1.1 : .52, row ? -1.35 : floor ? 1.55 : 2.6);
    camera.position.copy(controls.target).add(angle.setLength(distance));
    controls.update();
    dirty = true;
  }

  const angles = {front: [0, .10, 1], side: [1, .10, 0], back: [0, .10, -1], above: [0, 1, .001]};
  $('view').onchange = () => {
    const angle = angles[$('view').value];
    if (!angle) return;
    const distance = camera.position.distanceTo(controls.target);
    controls.autoRotate = false;
    $('orbit').setAttribute('aria-pressed', false);
    camera.position.copy(controls.target).add(new T.Vector3(...angle).setLength(distance));
    controls.update();
    $('view').value = '';
    dirty = true;
  };
  $('scrub').oninput = () => {
    if (imported) return;
    playing = false;
    phase = Number($('scrub').value) / 100;
    athlete.pose(name, phase);
    updatePlayback();
    dirty = true;
  };

  $('fit').onclick = () => {
    if (!imported) {
      frameAthlete();
    } else {
      camera.position.set(1.62, 1.53, 2.42);
      controls.target.set(0, .9, 0);
      controls.update();
      dirty = true;
    }
  };

  function select(next) {
    name = next;
    phase = 0;
    $('scrub').value = 0;
    const groups = muscleGroups[name];
    $('legend').hidden = Boolean(imported || !groups);
    $('stage').hidden = $('viewer-controls').hidden = !imported && !groups;
    if (groups && !imported) {
      $('secondary-label').hidden = !groups.secondary.length;
      for (const kind of ['primary', 'secondary']) {
        $(kind).textContent = groups[kind].map(id => muscleNames[id]).join(', ');
      }
    }
    if (!imported) {
      athlete.setExercise(name);
      if (groups) athlete.pose(name, 0);
      $('status').textContent = groups
        ? 'Drag to rotate. Pinch or scroll to zoom.'
        : 'This exercise is available for logging. A 3D demo is coming in a later update.';
      athlete.root.visible = Boolean(groups);
      shadow.visible = Boolean(groups);
      const floor = ['Push-up', 'Crunch', 'Floor press', 'Leg raise', 'Glute bridge'].includes(name);
      shadow.scale.set(floor ? 1.15 : .90, floor ? 1.95 : .72, 1);
      if (groups) frameAthlete();
    }
    updatePlayback();
    dirty = true;
  }

  function removeImport() {
    if (!imported) return;
    mixer.stopAllAction();
    mixer.uncacheRoot(imported);
    scene.remove(imported);
    const resources = new Set();
    imported.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean)) {
        resources.add(material);
        Object.values(material).filter(value => value?.isTexture).forEach(texture => resources.add(texture));
      }
      if (object.skeleton) resources.add(object.skeleton);
    });
    resources.forEach(resource => resource.dispose());
    imported = mixer = undefined;
    clips = [];
  }

  $('model').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    const request = ++importRequest;
    try {
      const {GLTFLoader} = await import('./assets/vendor/loaders/GLTFLoader.js');
      const bytes = await file.arrayBuffer();
      // Reject references outside the GLB so opening a file stays offline.
      const header = new DataView(bytes);
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, header.getUint32(12, true))));
      if ([...(json.images || []), ...(json.buffers || [])].some(item => item.uri && !item.uri.startsWith('data:'))) {
        throw new Error('Use a GLB with embedded assets.');
      }
      const gltf = await new GLTFLoader().parseAsync(bytes, '');
      if (request !== importRequest) return;
      removeImport();
      imported = gltf.scene;
      const box = new T.Box3().setFromObject(imported);
      const size = box.getSize(new T.Vector3());
      const center = box.getCenter(new T.Vector3());
      const scale = 1.8 / Math.max(size.y, .001);
      imported.scale.multiplyScalar(scale);
      imported.position.sub(new T.Vector3(center.x, box.min.y, center.z).multiplyScalar(scale));
      scene.add(imported);
      athlete.root.visible = false;
      shadow.visible = false;
      $('legend').hidden = true;
      $('stage').hidden = $('viewer-controls').hidden = false;
      clips = gltf.animations;
      mixer = new T.AnimationMixer(imported);
      $('clips').replaceChildren(...clips.map((clip, i) => new Option(clip.name || `Clip ${i + 1}`, i)));
      $('clips').hidden = !clips.length;
      $('builtin').hidden = false;
      $('clips').onchange();
      $('status').textContent = clips.length ? 'Imported model. Choose an animation clip.' : 'Imported model has no animation clips.';
      controls.target.set(0, .9, 0);
      camera.position.set(1.62, 1.53, 2.42);
      controls.update();
      updatePlayback();
      dirty = true;
    } catch (error) {
      if (request === importRequest) $('status').textContent = `Unable to load GLB. ${error.message}`;
    }
  };

  $('clips').onchange = () => {
    mixer?.stopAllAction();
    const clip = clips[Number($('clips').value)];
    if (clip) {
      mixer.clipAction(clip).play();
      mixer.update(0);
    }
    dirty = true;
  };
  $('builtin').onclick = () => {
    importRequest++;
    removeImport();
    $('model').value = '';
    $('clips').hidden = $('builtin').hidden = true;
    select(name);
  };

  $('play').onclick = () => {
    playing = !playing;
    updatePlayback();
  };
  $('speed').onchange = () => { speed = Number($('speed').value); };
  $('orbit').onclick = () => {
    controls.autoRotate = !controls.autoRotate;
    $('orbit').setAttribute('aria-pressed', controls.autoRotate);
  };
  controls.addEventListener('change', () => { dirty = true; });
  new ResizeObserver(() => {
    const {clientWidth: width, clientHeight: height} = stage;
    if (!width || !height) return;
    const previousAspect = camera.aspect;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!imported && Math.abs(previousAspect - camera.aspect) > .01) frameAthlete();
    dirty = true;
  }).observe(stage);
  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    last = null;
    dirty = true;
  }).observe(stage);
  renderer.domElement.addEventListener('webglcontextrestored', () => { renderer.shadowMap.needsUpdate = true; dirty = true; });
  renderer.setAnimationLoop(now => {
    if (!visible || document.hidden) {
      last = null;
      return;
    }
    const delta = last === null ? 0 : Math.min((now - last) / 1000, .05);
    last = now;
    if (playing && !$('play').disabled) {
      if (imported) mixer.update(delta * speed);
      else {
        const period = name === 'Alternating curl' ? 5.6 : name === 'Goblet squat' ? 3.8 : 3.1;
        phase = (phase + delta * speed / period) % 1;
        athlete.pose(name, phase);
        renderer.shadowMap.needsUpdate = true;
        $('scrub').value = Math.round(phase * 100);
      }
      dirty = true;
    }
    controls.update(delta);
    if (dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
  });
  return {select};
}

try {
  viewer = createViewer();
} catch (error) {
  console.warn('Could not start the 3D viewer', error);
  $('rep-position').hidden = $('viewer-controls').hidden = true;
  $('status').textContent = 'The 3D viewer could not start. Workout logging is still available.';
  document.querySelectorAll('.controls[aria-label] button, #speed, #model').forEach(control => { control.disabled = true; });
}
selectExercise();
