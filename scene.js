import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

/* ------------------------------------------------------------------
   Living background: a flat illustration with lightweight 3D traffic.
   All paths and occluders are written in the picture's own pixels
   (1446 x 1087), so they stay glued to the drawing at any screen size.
   ------------------------------------------------------------------ */

const IW = 1446, IH = 1087;          /* the original picture: every route and layer is written in its pixels */
/* the extended background: sky above, road below, street on both sides.
   The original sits OX px from the left and OY px from the top of it. */
const FULL_W = 2800, FULL_H = 1800, OX = 688, OY = 368;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const animating = !reduceMotion && !params.has('t');

const stage = document.getElementById('stage');
const canvas = document.getElementById('world');
if (DEBUG) stage.classList.add('debug');

/* ---------- camera matched to the drawing's perspective ---------- */
const CAM = {fov: 35, height: 8, horizonY: 450};
const camera = new THREE.PerspectiveCamera(CAM.fov, IW / IH, 0.1, 1000);
camera.position.set(0, CAM.height, 0);
{
  const t = Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2));
  const pitch = Math.atan((IH / 2 - CAM.horizonY) / (IH / 2) * t);
  camera.rotation.x = -pitch;
}
/* the camera is matched to the original frame; the view simply extends it by the added
   sky above and road below, so the original area projects exactly as before */
camera.setViewOffset(IW, IH, -OX, -OY, FULL_W, FULL_H);
camera.updateMatrixWorld();

const ray = new THREE.Raycaster();
function rayAt(px, py){
  ray.setFromCamera(new THREE.Vector2((px + OX) / FULL_W * 2 - 1, -((py + OY) / FULL_H * 2 - 1)), camera);
  return ray.ray;
}
/* a 3D point → original-picture pixels */
const toPx = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * FULL_W - OX, (1 - p.y) / 2 * FULL_H - OY]; };
/* cut-out layers: place them from their original-picture pixel boxes */
for (const el of document.querySelectorAll('.layer[data-x]')){
  const [x, y, w, h] = ['x', 'y', 'w', 'h'].map(k => +el.dataset[k]);
  Object.assign(el.style, {left: (x + OX) / FULL_W * 100 + '%', top: (y + OY) / FULL_H * 100 + '%',
    width: w / FULL_W * 100 + '%', height: h / FULL_H * 100 + '%'});
  el.classList.add('placed');
}
/* a picture pixel → point on the ground (y = h) */
function ground(px, py, h = 0){
  const r = rayAt(px, py);
  const t = (h - r.origin.y) / r.direction.y;
  return r.origin.clone().addScaledVector(r.direction, t);
}
/* a picture pixel → point at distance d along the view ray (for things in the air) */
function air(px, py, d){
  const r = rayAt(px, py);
  return r.origin.clone().addScaledVector(r.direction, d);
}
const curve = pts => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
const mobile = matchMedia('(max-width: 820px)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xe3efff, 0x8ea6c8, 1.5));
const sun = new THREE.DirectionalLight(0xfff3e2, 2.0);
sun.position.set(-30, 40, 10);
scene.add(sun);

/* ---------- materials ---------- */
const M = {
  white: new THREE.MeshPhysicalMaterial({color: 0xf4f7fb, roughness: .32, clearcoat: .7, clearcoatRoughness: .25}),
  blue:  new THREE.MeshPhysicalMaterial({color: 0x2f5fd8, roughness: .35, clearcoat: .6}),
  glass: new THREE.MeshPhysicalMaterial({color: 0x1b2a4a, roughness: .08, metalness: .2, clearcoat: 1}),
  tyre:  new THREE.MeshStandardMaterial({color: 0x23262d, roughness: .8}),
  hub:   new THREE.MeshStandardMaterial({color: 0xdfe5ee, roughness: .4, metalness: .3}),
  grey:  new THREE.MeshStandardMaterial({color: 0x9aa6b8, roughness: .5}),
  card:  new THREE.MeshStandardMaterial({color: 0xd9a35e, roughness: .85}),
  amber: new THREE.MeshStandardMaterial({color: 0xffc46b, emissive: 0xffa53a, emissiveIntensity: 2.2}),
  cyan:  new THREE.MeshStandardMaterial({color: 0x9fd8ff, emissive: 0x4aa8ff, emissiveIntensity: 2.4}),
  rotor: new THREE.MeshBasicMaterial({color: 0xcfd8e6, transparent: true, opacity: .35, depthWrite: false})
};

/* soft contact shadow under ground vehicles */
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(20,30,60,.55)'); gr.addColorStop(1, 'rgba(20,30,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function blob(w, l){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({map: blobTex, transparent: true, depthWrite: false}));
  m.rotation.x = -Math.PI / 2; m.position.y = .02; m.renderOrder = -1;
  return m;
}

const rbox = (w, h, d, r, mat, x = 0, y = 0, z = 0, seg = 3) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, r), mat);
  m.position.set(x, y, z); return m;
};
function wheel(r, w, x, y, z){
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), M.tyre);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(r * .5, r * .5, w + .02, 16), M.hub);
  t.rotation.z = h.rotation.z = Math.PI / 2;
  g.add(t, h); g.position.set(x, y, z); return g;
}

/* ---------- placeholder models (all face +Z) ---------- */
function makeShuttle(){
  const g = new THREE.Group();
  g.add(rbox(2.1, .9, 4.6, .3, M.blue, 0, .78, 0));
  g.add(rbox(2.06, 1.5, 4.5, .45, M.white, 0, 1.75, 0, 4));
  g.add(rbox(2.12, .78, 3.3, .2, M.glass, 0, 1.9, -.25));
  g.add(rbox(1.75, .95, .12, .06, M.glass, 0, 1.85, 2.22));
  g.add(rbox(1.3, .22, 2.2, .1, M.white, 0, 2.58, -.2));
  g.add(rbox(1.5, .08, .06, .03, M.amber, 0, 1.18, 2.3));
  for (const s of [-1, 1]) g.add(rbox(.04, .06, 3.6, .02, M.cyan, s * 1.06, 1.3, -.1));
  for (const x of [-.95, .95]) for (const z of [-1.5, 1.5]) g.add(wheel(.42, .3, x, .42, z));
  g.add(blob(3.4, 6));
  g.scale.setScalar(.85);
  return g;
}

function makeTrainCar(lead){
  const g = new THREE.Group();
  g.add(rbox(2.6, 2.7, 7, .6, M.white, 0, 1.65, 0, 4));
  g.add(rbox(2.64, .45, 6.9, .2, M.blue, 0, .55, 0));
  g.add(rbox(2.66, .85, 6, .25, M.glass, 0, 2.05, 0));
  for (const s of [-1, 1]) g.add(rbox(.04, .07, 6.4, .03, M.cyan, s * 1.32, 1.1, 0));
  if (lead){
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), M.white);
    nose.scale.set(1, 1.04, 1.5); nose.position.set(0, 1.65, 3.4); g.add(nose);
    const wind = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 16), M.glass);
    wind.scale.set(1.05, .55, 1.25); wind.position.set(0, 2.1, 3.9); g.add(wind);
    g.add(rbox(1.2, .1, .1, .04, M.amber, 0, 1.15, 5.25));
  }
  return g;
}

function makeRobot(){
  const g = new THREE.Group();
  g.add(rbox(1.05, .75, 1.35, .22, M.white, 0, .7, 0));
  g.add(rbox(1.08, .25, 1.38, .1, M.blue, 0, .42, 0));
  g.add(rbox(.8, .38, .06, .08, M.glass, 0, .78, .68));
  for (const x of [-.18, .18]) g.add(rbox(.12, .08, .04, .03, M.cyan, x, .8, .72));
  g.add(rbox(.75, .48, .65, .05, M.card, 0, 1.3, -.1));
  for (const x of [-.48, .48]) for (const z of [-.45, .45]) g.add(wheel(.2, .14, x, .2, z));
  g.add(blob(1.6, 2));
  return g;
}

function makeDrone(){
  const g = new THREE.Group();
  g.add(rbox(.7, .22, .7, .1, M.tyre, 0, 0, 0));
  const rotors = [];
  for (const [x, z] of [[-.75, -.75], [.75, -.75], [-.75, .75], [.75, .75]]){
    const arm = rbox(1.0, .06, .1, .03, M.grey, x / 2, .02, z / 2);
    arm.rotation.y = Math.atan2(-z, x); g.add(arm);
    g.add(rbox(.14, .12, .14, .04, M.amber, x, .08, z));
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .01, 24), M.rotor);
    rot.position.set(x, .16, z); g.add(rot); rotors.push(rot);
  }
  const line = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .5, 4), M.grey);
  line.position.y = -.35; g.add(line);
  g.add(rbox(.55, .42, .5, .04, M.card, 0, -.8, 0));
  g.userData.rotors = rotors;
  return g;
}

function makeFlyer(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), M.white);
  body.scale.set(1.15, .5, 2.5); g.add(body);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), M.glass);
  cab.scale.set(.82, .42, 1.25); cab.position.set(0, .32, .3); g.add(cab);
  for (const s of [-1, 1]) g.add(rbox(.05, .07, 3.2, .03, M.cyan, s * 1.1, -.12, 0));
  g.add(rbox(1.4, .07, .2, .03, M.amber, 0, .02, 2.42));
  g.add(rbox(1.6, .08, .5, .04, M.white, 0, .25, -2.2));
  /* light trails */
  const trailMat = new THREE.MeshBasicMaterial({color: 0xbfe0ff, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending});
  for (const s of [-1, 1]){
    const tr = new THREE.Mesh(new THREE.PlaneGeometry(.12, 7), trailMat);
    tr.rotation.x = -Math.PI / 2; tr.position.set(s * .9, -.1, -5.8); g.add(tr);
  }
  return g;
}

/* ---------- routes, in picture pixels ---------- */
const routes = {
  /* the bus: from behind the arch, along the far lane to the left edge,
     a U-turn there, back along the near lane and out toward the viewer */
  shuttleA: curve([[1262,678],[1230,668],[1123,650],[963,660],[763,672],[433,705],[133,745],[13,785],[-32,825],[13,865],[213,905],[613,975],[903,1035],[1088,1105],[1342,1160],[1600,1205],[1826,1240],[2112,1285],[2500,1340]].map(([x,y]) => ground(x, y))),   /* along the near lane, traced from the lane markings, out past the right edge */
  /* far lane: out of the tunnel, away to the left */
  shuttleB: curve([[1420,694],[1250,690],[1060,676],[820,670],[560,682],[300,708],[80,740],[-300,790]].map(([x,y]) => ground(x, y))),
  /* the monorail deck, right → left, disappearing behind the building */
  /* traced from the red line on the deck: left → right, out from behind the building.
     The deck recedes to the left, so points there are farther away (third number). */
  train: curve([[150,388,133],[200,374,125],[279,354,113],[359,336,101],[439,322,93],[519,312,88],[639,306,81],[758,305,76],[878,307,73],[998,308,70],[1118,306,68],[1237,306,66],[1357,309,64],[1437,312,62],[1850,318,52],[2350,326,46],[3200,340,40]].map(([x,y,d]) => air(x, y, d))),
  /* right sidewalk, traced from the red line: in from the bottom-right between the planter
     and the lamp, left along the lower pass, a rounded C-turn, back along the upper pass and
     out to the top-right behind the flowers */
  robot: curve([
    [2350,1040],[1950,995],[1700,965],                                   /* along the sidewalk from beyond the right edge */
    [1600,950],[1520,925],[1446,907],[1400,901],[1376,898],[1336,894],[1296,890],[1256,886],
    [1240,884],[1229,882],[1222,878],[1217,872],[1214,862],[1215,852],[1219,844],[1227,836],
    [1240,833],[1256,830],[1296,824],[1336,818],[1376,812],[1400,809],[1448,800],[1530,782],
    [1800,745],[2350,690]                                                 /* away behind the bushes */
  ].map(([x,y]) => ground(x, y))),
  /* flying car: appears far over the city and sweeps past toward the viewer */
  /* flying car, traced from the red line: from behind the curved tower (far away, tiny),
     past the spire, rising and coming closer, out of frame top-right (close and big).
     Third number = distance; the towers' depth cut-out sits at 140, so the start is hidden.
     It leaves the city toward us at first, then mostly travels right and exits past the edge. */
  flyer: curve([[640,266,320],[691,262,300],[771,248,250],[818,230,215],[850,207,190],[882,178,174],[914,154,160],[945,138,149],[977,124,140],[1009,116,131],[1057,114,122],[1104,114,115],[1152,118,108],[1200,122,103],[1247,123,98],[1295,119,94],[1343,113,90],[1390,103,87],[1438,84,84],[1650,40,76],[1900,0,73],[2400,-80,68]].map(([x,y,d]) => air(x, y, d)))
};

/* ---------- actors ---------- */
const shuttleA = makeShuttle(), shuttleB = makeShuttle(), robot = makeRobot(), drone = makeDrone(), flyer = makeFlyer(), flyerB = makeFlyer();
const train = [makeTrainCar(true), makeTrainCar(false), makeTrainCar(false)];
const trainBody = new THREE.Group();   /* the real articulated train, one rigid model */
trainBody.visible = false;
flyer.name = 'flyerA'; flyerB.name = 'flyerB';
scene.add(shuttleA, shuttleB, robot, drone, flyer, flyerB, ...train, trainBody);

/* the skyscrapers as an invisible depth wall: the background already shows them, this only
   hides whatever flies behind them. Placed by pixels (x 482, y 119, 370 x 190) at depth 140,
   so the far flying car disappears behind the towers while the nearer train passes in front. */
{
  const [X, Y, W, H, Z] = [482, 119, 370, 190, 140];
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  const corner = (px, py) => { const r = rayAt(px, py); return r.origin.clone().addScaledVector(r.direction, Z / r.direction.dot(fwd)); };
  const g = new THREE.BufferGeometry();
  const P = [corner(X, Y), corner(X + W, Y), corner(X, Y + H), corner(X + W, Y + H)];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(v => v.toArray()), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0,1, 1,1, 0,0, 1,0], 2));
  g.setIndex([0, 2, 1, 2, 3, 1]);
  const wall = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load('assets/towers.webp', () => { if (!animating) drawStill(); }),
    alphaTest: .5, colorWrite: false, side: THREE.DoubleSide
  }));
  wall.renderOrder = -10;               /* write depth before anything else draws */
  scene.add(wall);
}

/* ---------- real models replace placeholders as they arrive ---------- */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);   /* models are meshopt-compressed */
function swapIn(holder, url, length, {shadow = true, centerY = false, onReady} = {}){
  loader.load(url, gltf => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(length / size.z);           /* models face +Z, sized by length */
    if (centerY) model.position.y = -size.y * length / size.z / 2;   /* hang from its middle, not stand on its base */
    model.traverse(o => { if (o.isMesh) o.material.envMapIntensity = .8; });
    const sh = shadow && blob(size.x / size.z * length * 1.5, length * 1.3);
    for (const h of holder){
      h.clear();
      h.scale.setScalar(1);
      h.add(h === holder[0] ? model : model.clone());
      if (sh) h.add(sh.clone());
    }
    if (onReady) onReady(model);
    if (!animating) drawStill();
  });
}
swapIn([shuttleA, shuttleB], 'assets/bus.glb', 4.2);
/* quadcopter: about 2.4 m across the rotors (the model is 1.36× wider than it is deep) */
swapIn([drone], 'assets/drone.glb', 2.4 / 1.36, {shadow: false, centerY: true, onReady(model){
  /* see-through spinning blades over the four rotor discs (centres measured in the model, its own units) */
  const R = .175, Y = .44;
  const bladeMat = new THREE.MeshBasicMaterial({color: 0x2a3140, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide});
  const blade = new THREE.PlaneGeometry(R * 2, R * .16); blade.rotateX(-Math.PI / 2);
  const rotors = [];
  [[-.283, -.208], [-.336, .173], [.338, -.185], [.312, .206]].forEach(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, Y, z);
    const b = new THREE.Mesh(blade, bladeMat); b.renderOrder = 2;
    g.add(b);
    g.userData.dir = (i === 0 || i === 3) ? 1 : -1;   /* diagonal pairs spin opposite ways, like a real quad */
    model.add(g); rotors.push(g);
  });
  drone.userData.rotors = rotors;
}});
/* delivery robot: about 1.6 m long, stands on the sidewalk with a soft contact shadow */
swapIn([robot], 'assets/robot.glb', 1.6);
/* flying cars: about 5 m long, hanging from their middle */
swapIn([flyer, flyerB], 'assets/flyer.glb', 5, {shadow: false, centerY: true});
const TRAIN_LENGTH = 16;
let trainReady = false;
swapIn([trainBody], 'assets/train.glb', TRAIN_LENGTH, {shadow: false, onReady(){
  trainReady = true;
  train.forEach(c => scene.remove(c));
}});

/* the drone's hover spot: over the station on wide screens; on tall screens (phones) up in the
   extended sky, clear of the big tree, so it hangs higher in the frame */
const DRONE_WIDE = air(430, 150, 22), DRONE_TALL = air(880, -160, 22);
let dronePos = DRONE_WIDE;
const tmp = new THREE.Vector3();
/* planting the robot passes in front of on the way in and behind on the way out */
const swapLayers = ['flowerLayer', 'bushLayer'].map(id => document.getElementById(id)).filter(Boolean);
/* where along the robot's route the U-turn is: the leftmost point on screen */
const robotTurnU = (() => {
  let best = 0, bx = Infinity;
  for (let i = 0; i <= 200; i++){
    const x = tmp.copy(routes.robot.getPointAt(i / 200)).project(camera).x;
    if (x < bx){ bx = x; best = i / 200; }
  }
  return best;
})();

const camFwd = camera.getWorldDirection(new THREE.Vector3());
function follow(obj, c, u, {pitch = 0, level = false, reverse = false, byPoints = false, sideOn = 1, smooth = 0} = {}){
  u = THREE.MathUtils.clamp(u, 0, 1);
  /* byPoints: equal time between the traced points (steady across the screen) instead of steady in 3D */
  const at = byPoints ? v => c.getPoint(v) : v => c.getPointAt(v);
  const p = at(u);
  let q;
  if (smooth){
    /* steady heading: aim along the chord over a long stretch of the path, so small wiggles
       in the traced line move the car but do not swing its nose */
    const a = at(THREE.MathUtils.clamp(u - smooth, 0, 1)), b = at(THREE.MathUtils.clamp(u + smooth, 0, 1));
    q = p.clone().add(reverse ? a.sub(b) : b.sub(a));
  } else {
    const s = reverse ? -.002 : .002;        /* reverse: travel toward the start of the curve */
    q = at(THREE.MathUtils.clamp(u + s, 0, 1));
    if (q.distanceToSquared(p) < 1e-10) q.copy(p).add(p.clone().sub(at(THREE.MathUtils.clamp(u - s, 0, 1))));
  }
  if (level) q.y = p.y;              /* turn only left/right: no nose-up / nose-down tilt */
  if (sideOn < 1){                   /* keep only part of the toward/away-from-camera heading, so it shows its side */
    const dir = q.clone().sub(p);
    dir.addScaledVector(camFwd, -dir.dot(camFwd) * (1 - sideOn));
    q.copy(p).add(dir);
  }
  obj.position.copy(p);
  obj.lookAt(q);
  if (pitch) obj.rotateX(pitch);
}

const trainLen = routes.train.getLength();
const TRAIN_V = 6.45, TRAIN_PAUSE = 2;   /* metres per second; seconds between trains */
/* the flying cars' fixed course: the overall direction of the flight, level, turned mostly
   side-on to the viewer (only 30% of the toward-camera part kept) */
const flyHeading = (() => {
  const P = routes.flyer.points;             /* the traced stretch only, not the run-out past the edge */
  const d = P[20].clone().sub(P[4]);
  d.addScaledVector(camFwd, -d.dot(camFwd) * .7);
  d.y = 0;
  return d.normalize();
})();
/* even speed on screen: re-parameterise a curve by its projected (on-screen) length, so the car
   glides at a steady pace whatever the spacing of the traced points or the depth */
function evenOnScreen(c, n = 600){
  const us = [], acc = [0];
  let prev = null;
  for (let i = 0; i <= n; i++){
    const u = i / n, [x, y] = toPx(c.getPoint(u));
    if (prev) acc.push(acc[acc.length - 1] + Math.hypot(x - prev[0], y - prev[1]));
    us.push(u); prev = [x, y];
  }
  const total = acc[n];
  return s => {
    const target = THREE.MathUtils.clamp(s, 0, 1) * total;
    let lo = 0, hi = n;
    while (hi - lo > 1){ const m = (lo + hi) >> 1; if (acc[m] < target) lo = m; else hi = m; }
    const f = (target - acc[lo]) / ((acc[hi] - acc[lo]) || 1);
    return c.getPoint(us[lo] + (us[hi] - us[lo]) * f);
  };
}
const flyerAt = evenOnScreen(routes.flyer);
const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

function update(t){
  /* shuttles */
  follow(shuttleA, routes.shuttleA, (t / 22) % 1);
  follow(shuttleB, routes.shuttleA, (t / 22 + .5) % 1);   /* same route, half a lap behind */

  /* monorail: a steady 6.45 m/s along the whole deck. Both bogies stay on the line from the
     moment the rear leaves the start (hidden behind the station) until the front reaches the far
     end (well past the right edge), so the train never slows or blinks out while in view. */
  const head = ((t / 20) % 1) * 1.15;         /* used by the placeholder cars only */
  if (trainReady){
    const H = TRAIN_LENGTH * .45;              /* bogie offset from the middle, metres */
    const runTime = (trainLen - 2 * H) / TRAIN_V;
    const s = t % (runTime + TRAIN_PAUSE);
    trainBody.visible = s <= runTime;
    if (trainBody.visible){
      const c = H + s * TRAIN_V;               /* distance of the middle along the deck */
      const rear = routes.train.getPointAt((c - H) / trainLen);
      const front = routes.train.getPointAt((c + H) / trainLen);
      trainBody.position.copy(rear).add(front).multiplyScalar(.5);
      trainBody.lookAt(front);
    }
  } else train.forEach((car, i) => {
    const u = head - i * 7.6 / trainLen;
    car.visible = u >= 0 && u <= 1;
    if (car.visible) follow(car, routes.train, u, {pitch: -.08});
  });

  /* robot: in along the sidewalk in front of the planting, U-turn at the curb, out behind it */
  const ru = (t / 26) % 1;
  follow(robot, routes.robot, ru, {level: true});
  /* first pass (before the U-turn) runs in front of the flowers and bushes, so their layers sit
     behind the 3D layer; they come forward only at the turn, far from them, so nothing pops */
  {
    const behind = ru < robotTurnU;
    for (const el of swapLayers) if (behind !== el.classList.contains('behind')) el.classList.toggle('behind', behind);
  }
  robot.position.y += Math.abs(Math.sin(t * 9)) * .015;   /* tiny wheel bump */

  /* drone hovers and drifts */
  drone.position.copy(dronePos).add(tmp.set(Math.sin(t * .5) * 1.2, Math.sin(t * 1.3) * .25, Math.cos(t * .4) * .6));
  drone.rotation.set(Math.sin(t * .5) * .06, t * .15, Math.cos(t * .5) * .06);
  for (const r of drone.userData.rotors) r.rotation.y = t * 21 * (r.userData.dir || 1);

  placeFlyers(t);

  /* steam under the flying cars: a real-time trail, so it needs the time step */
  if (lastSteamT === null || t < lastSteamT || t - lastSteamT > .5){
    /* first frame, a jump, or a still frame: rebuild the last 1.5 s of trail so it looks settled */
    for (const sys of steam) sys.pool.forEach(p => { p.life = p.max; p.s.visible = false; });
    for (let tt = t - 1.5; tt < t; tt += 1 / 30){ placeFlyers(tt); steam.forEach(sys => stepSteam(sys, 1 / 30)); }
    placeFlyers(t);
  } else steam.forEach(sys => stepSteam(sys, t - lastSteamT));
  lastSteamT = t;
}

/* flying cars: one leaves the towers and flies out past the right edge (14 s, steady pace),
   then, after a short pause, another comes in from the right and flies back into the towers */
const FLY_CYCLE = 30, FLY_TIME = 14, FLY_B_START = 15;
function placeFlyers(t){
  {
    const s = t % FLY_CYCLE;
    flyer.visible = s < FLY_TIME;
    /* position follows the traced line; the nose keeps one steady course (no yawing about) */
    if (flyer.visible){
      flyer.position.copy(flyerAt(s / FLY_TIME));
      flyer.lookAt(tmp.copy(flyer.position).add(flyHeading));
    }
    flyerB.visible = s >= FLY_B_START && s < FLY_B_START + FLY_TIME;
    if (flyerB.visible){
      flyerB.position.copy(flyerAt(1 - (s - FLY_B_START) / FLY_TIME));
      flyerB.lookAt(tmp.copy(flyerB.position).sub(flyHeading));
    }
    /* a slow, slight hover bob, so they float rather than slide */
    flyer.position.y += Math.sin(t * 1.2) * .08;
    flyerB.position.y += Math.sin(t * 1.2 + 1) * .08;
    flyer.updateMatrixWorld(); flyerB.updateMatrixWorld();
  }
}

/* ---------- steam: soft puffs from under the four hover discs ---------- */
const steamTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
/* the discs, in the car's own metres (car is 5 m long, faces +Z, centre at its middle) */
const DISCS = [[-1.2, -.85, 1.55], [1.2, -.85, 1.55], [-1.2, -.85, -1.55], [1.2, -.85, -1.55]];
function makeSteam(holder){
  const pool = [];
  for (let i = 0; i < 90; i++){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: steamTex, color: 0xeef5ff, transparent: true, opacity: 0, depthWrite: false}));
    s.visible = false; scene.add(s);
    pool.push({s, life: 1, max: 1, v: new THREE.Vector3()});
  }
  return {holder, pool, next: 0, acc: 0};
}
const steam = [makeSteam(flyer), makeSteam(flyerB)];
let lastSteamT = null;
function stepSteam(sys, dt){
  if (sys.holder.visible){
    sys.acc += dt * (mobile ? 32 : 52);         /* puffs per second (fewer on phones) */
    while (sys.acc >= 1){
      sys.acc -= 1;
      const p = sys.pool[sys.next]; sys.next = (sys.next + 1) % sys.pool.length;
      const [x, y, z] = DISCS[Math.floor(Math.random() * 4)];
      p.s.position.set(x + (Math.random() - .5) * .5, y, z + (Math.random() - .5) * .5);
      sys.holder.localToWorld(p.s.position);
      p.v.set((Math.random() - .5) * .4, -1.1 - Math.random() * .6, (Math.random() - .5) * .4);
      p.life = 0; p.max = 1 + Math.random() * .5; p.s.visible = true;
    }
  }
  for (const p of sys.pool){
    if (!p.s.visible) continue;
    p.life += dt;
    if (p.life >= p.max){ p.s.visible = false; continue; }
    p.s.position.addScaledVector(p.v, dt);
    p.v.multiplyScalar(1 - Math.min(1, 1.6 * dt));          /* air drag: puffs slow and hang */
    const k = p.life / p.max;
    p.s.scale.setScalar(.8 + 2.6 * k);
    p.s.material.opacity = .58 * Math.pow(1 - k, 1.4) * Math.min(1, p.life * 10);
  }
}

/* ---------- occluders: pieces of the picture that stand in front of traffic ---------- */
const occluders = {
  /* the arch (assets/arch.webp) and the station building (assets/building.webp)
     are hand-cut layers placed in index.html */
  /* the flower planter bottom-left, now continuing down into the extended foreground */
  planter:  [[0,850],[70,862],[140,948],[250,962],[330,984],[396,1014],[425,1060],[432,1150],[420,1212],[0,1218]]
};
for (const [name, pts] of Object.entries(occluders)){
  const d = document.createElement('div');
  d.className = 'occ'; d.dataset.name = name;
  d.style.clipPath = `polygon(${pts.map(([x, y]) => `${((x + OX) / FULL_W * 100).toFixed(3)}% ${((y + OY) / FULL_H * 100).toFixed(3)}%`).join(',')})`;
  stage.appendChild(d);
}

/* ---------- debug: draw the routes on top ---------- */
let dbg;
if (DEBUG){
  dbg = document.createElement('canvas');
  dbg.width = FULL_W; dbg.height = FULL_H;
  dbg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5';
  stage.appendChild(dbg);
  const g = dbg.getContext('2d');
  g.translate(OX, OY);                /* draw in original-picture pixels */
  const proj = toPx;
  const colors = {shuttleA: '#f0f', shuttleB: '#0ff', train: '#ff0', robot: '#0f0', flyer: '#f80'};
  for (const [k, c] of Object.entries(routes)){
    g.strokeStyle = colors[k]; g.lineWidth = 2; g.beginPath();
    c.getSpacedPoints(80).forEach((v, i) => { const [x, y] = proj(v); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  g.strokeStyle = '#000'; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, CAM.horizonY); g.lineTo(IW, CAM.horizonY); g.stroke();
  window.__scene = {THREE, scene, camera, routes, update, ground, air};
}

/* ---------- framing: which part of the tall picture each screen shows ----------
   The picture always covers the screen. Wide screens keep the original view centred
   (the added sky and road are cropped away); tall screens show the full height,
   centred a little right of the middle so the monorail, buses and arch stay in view. */
const FOCUS_WIDE = [OX + 723, OY + 543];   /* centre of the original picture */
const FOCUS_TALL = [OX + 800, FULL_H / 2];
const viewportEl = stage.parentElement;
function frameStage(){
  const vw = viewportEl.clientWidth, vh = viewportEl.clientHeight;
  /* form page: on landscape screens frame the ORIGINAL picture (station, monorail, arch) as in the
     Figma mock-up; the extended sky/road/sides only fill in where the screen is wider than it */
  const s = vw < vh ? Math.max(vw / FULL_W, vh / FULL_H)
                    : Math.max(vw / FULL_W, vh / FULL_H, Math.min(vw / IW, vh / IH));
  const w = FULL_W * s, h = FULL_H * s;
  const [fx, fy] = vw < vh ? FOCUS_TALL : FOCUS_WIDE;
  dronePos = vw < vh ? DRONE_TALL : DRONE_WIDE;
  const clamp = (v, lo) => Math.min(0, Math.max(lo, v));
  Object.assign(stage.style, {width: w + 'px', height: h + 'px',
    left: clamp(vw / 2 - fx * s, vw - w) + 'px', top: clamp(vh / 2 - fy * s, vh - h) + 'px'});
  stage.classList.add('framed');
}
new ResizeObserver(frameStage).observe(viewportEl);
frameStage();

/* ---------- size & loop ---------- */
function resize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
}
new ResizeObserver(resize).observe(stage);
resize();

let T0 = performance.now();
const tParam = params.get('t');
/* still frame: reduced motion, or ?t=seconds for inspecting one moment */
function drawStill(){ update(tParam !== null ? +tParam : 6); renderer.render(scene, camera); }
/* the loop pauses while the scene is scrolled out of view (saves battery when used as a page background) */
let onScreen = true, looping = false, paused = false, pausedAt = 0;
function frame(){
  if (!onScreen || paused){ looping = false; return; }
  update((performance.now() - T0) / 1000 + 3);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function start(){ if (!looping){ looping = true; requestAnimationFrame(frame); } }
if (animating){
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) start(); }).observe(stage);
  start();
} else drawStill();

/* pause / resume for the page (the form's pause button): the scene freezes on the current
   frame and carries on from the same moment, so nothing jumps */
window.cityScene = {
  get paused(){ return paused; },
  pause(){ if (!paused){ paused = true; pausedAt = performance.now(); } },
  resume(){ if (paused){ paused = false; T0 += performance.now() - pausedAt; if (animating) start(); } }
};
