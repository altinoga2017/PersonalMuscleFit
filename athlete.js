import * as T from 'three';
import {mergeGeometries} from './assets/vendor/utils/BufferGeometryUtils.js';

export const muscleGroups = {
  'Push-up': {primary: ['chest', 'triceps'], secondary: ['shoulders', 'core']},
  'Biceps curl': {primary: ['biceps'], secondary: ['shoulders']},
  'Goblet squat': {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core', 'calves']},
};
export const muscleNames = {
  chest: 'Pectorals', triceps: 'Triceps', shoulders: 'Deltoids', core: 'Abdominals',
  biceps: 'Biceps', quads: 'Quadriceps', glutes: 'Glutes', hamstrings: 'Hamstrings', calves: 'Calves',
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
  cylinder(steel, .013, .20, 0, 16);
  for (const side of [-1, 1]) {
    cylinder(rubber, .067, .050, side * .102, 6);
    cylinder(rubber, .058, .008, side * .131, 6, side > 0 ? .053 : .067);
    cylinder(badge, .026, .003, side * .137, 18);
    cylinder(steel, .022, .012, side * .068, 16);
  }
  // Knurling catches the light along the steel grip.
  for (let i = -4; i <= 4; i++) cylinder(steel, .0138, .002, i * .010, 16);
  for (const [material, geometries] of parts) {
    weight.add(new T.Mesh(mergeGeometries(geometries), material));
    geometries.forEach(geometry => geometry.dispose());
  }
  return weight;
}

export function createAthlete(data) {
  const {arrays, landmarks} = data;
  const points = decode(arrays.positionF32, Float32Array);
  const normals = Float32Array.from(decode(arrays.normalI8, Int8Array), n => n / 127);
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
    const fingers = Array.from({length: 5}, (_, j) => extraBone(knuckle(j + 1)));
    return {side, sign: i === 0 ? 1 : -1, arm, wrist, fingers, palmCenter, forward, restFrame, points: []};
  });

  for (let i = 0; i < points.length / 3; i++) {
    const point = v().fromArray(points, i * 3);
    if (Math.abs(point.x) < .46 || point.y > 1.25) continue;
    const hand = hands[point.x > 0 ? 0 : 1];
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
    const ranked = hand.fingers.map((bone, j) => ({index: bone.index, weight: digits[i + 2 + j] / 255}))
      .sort((a, b) => b.weight - a.weight).slice(0, 3);
    const sum = ranked.reduce((total, entry) => total + entry.weight, 0);
    const divisor = Math.max(1, sum);
    joints.set([hand.wrist.index, ...ranked.map(entry => entry.index)], vertex * 4);
    weights.set([Math.max(0, 1 - sum), ...ranked.map(entry => entry.weight / divisor)], vertex * 4);
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
  surface('body', 0xb58165);
  surface('eyes', 0x6a564d);
  surface('shorts', 0x263445, .004);
  surface('shortsTrim', 0x38495c, .005);
  surface('trainerUpper', 0x38434e);
  surface('trainerSole', 0x1a2128);
  surface('trainerTrim', 0x9aa5ad, .001);
  const overlays = Object.fromEntries(Object.keys(muscleNames).map(name => [name, surface(name, 0xffffff, .006)]));
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

  function setExercise(name) {
    const groups = muscleGroups[name];
    for (const [region, mesh] of Object.entries(overlays)) {
      const primary = groups?.primary.includes(region);
      mesh.visible = Boolean(primary || groups?.secondary.includes(region));
      mesh.material.color.setHex(primary ? 0xf04445 : 0xf99536);
    }
    dumbbells[0].visible = name === 'Biceps curl' || name === 'Goblet squat';
    dumbbells[1].visible = name === 'Biceps curl';
  }

  function pose(name, time) {
    const rep = (1 - Math.cos(time * Math.PI * 2 / (name === 'Goblet squat' ? 3.8 : 3.1))) / 2;
    const push = name === 'Push-up', squat = name === 'Goblet squat', curl = name === 'Biceps curl';
    const torso = rotation(X, push ? 1.28 + .24 * rep : squat ? .38 * rep : 0);
    const footRotation = push ? rotation(X, 1.37) : identity;
    const leftFoot = anatomy.footLeft.start;
    const ankleHeight = push ? hands[0].pushAnkle : hands[0].standingAnkle;
    const hipTarget = push
      ? transform(hips, leftFoot, v(leftFoot.x, ankleHeight, -.73), torso)
      : v(0, hips.y + ankleHeight - leftFoot.y - (squat ? .335 * rep : 0), hips.z - (squat ? .245 * rep : 0));
    const bodyPoint = point => transform(point, hips, hipTarget, torso);
    for (const name of ['spineLower', 'spineMid', 'spineUpper', 'head']) {
      move(anatomy[name], bodyPoint(anatomy[name].start), torso);
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
      const ankle = v(foot.start.x, ankleHeight, push ? -.73 : foot.start.z);
      const hip = bodyPoint(thigh.start);
      const knee = push ? bodyPoint(shin.start)
        : jointBetween(hip, ankle, thigh.start.distanceTo(thigh.end), shin.start.distanceTo(shin.end), v(ankle.x + sign * .10, .48, .75));
      aim(thigh, hip, knee, torso);
      aim(shin, knee, ankle, torso);
      move(foot, ankle, footRotation);

      const shoulder = bodyPoint(upper.start);
      const upperLength = upper.start.distanceTo(upper.end);
      const lowerLength = arm.start.distanceTo(arm.end);
      let elbow, palm, handRotation;
      if (push || squat) {
        palm = push ? v(sign * .252, hand.palmHeight, .565)
          : goblet.clone().add(v(sign * .116, .042, -.043));
        elbow = jointBetween(shoulder, palm, upperLength, lowerLength,
          push ? v(sign * .50, .26, .08) : bodyPoint(v(sign * .27, 1.01, .15)));
        handRotation = push ? hand.flatHand
          : frame(v(-sign * .78, .33, .53), Z.clone().multiplyScalar(-sign)).multiply(hand.restFrame.clone().invert());
      } else {
        elbow = shoulder.clone().add(v(sign * .094, -Math.sqrt(upperLength ** 2 - .094 ** 2 - .025 ** 2), -.025));
        const angle = curl ? .19 + 2.16 * rep : .15;
        const direction = v(0, -Math.cos(angle), Math.sin(angle));
        palm = elbow.clone().addScaledVector(direction, lowerLength);
        handRotation = frame(direction, X).multiply(hand.restFrame.clone().invert());
      }
      const upperRotation = aim(upper, shoulder, elbow, torso);
      const lowerRotation = aim(arm, elbow, palm, push ? upperRotation : handRotation);
      move(anatomy['clavicle' + side], bodyPoint(anatomy['clavicle' + side].start), torso);
      move(anatomy['shoulderCap' + side], shoulder, torso.clone().slerp(upperRotation, .55));
      move(anatomy['elbow' + side], elbow, upperRotation.clone().slerp(lowerRotation, .60));
      move(anatomy['forearmTwist' + side], elbow, lowerRotation);
      move(wrist, palm, handRotation);
      const handFrame = handRotation.clone().multiply(hand.restFrame);
      const gripAxis = X.clone().applyQuaternion(handFrame);
      fingers.forEach((finger, j) => {
        const target = transform(finger.start, wrist.start, palm, handRotation);
        const angle = curl || squat ? (j === 0 ? -.28 : .85) : 0;
        move(finger, target, rotation(gripAxis, angle).multiply(handRotation));
      });
      if (curl) {
        dumbbells[i].position.copy(transform(hand.palmCenter, wrist.start, palm, handRotation))
          .addScaledVector(Z.clone().applyQuaternion(handFrame), .026);
        dumbbells[i].quaternion.setFromUnitVectors(Y, gripAxis);
      }
    });
  }
  return {root, setExercise, pose};
}
