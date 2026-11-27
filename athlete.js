import * as T from 'three';
import {mergeGeometries} from './assets/vendor/utils/BufferGeometryUtils.js';

export const muscleGroups = {
  'Glute bridge': {primary: ['glutes'], secondary: ['hamstrings', 'core']},
  'Front raise': {primary: ['shoulders'], secondary: ['chest']},
  'Alternating curl': {primary: ['biceps'], secondary: ['shoulders']},
  'Floor press': {primary: ['chest'], secondary: ['triceps', 'shoulders']},
  'Hammer curl': {primary: ['biceps'], secondary: ['shoulders']},
  'Leg raise': {primary: ['core'], secondary: []},
  'Shoulder press': {primary: ['shoulders'], secondary: ['triceps', 'traps']},
  'Calf raise': {primary: ['calves'], secondary: []},
  'Push-up': {primary: ['chest', 'triceps'], secondary: ['shoulders', 'core']},
  'Biceps curl': {primary: ['biceps'], secondary: ['shoulders']},
  Crunch: {primary: ['core'], secondary: []},
  'Lateral raise': {primary: ['shoulders'], secondary: ['traps']},
  'Bent-over row': {primary: ['back'], secondary: ['traps', 'biceps']},
  'Goblet squat': {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core', 'calves']},
};
export const muscleNames = {
  chest: 'Pectorals', triceps: 'Triceps', shoulders: 'Deltoids', core: 'Abdominals',
  back: 'Lats', traps: 'Trapezius', biceps: 'Biceps', quads: 'Quadriceps', glutes: 'Glutes', hamstrings: 'Hamstrings', calves: 'Calves',
};

const v = (x, y, z) => new T.Vector3(x, y, z);
const X = v(1, 0, 0), Y = v(0, 1, 0), Z = v(0, 0, 1);
const rotation = (axis, angle) => new T.Quaternion().setFromAxisAngle(axis, angle);
const offset = (point, origin) => point.clone().sub(origin);
const transform = (point, origin, target, q) => offset(point, origin).applyQuaternion(q).add(target);

function decode(base64, Type) {
  return new Type(Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer);
}

function frame(forward, across) {
  const y = forward.clone().normalize();
  const z = across.clone().cross(y).normalize();
  const x = y.clone().cross(z);
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
}

function jointBetween(start, end, a, b, pole) {
  const axis = offset(end, start);
  const distance = Math.max(.001, axis.length());
  axis.divideScalar(distance);
  const bend = offset(pole, start);
  bend.addScaledVector(axis, -bend.dot(axis)).normalize();
  const along = Math.min(a, (a * a - b * b + distance * distance) / (2 * distance));
  return start.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
}

function makeDumbbell() {
  const weight = new T.Group();
  const rubber = new T.MeshStandardMaterial({color: 0x242830, roughness: .82});
  const steel = new T.MeshStandardMaterial({color: 0xaab3ba, metalness: .68, roughness: .31});
  const badge = new T.MeshStandardMaterial({color: 0x4a545d, roughness: .57});
  const parts = new Map([[rubber, []], [steel, []], [badge, []]]);
  function cylinder(material, radius, length, y, segments, top = radius) {
    parts.get(material).push(new T.CylinderGeometry(top, radius, length, segments).translate(0, y, 0));
  }
  cylinder(steel, .014, .16, 0, 24);
  for (const side of [-1, 1]) {
    // Three rings form the bevel on each end of a molded rubber head.
    cylinder(rubber, .074, .047, side * .105, 8);
    cylinder(rubber, side > 0 ? .074 : .064, .010, side * .134, 8, side > 0 ? .064 : .074);
    cylinder(rubber, side > 0 ? .062 : .074, .012, side * .076, 8, side > 0 ? .074 : .062);
    cylinder(badge, .048, .003, side * .140, 24);
    cylinder(rubber, .039, .0016, side * .142, 28);
    cylinder(steel, .014, .002, side * .143, 20);
    cylinder(badge, .008, .002, side * .1445, 6);
    cylinder(steel, .027, .012, side * .065, 24);
    cylinder(badge, .017, .006, side * .054, 24);
  }
  for (let i = -9; i <= 9; i++) cylinder(steel, .0147, .0013, i * .005, 20);
  for (const [material, geometries] of parts) {
    const mesh = new T.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = true;
    weight.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  return weight;
}

export function createAthlete(data) {
  const {arrays, landmarks} = data;
  const points = decode(arrays.positionF32, Float32Array);
  const normals = Float32Array.from(decode(arrays.normalI8, Int8Array), n => n / 127);
  // Low-amplitude relief in meters, evaluated in the bind pose. Apply the
  // slope to the smooth source normals so the forms travel with the skeleton.
  function torsoRelief(x, y) {
    const lateral = Math.abs(x);
    const bell = (cx, cy, rx, ry) => Math.exp(-(((lateral - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
    const pec = bell(.098, 1.371 + .07 * lateral, .079, .059);
    const abdomen = bell(.042, 1.251, .035, .033) + bell(.046, 1.179, .038, .034)
      + bell(.042, 1.108, .035, .034) + .55 * bell(.035, 1.044, .033, .035);
    const oblique = bell(.108, 1.146 + .55 * lateral, .025, .085);
    return .008 * pec + .005 * abdomen + .003 * oblique;
  }
  const step = .001;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    if (y < .98 || y > 1.5 || Math.abs(x) > .23 || z < .018) continue;
    const n = v().fromArray(normals, i);
    const front = T.MathUtils.smoothstep(n.z, .15, .80);
    const h = front * torsoRelief(x, y);
    points[i] += n.x * h;
    points[i + 1] += n.y * h;
    points[i + 2] += n.z * h;
    const slope = v(torsoRelief(x + step, y) - torsoRelief(x - step, y),
      torsoRelief(x, y + step) - torsoRelief(x, y - step), 0).multiplyScalar(front / (2 * step));
    slope.addScaledVector(n, -slope.dot(n));
    n.sub(slope).normalize().toArray(normals, i);
  }
  const joints = decode(arrays.jointsU8, Uint8Array);
  const weights = Float32Array.from(decode(arrays.weightsU8, Uint8Array), n => n / 255);
  const indices = Object.fromEntries(Object.entries(arrays.indicesU16).map(([name, source]) => [name, decode(source, Uint16Array)]));
  const anatomy = Object.fromEntries(data.bones.map(({name, start, end}) => [
    name, {start: v(...start), end: v(...end)},
  ]));
  const root = new T.Group();
  const skeletonRoot = new T.Group();
  root.add(skeletonRoot);
  // Each bone carries a rest-to-pose transform in model space. The rig shares
  // one skeleton across the body, clothes and anatomical overlay meshes.
  for (const bone of Object.values(anatomy)) {
    bone.node = new T.Bone();
    skeletonRoot.add(bone.node);
  }

  function extraBone(start) {
    const node = new T.Bone();
    const index = skeletonRoot.children.length;
    skeletonRoot.add(node);
    return {index, node, start};
  }

  const landmark = name => v(...landmarks['joint-' + name]);
  const digits = decode(arrays.digitsU8, Uint8Array);
  const hands = ['Left', 'Right'].map((side, i) => {
    const arm = anatomy['lowerArm' + side];
    const prefix = i === 0 ? 'l-' : 'r-';
    const knuckle = digit => landmark(prefix + 'finger-' + digit + '-1');
    const across = offset(knuckle(2), knuckle(5)).multiplyScalar(i === 0 ? 1 : -1);
    const palmCenter = knuckle(3).lerp(knuckle(4), .5);
    const forward = offset(palmCenter, arm.end).normalize();
    const restFrame = frame(forward, across);
    const wrist = extraBone(arm.end);
    const fingers = Array.from({length: 5}, (_, j) => {
      const proximal = extraBone(knuckle(j + 1));
      const distal = extraBone(landmark(prefix + 'finger-' + (j + 1) + '-2'));
      const tipBone = extraBone(landmark(prefix + 'finger-' + (j + 1) + '-3'));
      const axis = offset(distal.start, proximal.start).normalize();
      return {proximal, distal, tipBone, axis};
    });
    return {side, sign: i === 0 ? 1 : -1, arm, wrist, fingers, palmCenter, forward, restFrame, points: []};
  });

  for (let i = 0; i < points.length / 3; i++) {
    const point = v().fromArray(points, i * 3);
    const hand = hands[point.x > 0 ? 0 : 1];
    if (point.distanceToSquared(hand.wrist.start) > .25 ** 2) continue;
    const distance = offset(point, hand.wrist.start).dot(hand.forward);
    const blend = T.MathUtils.smoothstep(distance, -.032, .035);
    if (blend === 0) continue;
    const start = i * 4;
    const retained = weights[start] + weights[start + 1] + weights[start + 2] || 1;
    joints[start + 3] = hand.wrist.index;
    for (let j = 0; j < 3; j++) weights[start + j] *= (1 - blend) / retained;
    weights[start + 3] = blend;
    if (blend === 1) hand.points.push(point);
  }
  for (let i = 0; i < digits.length; i += 7) {
    const vertex = digits[i] + 256 * digits[i + 1];
    const hand = hands[points[vertex * 3] > 0 ? 0 : 1];
    if (joints[vertex * 4 + 3] !== hand.wrist.index || weights[vertex * 4 + 3] !== 1) continue;
    let digit = 0;
    for (let j = 1; j < 5; j++) {
      if (digits[i + 2 + j] > digits[i + 2 + digit]) digit = j;
    }
    const {proximal, distal, tipBone, axis} = hand.fingers[digit];
    const point = v().fromArray(points, vertex * 3);
    const bend = T.MathUtils.smoothstep(offset(point, proximal.start).dot(axis), -.009, .014);
    const tip = T.MathUtils.smoothstep(offset(point, distal.start).dot(axis), -.009, .013);
    const influence = Math.min(1, digits[i + 2 + digit] / 160) * bend;
    const fingertip = T.MathUtils.smoothstep(offset(point, tipBone.start).dot(axis), -.007, .009);
    joints.set([hand.wrist.index, proximal.index, distal.index, tipBone.index], vertex * 4);
    weights.set([1 - influence, influence * (1 - tip), influence * tip * (1 - fingertip), influence * tip * fingertip], vertex * 4);
  }

  // Spread wrist roll along the forearm. Blending two opposing rotations
  // at the wrist alone collapses its cross-section in an overhead grip.
  for (const hand of hands) {
    const forearmIndices = new Set(['lowerArm', 'forearmTwist'].map(prefix =>
      data.bones.findIndex(bone => bone.name === prefix + hand.side)));
    hand.rollBones = Array.from({length: 6}, () => extraBone(hand.arm.start));
    const axis = offset(hand.arm.end, hand.arm.start);
    const lengthSquared = axis.lengthSq();
    for (let i = 0; i < joints.length; i++) {
      if (!forearmIndices.has(joints[i])) continue;
      const point = v().fromArray(points, Math.floor(i / 4) * 3);
      const along = offset(point, hand.arm.start).dot(axis) / lengthSquared;
      const band = Math.round(5 * T.MathUtils.smoothstep(along, .10, .88));
      joints[i] = hand.rollBones[band].index;
    }
  }
  const skeleton = new T.Skeleton(skeletonRoot.children);
  const skinIndex = new T.BufferAttribute(joints, 4);
  const skinWeight = new T.BufferAttribute(weights, 4);
  const normal = new T.BufferAttribute(normals, 3);
  const position = new T.BufferAttribute(points, 3);
  const shiftedPositions = new Map([[0, position]]);
  function surface(group, color, lift = 0) {
    if (!shiftedPositions.has(lift)) {
      shiftedPositions.set(lift, new T.BufferAttribute(points.map((p, i) => p + lift * normals[i]), 3));
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', shiftedPositions.get(lift));
    geometry.setAttribute('normal', normal);
    geometry.setAttribute('skinIndex', skinIndex);
    geometry.setAttribute('skinWeight', skinWeight);
    geometry.setIndex(new T.BufferAttribute(indices[group], 1));
    const mesh = new T.SkinnedMesh(geometry, new T.MeshStandardMaterial({color, roughness: .8}));
    mesh.bind(skeleton, new T.Matrix4());
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  }
  const body = surface('body', 0xffffff);
  const shorts = surface('shorts', 0xffffff, .004);
  surface('shortsTrim', 0x414c53, .005);
  surface('trainerUpper', 0x495653).castShadow = true;
  surface('trainerSole', 0x172123);
  surface('trainerTrim', 0xb4b7a6, .001);

  // Evaluate tissue coverage on the original mesh. Neighbor averaging gives
  // the tint a soft boundary that follows the same joints as the skin.
  const count = points.length / 3;
  const adjacent = Array.from({length: count}, () => new Set());
  for (let i = 0; i < indices.body.length; i += 3) {
    const [a, b, c] = indices.body.subarray(i, i + 3);
    adjacent[a].add(b).add(c);
    adjacent[b].add(c).add(a);
    adjacent[c].add(a).add(b);
  }
  function diffuse(values) {
    return values.map((value, i) => {
      const neighbors = adjacent[i];
      if (!neighbors.size) return value;
      let sum = 0;
      for (const j of neighbors) sum += values[j];
      return .25 * value + .75 * sum / neighbors.size;
    });
  }
  const masks = {};
  for (const group of Object.keys(muscleNames)) {
    const coverage = new Float32Array(count);
    for (const i of indices[group]) coverage[i] = 1;
    masks[group] = diffuse(diffuse(coverage));
  }

  const neutral = new Float32Array(points.length);
  const shade = new Float32Array(count);
  const skin = new T.Color(0xb88368), hair = new T.Color(0x372b27);
  const tone = new T.Color();
  for (let i = 0; i < count; i++) {
    const point = v().fromArray(points, i * 3);
    const normal = v().fromArray(normals, i * 3);
    let cavity = 0;
    for (const j of adjacent[i]) {
      const delta = v().fromArray(points, j * 3).sub(point).normalize();
      cavity += delta.dot(normal);
    }
    shade[i] = 1 - Math.min(.33, 1.55 * Math.max(0, cavity / (adjacent[i].size || 1)));
    const temple = Math.min(1, Math.abs(point.x) / .072);
    const hairline = 1.726 + .031 * T.MathUtils.smoothstep(point.z, -.02, .13) - .019 * temple;
    const crop = T.MathUtils.smoothstep(point.y, hairline, hairline + .009);
    tone.copy(skin).lerp(hair, crop).multiplyScalar(shade[i]).toArray(neutral, i * 3);
  }

  const eyes = surface('eyes', 0xffffff);
  const eyeUV = new Float32Array(count * 2);
  for (const i of indices.eyes) {
    eyeUV[i * 2] = .5 + (Math.abs(points[3 * i]) - .030) / .034;
    eyeUV[i * 2 + 1] = .5 + (points[3 * i + 1] - 1.689) / .034;
  }
  const eyeCanvas = document.createElement('canvas');
  eyeCanvas.width = eyeCanvas.height = 64;
  const eyeBrush = eyeCanvas.getContext('2d');
  const pigment = eyeBrush.createRadialGradient(32, 32, 0, 32, 32, 32);
  pigment.addColorStop(0, '#231d1a');
  pigment.addColorStop(.13, '#261e1a');
  pigment.addColorStop(.16, '#765746');
  pigment.addColorStop(.31, '#635044');
  pigment.addColorStop(.35, '#41382f');
  pigment.addColorStop(.39, '#bdb3a4');
  pigment.addColorStop(1, '#c0afa2');
  eyeBrush.fillStyle = pigment;
  eyeBrush.fillRect(0, 0, 64, 64);
  eyes.geometry.setAttribute('uv', new T.BufferAttribute(eyeUV, 2));
  eyes.material.map = new T.CanvasTexture(eyeCanvas);
  eyes.material.map.colorSpace = T.SRGBColorSpace;
  eyes.material.roughness = .34;
  for (const surface of [body, shorts]) {
    surface.material.vertexColors = true;
    surface.geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(points.length), 3));
  }
  body.material.roughness = .59;
  body.castShadow = true;
  shorts.castShadow = true;
  const dumbbell = makeDumbbell();
  const dumbbells = [dumbbell, dumbbell.clone()];
  root.add(...dumbbells);

  const identity = new T.Quaternion();
  const hips = anatomy.spineLower.start;
  const shoePoints = [...new Set([...indices.trainerSole, ...indices.trainerUpper])]
    .map(index => v().fromArray(points, index * 3));
  for (const hand of hands) {
    const foot = anatomy['foot' + hand.side];
    hand.shoe = shoePoints.filter(point => point.x * hand.sign > 0).map(point => offset(point, foot.start));
    hand.flatHand = frame(Z, X.clone().negate()).multiply(hand.restFrame.clone().invert());
    hand.palmHeight = -Math.min(...hand.points.map(point =>
      offset(point, hand.wrist.start).applyQuaternion(hand.flatHand).y));
    hand.standingAnkle = -Math.min(...hand.shoe.map(p => p.y));
    hand.pushAnkle = -Math.min(...hand.shoe.map(p => p.clone().applyAxisAngle(X, 1.37).y));
  }

  function move(bone, start, q) {
    bone.node.quaternion.copy(q);
    bone.node.position.copy(start).sub(bone.start.clone().applyQuaternion(q));
  }

  function aim(bone, start, end, base) {
    const from = offset(bone.end, bone.start).normalize().applyQuaternion(base);
    const to = offset(end, start).normalize();
    const q = new T.Quaternion().setFromUnitVectors(from, to).multiply(base);
    move(bone, start, q);
    return q;
  }

  function setExercise(name, anatomyView = false) {
    const groups = muscleGroups[name];
    const primary = (groups?.primary || []).map(id => masks[id]);
    const secondary = (groups?.secondary || []).map(id => masks[id]);
    const red = new T.Color(0xc63834), amber = new T.Color(0xe18b39);
    const stone = new T.Color(0xaeb3b1);
    const fabric = new T.Color(0x1f3039), panel = new T.Color(0x4e666b);
    for (const mesh of [body, shorts]) {
      const colors = mesh.geometry.attributes.color;
      for (let i = 0; i < count; i++) {
        if (mesh === body && anatomyView) tone.copy(stone).multiplyScalar(shade[i]);
        else if (mesh === body) tone.fromArray(neutral, i * 3);
        else {
          const sidePanel = T.MathUtils.smoothstep(Math.abs(points[i * 3]), .154, .185);
          const waistband = T.MathUtils.smoothstep(points[i * 3 + 1], 1.027, 1.036);
          tone.copy(fabric).lerp(panel, sidePanel * .8).multiplyScalar(1 - .32 * waistband);
        }
        let hot = 0, warm = 0;
        for (const mask of primary) hot = Math.max(hot, mask[i]);
        for (const mask of secondary) warm = Math.max(warm, mask[i]);
        tone.lerp(amber, warm * .88).lerp(red, hot * .94)
          .multiplyScalar(1 - Math.max(hot, warm) * (1 - shade[i]));
        colors.setXYZ(i, tone.r, tone.g, tone.b);
      }
      colors.needsUpdate = true;
    }
    const pair = ['Biceps curl', 'Alternating curl', 'Hammer curl', 'Front raise', 'Lateral raise', 'Bent-over row', 'Floor press', 'Shoulder press'].includes(name);
    dumbbells[0].visible = pair || name === 'Goblet squat';
    dumbbells[1].visible = pair;
  }

  function pose(name, cycle) {
    const rep = (1 - Math.cos(cycle * Math.PI * 2)) / 2;
    const push = name === 'Push-up', squat = name === 'Goblet squat', curl = name === 'Biceps curl';
    const crunch = name === 'Crunch', raise = name === 'Lateral raise', row = name === 'Bent-over row';
    const hammer = name === 'Hammer curl', legRaise = name === 'Leg raise', calf = name === 'Calf raise';
    const floorPress = name === 'Floor press', shoulderPress = name === 'Shoulder press';
    const bridge = name === 'Glute bridge', frontRaise = name === 'Front raise', alternating = name === 'Alternating curl';
    const supine = crunch || legRaise || floorPress || bridge;
    const torsoAngle = push ? 1.28 + .24 * rep : squat ? .38 * rep : row ? .93 : bridge ? -Math.PI / 2 - .68 * rep : supine ? -1.49 : 0;
    const torso = rotation(X, torsoAngle);
    const footRotation = push ? rotation(X, 1.37) : calf ? rotation(X, .60 * rep) : identity;
    const leftFoot = anatomy.footLeft.start;
    // Lift the heels about the sole near the ball of each foot.
    const standingAnkle = hands[0].standingAnkle;
    const calfLift = .145 * Math.sin(.60 * rep) - standingAnkle * (1 - Math.cos(.60 * rep));
    const ankleHeight = push ? hands[0].pushAnkle : standingAnkle + (calf ? calfLift : 0);
    const hipTarget = push
      ? transform(hips, leftFoot, v(leftFoot.x, ankleHeight, -.73), torso)
      : supine ? v(0, bridge ? .105 : .145, .04)
        : v(0, hips.y + ankleHeight - leftFoot.y - (squat ? .335 * rep : row ? .105 : 0),
          hips.z - (squat ? .245 * rep : row ? .155 : 0));
    if (bridge) {
      const shoulder = anatomy.spineUpper.end;
      const anchor = transform(shoulder, hips, hipTarget, rotation(X, -Math.PI / 2));
      hipTarget.copy(transform(hips, shoulder, anchor, torso));
    }
    const bodyPoint = point => transform(point, hips, hipTarget, torso);
    let chestRotation = torso;
    let chestPoint = bodyPoint;
    if (crunch) {
      const lower = anatomy.spineLower;
      const mid = anatomy.spineMid;
      const chest = anatomy.spineUpper;
      const lowerRotation = rotation(X, torsoAngle + .19 * rep);
      const midRotation = rotation(X, torsoAngle + .38 * rep);
      chestRotation = rotation(X, torsoAngle + .54 * rep);
      const midTarget = transform(mid.start, lower.start, hipTarget, lowerRotation);
      const chestTarget = transform(chest.start, mid.start, midTarget, midRotation);
      chestPoint = point => transform(point, chest.start, chestTarget, chestRotation);
      move(lower, hipTarget, lowerRotation);
      move(mid, midTarget, midRotation);
    } else {
      move(anatomy.spineLower, bodyPoint(anatomy.spineLower.start), torso);
      move(anatomy.spineMid, bodyPoint(anatomy.spineMid.start), torso);
    }
    move(anatomy.spineUpper, chestPoint(anatomy.spineUpper.start), chestRotation);
    if (bridge) {
      const restingRotation = rotation(X, -Math.PI / 2);
      const restingHead = transform(anatomy.head.start, hips, v(0, .105, .04), restingRotation);
      move(anatomy.head, restingHead, restingRotation);
    } else {
      move(anatomy.head, chestPoint(anatomy.head.start), chestRotation);
    }

    const goblet = bodyPoint(v(0, 1.28, .27));
    if (squat) {
      dumbbells[0].position.copy(goblet);
      dumbbells[0].quaternion.copy(identity);
    }
    hands.forEach((hand, i) => {
      const {side, sign, arm, wrist, fingers} = hand;
      const upper = anatomy['upperArm' + side];
      const thigh = anatomy['upperLeg' + side], shin = anatomy['lowerLeg' + side];
      const foot = anatomy['foot' + side];
      const hip = bodyPoint(thigh.start);
      if (legRaise) {
        const lift = rotation(X, -1.49 - 1.36 * rep);
        const knee = transform(shin.start, thigh.start, hip, lift);
        const ankle = transform(foot.start, thigh.start, hip, lift);
        move(thigh, hip, lift);
        move(shin, knee, lift);
        move(foot, ankle, rotation(X, -.28 - 1.36 * rep));
      } else {
        const calfShift = calf ? .145 * (1 - Math.cos(.60 * rep)) + standingAnkle * Math.sin(.60 * rep) : 0;
        const ankle = v(foot.start.x, ankleHeight, push ? -.73 : supine ? .55 : foot.start.z + calfShift);
        const knee = push ? bodyPoint(shin.start)
          : jointBetween(hip, ankle, thigh.start.distanceTo(thigh.end), shin.start.distanceTo(shin.end),
            v(ankle.x + sign * .10, supine ? .8 : .48, supine ? .21 : .75));
        aim(thigh, hip, knee, torso);
        aim(shin, knee, ankle, torso);
        move(foot, ankle, footRotation);
      }

      const clavicle = anatomy['clavicle' + side];
      const clavicleBase = chestPoint(clavicle.start);
      const clavicleRotation = chestRotation.clone();
      if (shoulderPress) clavicleRotation.multiply(rotation(Z, sign * (.13 + .35 * rep)));
      const shoulder = transform(upper.start, clavicle.start, clavicleBase, clavicleRotation);
      const upperLength = upper.start.distanceTo(upper.end);
      const lowerLength = arm.start.distanceTo(arm.end);
      let elbow, palm, handRotation;
      if (push || squat || crunch) {
        palm = push ? v(sign * .252, hand.palmHeight, .565)
          : crunch ? chestPoint(v(sign * .07, 1.30, .18))
            : goblet.clone().add(v(sign * .116, .042, -.043));
        elbow = jointBetween(shoulder, palm, upperLength, lowerLength,
          push ? v(sign * .50, .26, .08) : chestPoint(v(sign * .27, 1.01, .15)));
        handRotation = push ? hand.flatHand
          : crunch ? frame(v(-sign, .25, -.15).applyQuaternion(chestRotation), Z.clone().applyQuaternion(chestRotation))
            .multiply(hand.restFrame.clone().invert())
          : frame(v(-sign * .78, .33, .53), Z.clone().multiplyScalar(-sign)).multiply(hand.restFrame.clone().invert());
      } else if (floorPress || shoulderPress) {
        const angle = (floorPress ? -.27 : -.32) + (floorPress ? 1.74 : 1.65) * rep;
        const upperDirection = v(sign * Math.cos(angle), Math.sin(angle), floorPress ? .33 * (1 - rep) : .19 * (1 - rep));
        const direction = v(-sign * .09 * rep, 1, floorPress ? -.07 : .09 + .06 * (1 - rep));
        elbow = shoulder.clone().addScaledVector(upperDirection.normalize(), upperLength);
        palm = elbow.clone().addScaledVector(direction.normalize(), lowerLength);
        handRotation = frame(direction, X).multiply(hand.restFrame.clone().invert());
      } else if (bridge) {
        palm = v(sign * .27, hand.palmHeight, .06);
        elbow = jointBetween(shoulder, palm, upperLength, lowerLength, v(sign * .37, .035, -.19));
        handRotation = hand.flatHand;
      } else if (legRaise) {
        const direction = v(sign * .14, -.20, 1).normalize();
        elbow = shoulder.clone().addScaledVector(direction, upperLength);
        palm = elbow.clone().addScaledVector(v(sign * .025, 0, 1).normalize(), lowerLength);
        handRotation = hand.flatHand;
      } else if (frontRaise) {
        const angle = .15 + 1.41 * rep;
        const direction = v(sign * .10, -Math.cos(angle), Math.sin(angle)).normalize();
        elbow = shoulder.clone().addScaledVector(direction, upperLength);
        const forearm = direction.clone().applyAxisAngle(X, -.13);
        palm = elbow.clone().addScaledVector(forearm, lowerLength);
        handRotation = frame(forearm, X).multiply(hand.restFrame.clone().invert());
      } else if (raise || row) {
        const angle = raise ? .12 + 1.39 * rep : .13 + 1.11 * rep;
        const upperDirection = raise ? v(sign * Math.sin(angle), -Math.cos(angle), .13)
          : v(sign * .27, -Math.cos(angle), -Math.sin(angle));
        const direction = raise ? v(sign * Math.sin(angle), -Math.cos(angle), .29)
          : v(sign * .055, -1, .22 * rep);
        elbow = shoulder.clone().addScaledVector(upperDirection.normalize(), upperLength);
        palm = elbow.clone().addScaledVector(direction.normalize(), lowerLength);
        // The neutral grip stays aligned across the palm as the arm moves.
        handRotation = frame(direction, Z).multiply(hand.restFrame.clone().invert());
      } else {
        elbow = shoulder.clone().add(v(sign * .094, -Math.sqrt(upperLength ** 2 - .094 ** 2 - .025 ** 2), -.025));
        const armRep = alternating ? Math.max(0, Math.sin(2 * Math.PI * cycle) * sign) ** 2 : rep;
        const angle = curl || hammer || alternating ? .19 + 2.16 * armRep : .15;
        const direction = v(0, -Math.cos(angle), Math.sin(angle));
        palm = elbow.clone().addScaledVector(direction, lowerLength);
        const across = hammer ? v(0, Math.sin(angle), Math.cos(angle)) : X;
        handRotation = frame(direction, across).multiply(hand.restFrame.clone().invert());
      }
      let upperBase = chestRotation;
      if (shoulderPress) {
        // Preserve the elbow hinge plane as the upper arm rotates outward.
        const bindUpper = offset(upper.end, upper.start);
        const bindHinge = bindUpper.clone().cross(offset(arm.end, arm.start));
        const posedUpper = offset(elbow, shoulder);
        const posedHinge = posedUpper.clone().cross(offset(palm, elbow));
        upperBase = frame(posedUpper, posedHinge).multiply(frame(bindUpper, bindHinge).invert());
      }
      const upperRotation = aim(upper, shoulder, elbow, upperBase);
      const lowerRotation = aim(arm, elbow, palm, push || shoulderPress ? upperRotation : handRotation);
      let wristRoll = lowerRotation;
      if (shoulderPress) {
        const axis = offset(arm.end, arm.start).normalize().applyQuaternion(handRotation);
        wristRoll = new T.Quaternion().setFromUnitVectors(axis, offset(palm, elbow).normalize()).multiply(handRotation);
      }
      hand.rollBones.forEach((bone, i) => {
        move(bone, elbow, lowerRotation.clone().slerp(wristRoll, i / (hand.rollBones.length - 1)));
      });
      move(clavicle, clavicleBase, clavicleRotation);
      move(anatomy['shoulderCap' + side], shoulder, clavicleRotation.clone().slerp(upperRotation, shoulderPress ? .80 : .55));
      move(anatomy['elbow' + side], elbow, upperRotation.clone().slerp(lowerRotation, .60));
      move(anatomy['forearmTwist' + side], elbow, lowerRotation);
      move(wrist, palm, handRotation);
      const handFrame = handRotation.clone().multiply(hand.restFrame);
      const gripAxis = X.clone().applyQuaternion(handFrame);
      const pair = dumbbells[1].visible;
      fingers.forEach(({proximal, distal, tipBone}, j) => {
        const target = transform(proximal.start, wrist.start, palm, handRotation);
        const angle = pair ? (j === 0 ? .40 : 1.25) : squat ? (j === 0 ? -.28 : .85) : 0;
        const proximalRotation = rotation(gripAxis, angle).multiply(handRotation);
        if (pair && j === 0) {
          const palmNormal = Z.clone().applyQuaternion(handFrame);
          proximalRotation.premultiply(rotation(palmNormal, sign * .62));
          const bar = transform(hand.palmCenter, wrist.start, palm, handRotation)
            .addScaledVector(Z.clone().applyQuaternion(handFrame), .024);
          const thumbAxis = offset(distal.start, proximal.start).normalize().applyQuaternion(proximalRotation);
          proximalRotation.premultiply(new T.Quaternion().setFromUnitVectors(thumbAxis, offset(bar, target).normalize()));
        }
        const distalTarget = transform(distal.start, proximal.start, target, proximalRotation);
        const distalRotation = rotation(gripAxis, pair ? (j === 0 ? .25 : 1.07) : 0).multiply(proximalRotation);
        move(proximal, target, proximalRotation);
        move(distal, distalTarget, distalRotation);
        const tipTarget = transform(tipBone.start, distal.start, distalTarget, distalRotation);
        move(tipBone, tipTarget, rotation(gripAxis, pair ? .65 : 0).multiply(distalRotation));
      });
      if (pair) {
        dumbbells[i].position.copy(transform(hand.palmCenter, wrist.start, palm, handRotation))
          .addScaledVector(Z.clone().applyQuaternion(handFrame), .023);
        dumbbells[i].quaternion.setFromUnitVectors(Y, gripAxis);
      }
    });
  }
  return {root, setExercise, pose};
}
