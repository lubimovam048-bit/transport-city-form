/* 3D beaver in «Карта проекта»: leans on the bottom edge of the card and watches the cursor.
   The irises do most of the work, the head only follows a little.
   Loads only on screens wide enough to show it. Without WebGL the slot simply stays empty. */
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
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe2d8cf, 2.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(-1.2, 2, 2.6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(1.6, 1.3, -1.4); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);   /* units = css px */

  /* model units after baking: the bust stands from y = -0.478 to y = 0.478, facing +z */
  const FRAME = { bottom: -0.478, top: 0.478, centerX: 0 };
  const CARD_EDGE = -0.44;                      /* the card's bottom edge crosses the model here: only the paws go below it */
  const OVER_TOP = 28, SIZE = 0.85;             /* base height over the card (px) and the mascot's scale */
  const NECK = { from: -0.2, to: 0.02 };
  const pivot = new THREE.Vector3(-0.05, -0.12, 0);
  const EYES = [
    { c: new THREE.Vector2(-0.167, 0.146), r: new THREE.Vector2(0.056, 0.052), rest: new THREE.Vector2(-0.158, 0.138) },
    { c: new THREE.Vector2(0.067, 0.1455), r: new THREE.Vector2(0.056, 0.052), rest: new THREE.Vector2(0.058, 0.1375) }
  ];
  const IRIS_R = 0.0395;
  const LOOK = { x: 0.022, y: 0.015, up: 0.028 }; /* how far the irises travel, in model units */
  const uHead = { value: new THREE.Matrix3() };
  const uGaze = { value: new THREE.Vector2() };
  const body = new THREE.Group();
  scene.add(body);

  const [gltf, iris] = await Promise.all([
    new GLTFLoader().loadAsync('assets/cabinet/beaver.glb?v=2'),
    new THREE.TextureLoader().loadAsync('assets/cabinet/iris.jpg?v=1')
  ]);
  iris.colorSpace = THREE.SRGBColorSpace;
  iris.anisotropy = 4;
  const mesh = gltf.scene.getObjectByProperty('type', 'Mesh');
  mesh.frustumCulled = false;
  const geo = mesh.geometry;

  /* the file stores compact integers: bake the node transform and turn the beaver to the viewer */
  mesh.updateWorldMatrix(true, false);
  for (const name of ['position', 'normal']) {
    const a = geo.attributes[name], f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
    geo.setAttribute(name, new THREE.BufferAttribute(f, 3));
  }
  geo.applyMatrix4(mesh.matrixWorld);
  geo.rotateY(-Math.PI / 2);
  mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);

  const p = geo.attributes.position, w = new Float32Array(p.count);
  const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) w[i] = smooth(NECK.from, NECK.to, p.getY(i));
  geo.setAttribute('headW', new THREE.BufferAttribute(w, 1));

  /* matte material: specular highlights were washing the colours out */
  mesh.material = new THREE.MeshLambertMaterial({ map: mesh.material.map, normalMap: mesh.material.normalMap });
  mesh.material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      uHead, uGaze, uIris: { value: iris }, uIrisR: { value: IRIS_R }, uPivot: { value: pivot }, uEdge: { value: CARD_EDGE },
      uEyeC: { value: EYES.map(e => e.c) }, uEyeR: { value: EYES.map(e => e.r) }, uEyeRest: { value: EYES.map(e => e.rest) }
    });
    sh.vertexShader = 'uniform mat3 uHead; uniform vec3 uPivot; attribute float headW; varying vec3 vRest;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = normalize(mix(objectNormal, uHead * objectNormal, headW));')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest = position;\n transformed = mix(transformed, uHead * (transformed - uPivot) + uPivot, headW);');
    /* inside each eye opening: a clean white, the iris on top of it, a highlight that barely moves.
       Skin and lids outside the opening keep the original texture. */
    sh.fragmentShader = `uniform sampler2D uIris; uniform float uIrisR; uniform float uEdge; uniform vec2 uGaze;
      uniform vec2 uEyeC[2]; uniform vec2 uEyeR[2]; uniform vec2 uEyeRest[2]; varying vec3 vRest;
      float gEyeMask = 0.0;
      vec3 brandGrade(vec3 c) {            /* brings the texture to the mascot's brand colours */
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 g = max(mix(vec3(l), c, 1.5), vec3(0.0));
        float blue = smoothstep(0.015, 0.11, c.b - c.r);
        return g * mix(vec3(1.0), vec3(0.2, 1.3, 1.95), blue);
      }
      vec3 drawEye(vec3 base, vec2 q, vec2 c, vec2 r, vec2 rest) {
        vec2 d = abs(q - c) / r;
        float rho = pow(d.x * d.x * d.x + d.y * d.y * d.y, 1.0 / 3.0);
        if (rho >= 1.0) return base;
        float t = (q.y - c.y) / r.y;
        float shade = mix(0.76, 1.0, smoothstep(0.95, 0.35, t)) * mix(1.0, 0.92, smoothstep(0.62, 1.0, rho));
        vec2 ic = rest + uGaze;
        float rr = length(q - ic) / uIrisR;
        vec3 col = vec3(0.93, 0.92, 0.91);
        col = mix(col, texture2D(uIris, (q - ic) / (2.0 * uIrisR) + 0.5).rgb, 1.0 - smoothstep(0.96, 1.0, rr));
        col *= shade;
        vec2 glint = rest + uGaze * 0.8 + vec2(0.011, 0.015);
        col = mix(col, vec3(1.0), 1.0 - smoothstep(0.0085, 0.0108, length(q - glint)));
        float skin = smoothstep(0.305, 0.485, base.r) * (1.0 - smoothstep(0.305, 0.485, base.b));
        float mask = (1.0 - smoothstep(0.955, 1.0, rho)) * (1.0 - skin);
        gEyeMask = max(gEyeMask, mask);
        return mix(base, col, mask);
      }\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec4 bakedColor = texture2D(map, vMapUv);
        if (vRest.y < uEdge) {             /* below the card edge only the paws remain */
          bool pawZone = (vRest.x > -0.355 && vRest.x < -0.115) || (vRest.x > 0.018 && vRest.x < 0.252);
          if (!pawZone || bakedColor.r < 0.1 || bakedColor.r - bakedColor.b < 0.035) discard;
        }
        vec3 gradedColor = brandGrade(bakedColor.rgb);
        if (vRest.z > 0.12) {
          bakedColor.rgb = drawEye(bakedColor.rgb, vRest.xy, uEyeC[0], uEyeR[0], uEyeRest[0]);
          bakedColor.rgb = drawEye(bakedColor.rgb, vRest.xy, uEyeC[1], uEyeR[1], uEyeRest[1]);
        }
        bakedColor.rgb = mix(gradedColor, bakedColor.rgb, gEyeMask);
        diffuseColor *= bakedColor;`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(mix(normal, nonPerturbedNormal, gEyeMask));');
  };
  body.add(gltf.scene);

  function resize() {
    const host = slot.offsetParent;
    if (!host) return;
    /* the part above the edge fills the card, the paws hang over it */
    const unit = (host.clientHeight + OVER_TOP) / 0.888 * SIZE, above = (FRAME.top - CARD_EDGE) * unit;
    slot.style.top = `${host.clientHeight - above}px`;
    slot.style.bottom = `${-(CARD_EDGE - FRAME.bottom) * unit}px`;
    slot.style.setProperty('--s', `${unit}px`);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    renderer.setSize(cw, ch, false);
    const scale = ch / (FRAME.top - FRAME.bottom);
    body.scale.setScalar(scale);
    body.position.set(-FRAME.centerX * scale, -FRAME.bottom * scale, 0);
    camera.left = -cw / 2; camera.right = cw / 2; camera.top = ch; camera.bottom = 0;
    camera.updateProjectionMatrix();
  }
  const watch = new ResizeObserver(resize);
  [canvas, slot.parentElement, slot.closest('.roadmap')].forEach(el => watch.observe(el));
  resize();

  const aim = { x: 0, y: 0, has: false };
  addEventListener('pointermove', e => { aim.x = e.clientX; aim.y = e.clientY; aim.has = true; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { aim.has = false; });

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  const eye = { x: 0, y: 0 }, head = { yaw: 0, pitch: 0 }, euler = new THREE.Euler(), m4 = new THREE.Matrix4();
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  function tick() {
    requestAnimationFrame(tick);
    if (!visible || document.hidden || !canvas.offsetParent) return;
    const r = canvas.getBoundingClientRect();
    let nx = 0, ny = 0;
    if (aim.has) {
      const dx = aim.x - (r.left + r.width / 2), dy = aim.y - (r.top + r.height * 0.34), depth = 320;
      const len = Math.hypot(dx, dy, depth);
      nx = dx / len; ny = dy / len;
      if (dy < 0) {                             /* little page above the eyes: the top edge counts as a full look up */
        const room = Math.max(r.top + r.height * 0.34, 140);
        const up = Math.pow(Math.min(-dy / room, 1), 0.8);
        ny = -up;
        nx *= 1 - up * 0.25;
      }
    }
    const fast = still.matches ? 1 : 0.2, slow = still.matches ? 1 : 0.05;
    eye.x += (nx - eye.x) * fast;
    eye.y += (ny - eye.y) * fast;
    head.yaw += (THREE.MathUtils.clamp(nx * 0.14, -0.11, 0.11) - head.yaw) * slow;
    head.pitch += (THREE.MathUtils.clamp(ny * (ny < 0 ? 0.1 : 0.07), -0.1, 0.055) - head.pitch) * slow;
    uGaze.value.set(eye.x * LOOK.x, -eye.y * (eye.y < 0 ? LOOK.up : LOOK.y));
    euler.set(head.pitch, head.yaw, 0, 'YXZ');
    uHead.value.setFromMatrix4(m4.makeRotationFromEuler(euler));
    renderer.render(scene, camera);
  }
  tick();
  canvas.classList.add('is-ready');
  slot.classList.add('is-ready');
}
