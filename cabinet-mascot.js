/* 3D beaver in «Карта проекта»: stands behind the bottom edge of the card, the head follows the cursor.
   Loads only on screens wide enough to show it. Without WebGL the slot simply stays empty.
   ?hw in the address paints the part of the model that turns with the head. */
const slot = document.querySelector('.roadmap__mascot');
const wide = matchMedia('(min-width: 1241px)');
let started = false;

function start() {
  if (started || !wide.matches || !slot) return;
  started = true;
  init().catch(() => slot.replaceChildren());
}
wide.addEventListener('change', start);
start();

async function init() {
  const [THREE, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('./vendor/three/examples/jsm/loaders/GLTFLoader.js')
  ]);

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  slot.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa9bdd8, 2.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.45); key.position.set(-1.2, 2, 2.6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe4ff, 0.9); rim.position.set(1.6, 1.3, -1.4); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);   /* units = css px */

  /* model units: feet at y = 0, top of the hair at y ≈ 1.04 */
  const FRAME = { crop: 0.40, top: 1.045, centerX: -0.035 };
  const NECK = { from: 0.60, to: 0.70 };
  const pivot = new THREE.Vector3(-0.035, 0.62, 0);
  const uHead = { value: new THREE.Matrix3() };
  const body = new THREE.Group();
  scene.add(body);

  const gltf = await new GLTFLoader().loadAsync('assets/cabinet/beaver.glb?v=1');
  const mesh = gltf.scene.getObjectByProperty('type', 'Mesh');
  const geo = mesh.geometry;

  /* the file stores compact integers; bake the node transform so y is up and in model units */
  mesh.updateWorldMatrix(true, false);
  for (const name of ['position', 'normal']) {
    const a = geo.attributes[name], f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
    geo.setAttribute(name, new THREE.BufferAttribute(f, 3));
  }
  geo.applyMatrix4(mesh.matrixWorld);
  mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);

  const p = geo.attributes.position, w = new Float32Array(p.count);
  const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) w[i] = smooth(NECK.from, NECK.to, p.getY(i));
  geo.setAttribute('headW', new THREE.BufferAttribute(w, 1));

  if (new URLSearchParams(location.search).has('hw')) {
    const c = new Float32Array(w.length * 3);
    w.forEach((v, i) => { c[i * 3] = 0.2 + 0.8 * v; c[i * 3 + 1] = c[i * 3 + 2] = 0.2; });
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  }
  mesh.material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uHead, uPivot: { value: pivot } });
    sh.vertexShader = 'uniform mat3 uHead; uniform vec3 uPivot; attribute float headW;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = normalize(mix(objectNormal, uHead * objectNormal, headW));')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = mix(transformed, uHead * (transformed - uPivot) + uPivot, headW);');
  };
  body.add(gltf.scene);

  let scale = 1, baseY = 0;
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    renderer.setSize(cw, ch, false);
    scale = ch / (FRAME.top - FRAME.crop);
    body.scale.setScalar(scale);
    body.position.x = -FRAME.centerX * scale;
    baseY = -FRAME.crop * scale;
    camera.left = -cw / 2; camera.right = cw / 2; camera.top = ch; camera.bottom = 0;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const aim = { x: 0, y: 0, has: false };
  addEventListener('pointermove', e => { aim.x = e.clientX; aim.y = e.clientY; aim.has = true; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { aim.has = false; });

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  const cur = { yaw: 0, pitch: 0 }, euler = new THREE.Euler(), m4 = new THREE.Matrix4();
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  function tick(t = 0) {
    requestAnimationFrame(tick);
    if (!visible || document.hidden || !canvas.offsetParent) return;
    const r = canvas.getBoundingClientRect();
    let yaw = 0, pitch = 0;
    if (aim.has) {
      const hx = r.left + r.width / 2, hy = r.top + r.height * 0.36, depth = 460;
      yaw = Math.atan2(aim.x - hx, depth);
      pitch = Math.atan2(aim.y - hy, depth);
    }
    yaw = THREE.MathUtils.clamp(yaw, -0.62, 0.62);
    pitch = THREE.MathUtils.clamp(pitch, -0.24, 0.3);
    const k = still.matches ? 1 : 0.1;
    cur.yaw += (yaw - cur.yaw) * k;
    cur.pitch += (pitch - cur.pitch) * k;
    euler.set(cur.pitch * 0.85, cur.yaw * 0.85, -cur.yaw * 0.05, 'YXZ');
    uHead.value.setFromMatrix4(m4.makeRotationFromEuler(euler));
    body.rotation.y = cur.yaw * 0.14;
    body.position.y = baseY + (still.matches ? 0 : Math.sin(t / 900) * 1.2);
    renderer.render(scene, camera);
  }
  tick();
  canvas.classList.add('is-ready');
}
