/* 3D Krutya in place of the beaver pictures; the head follows the cursor
   (or the field being filled in). ?2d in the address brings the pictures back;
   without WebGL or if the model fails to load, the pictures stay. */
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';

if (!new URLSearchParams(location.search).has('2d')) {
  const wform = document.getElementById('wform');
  const img = document.getElementById('guideImg');
  const canvas = document.createElement('canvas');
  canvas.className = 'wform__beaver krutya3d';
  img.after(canvas);

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
  catch (e) { canvas.remove(); throw e; }                    /* no WebGL: the pictures stay */
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb3cc, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-1.2, 2, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe4ff, 1.0); rim.position.set(1.5, 1.2, -1.5); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);   /* units = css px */

  /* the head turns around the neck; the weight fades in over the neck so it bends, not snaps */
  const NECK = { lo: 0.30, hi: 0.46, pivot: new THREE.Vector3(0, 0.36, -0.05) };
  const uHead = { value: new THREE.Matrix3() };
  const body = new THREE.Group(); scene.add(body);

  new GLTFLoader().load('assets/form/krutya.glb?v=1', gltf => {
    const mesh = gltf.scene.getObjectByProperty('type', 'Mesh');
    mesh.material.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uHead, uPivot: { value: NECK.pivot }, uNeck: { value: new THREE.Vector2(NECK.lo, NECK.hi) } });
      sh.vertexShader = 'uniform mat3 uHead; uniform vec3 uPivot; uniform vec2 uNeck;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n float hw = smoothstep(uNeck.x, uNeck.y, position.y);\n objectNormal = normalize(mix(objectNormal, uHead * objectNormal, hw));')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = mix(transformed, uHead * (transformed - uPivot) + uPivot, hw);');
    };
    body.add(gltf.scene);
    wform.classList.add('has-3d');
    resize(); tick();
  }, undefined, () => canvas.remove());

  function resize(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const cs = getComputedStyle(canvas), kp = parseFloat(cs.getPropertyValue('--kp')) || 0;
    /* bottom of the bust on the canvas bottom edge, top of the ears just under the extra top margin */
    const s = Math.min((h - kp * 0.6) * 0.98, w * 0.98);
    body.scale.setScalar(s);
    camera.left = -w / 2; camera.right = w / 2; camera.top = h; camera.bottom = 0;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);

  /* where to look: the pointer; while typing, the field in focus */
  const aim = { x: 0, y: 0, has: false };
  addEventListener('pointermove', e => { aim.x = e.clientX; aim.y = e.clientY; aim.has = true; }, { passive: true });
  document.addEventListener('focusin', e => {
    if (!e.target.matches('input, select, textarea, button')) return;
    const r = e.target.getBoundingClientRect(); aim.x = r.left + r.width / 2; aim.y = r.top + r.height / 2; aim.has = true;
  });

  const cur = { yaw: 0, pitch: 0 }, e3 = new THREE.Euler(), m4 = new THREE.Matrix4();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tick(t = 0){
    requestAnimationFrame(tick);
    if (!canvas.offsetParent) return;                       /* hidden step / welcome screen */
    const r = canvas.getBoundingClientRect();
    const hx = r.left + r.width / 2, hy = r.top + r.height * 0.3;   /* roughly where the eyes are */
    let yaw = 0, pitch = 0;
    if (aim.has){
      const dx = aim.x - hx, dy = aim.y - hy, d = 420;           /* d: how far the screen is "in front" of him */
      yaw = Math.atan2(dx, d); pitch = Math.atan2(dy, d);
    }
    yaw = THREE.MathUtils.clamp(yaw, -1.0, 1.0); pitch = THREE.MathUtils.clamp(pitch, -0.45, 0.6);
    const k = 0.12; cur.yaw += (yaw - cur.yaw) * k; cur.pitch += (pitch - cur.pitch) * k;
    /* most of the turn in the head, a little in the whole body */
    e3.set(cur.pitch * 0.75, cur.yaw * 0.7, -cur.yaw * 0.06, 'YXZ'); m4.makeRotationFromEuler(e3); uHead.value.setFromMatrix4(m4);
    body.rotation.y = cur.yaw * 0.3;
    body.position.y = still ? 0 : Math.sin(t / 700) * 1.5;   /* breathing */
    renderer.render(scene, camera);
  }
}
