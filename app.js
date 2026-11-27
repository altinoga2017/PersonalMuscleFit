import * as T from 'three';
import {OrbitControls} from './assets/vendor/OrbitControls.js';
import {createAthlete, muscleGroups, muscleNames} from './athlete.js';

const $ = id => document.getElementById(id);
const library = {
  Chest: [['Push-up', 10, 'Keep your torso straight.'], ['Floor press', 12, 'Keep wrists above elbows.']],
  Arms: [['Biceps curl', 15, 'Keep elbows stationary.'], ['Hammer curl', 12, 'Keep palms facing inward.']],
  Abs: [['Crunch', 15, 'Lift shoulder blades without pulling the neck.'], ['Leg raise', 10, 'Keep the lower back supported.']],
  Shoulders: [['Lateral raise', 12, 'Avoid shrugging.'], ['Shoulder press', 12, 'Keep ribs down.']],
  Back: [['Bent-over row', 15, 'Hinge at hips with a neutral spine.']],
  Legs: [['Goblet squat', 15, 'Keep heels planted.'], ['Calf raise', 20, 'Rise and lower slowly.']],
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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);

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
  stage.append(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color(0x252e39);
  scene.fog = new T.Fog(0x252e39, 5, 13);
  const camera = new T.PerspectiveCamera(37, 1, .03, 25);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * .48;
  controls.minDistance = .75;
  controls.maxDistance = 7;
  controls.autoRotateSpeed = 1.2;
  scene.add(new T.HemisphereLight(0xffefe4, 0x647a96, 2.15));
  const key = new T.DirectionalLight(0xffe8d2, 2.65);
  key.position.set(2, 5, 4);
  const rim = new T.DirectionalLight(0xb9d6ff, 1.7);
  rim.position.set(-3, 4, -3);
  scene.add(key, rim);
  const ground = new T.Mesh(new T.PlaneGeometry(32, 32), new T.MeshStandardMaterial({color: 0x303b49, roughness: 1}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.012;
  const grid = new T.GridHelper(14, 56, 0x4c5968, 0x3a4655);
  grid.position.y = -.01;
  const shadow = contactShadow();
  scene.add(ground, grid, shadow);

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
    const available = imported ? clips.length > 0 : Boolean(muscleGroups[name]);
    $('play').disabled = $('speed').disabled = !available;
    $('play').textContent = playing ? 'Pause' : 'Play';
  }

  function select(next) {
    name = next;
    phase = 0;
    const groups = muscleGroups[name];
    $('legend').hidden = Boolean(imported || !groups);
    if (groups && !imported) {
      for (const kind of ['primary', 'secondary']) {
        $(kind).textContent = groups[kind].map(id => muscleNames[id]).join(', ');
      }
    }
    if (!imported) {
      const push = name === 'Push-up';
      athlete.setExercise(name);
      athlete.pose(name, 0);
      $('status').textContent = groups
        ? 'Drag to rotate. Pinch or scroll to zoom.'
        : 'This exercise is available for logging. A 3D demo is coming in a later update.';
      athlete.root.visible = Boolean(groups);
      shadow.visible = Boolean(groups);
      const distance = Math.max(1, 1.05 / camera.aspect);
      controls.target.set(0, push ? .31 : .88, push ? .09 : 0);
      camera.position.copy(controls.target).add(new T.Vector3(push ? 2.50 : 1.62, push ? 1.08 : .63, push ? 1.50 : 2.42).multiplyScalar(distance));
      shadow.scale.set(push ? 1.15 : .90, push ? 1.95 : .72, 1);
      controls.update();
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
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
  }).observe(stage);
  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    last = null;
    dirty = true;
  }).observe(stage);
  renderer.domElement.addEventListener('webglcontextrestored', () => { dirty = true; });
  renderer.setAnimationLoop(now => {
    if (!visible || document.hidden) {
      last = null;
      return;
    }
    const delta = last === null ? 0 : Math.min((now - last) / 1000, .05);
    last = now;
    if (playing && !$('play').disabled) {
      phase += delta * speed;
      if (imported) mixer.update(delta * speed);
      else athlete.pose(name, phase);
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
  $('status').textContent = 'The 3D viewer could not start. Workout logging is still available.';
  document.querySelectorAll('.controls[aria-label] button, #speed, #model').forEach(control => { control.disabled = true; });
}
selectExercise();
