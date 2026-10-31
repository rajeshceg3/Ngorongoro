import * as THREE from "three";

/* ---------- tiny spring tween ---------- */
const springs = [];
function spring(obj, key, to, { stiffness = 60, damping = 11 } = {}) {
  let s = springs.find((e) => e.obj === obj && e.key === key);
  if (!s) { s = { obj, key, v: 0 }; springs.push(s); }
  s.to = to; s.stiffness = stiffness; s.damping = damping;
}
function stepSprings(dt) {
  for (let i = springs.length - 1; i >= 0; i--) {
    const s = springs[i];
    const x = s.obj[s.key];
    const F = -s.stiffness * (x - s.to) - s.damping * s.v;
    s.v += F * dt;
    s.obj[s.key] = x + s.v * dt;
    if (Math.abs(s.v) < 0.0004 && Math.abs(s.obj[s.key] - s.to) < 0.0004) {
      s.obj[s.key] = s.to; springs.splice(i, 1);
    }
  }
}
const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (c, target, t) => { c.r = lerp(c.r, target.r, t); c.g = lerp(c.g, target.g, t); c.b = lerp(c.b, target.b, t); };
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- renderer ---------- */
const canvas = document.getElementById("crater");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(0, 0, 10);
scene.fog = new THREE.FogExp2(0xf5cfa5, 0.015);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.position.z = camera.aspect < 0.75 ? 13.5 : 10;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

/* ---------- sky ---------- */
const skyMat = new THREE.ShaderMaterial({
  depthWrite: false,
  uniforms: { top: { value: new THREE.Color("#ffe3c2") }, bottom: { value: new THREE.Color("#f5cfa5") } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }",
  fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(0.15, 0.85, vUv.y)), 1.0); }",
});
const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);

/* ---------- helpers ---------- */
function ridgeShape(width, base, amp, freq, phase) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, -30);
  for (let x = -width / 2; x <= width / 2; x += 2) {
    s.lineTo(x, base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.4);
  }
  s.lineTo(width / 2, -30);
  s.closePath();
  return s;
}
function layer(shape, color, z, opacity = 1) {
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
  m.position.z = z;
  scene.add(m);
  return m;
}

/* the bowl: far rim wall, mid slope, crater floor */
const wall = layer(ridgeShape(240, 3.0, 1.0, 0.03, 1.0), "#b08c64", -42);
const slope = layer(ridgeShape(230, -0.8, 1.8, 0.05, 3.0), "#8fa06a", -26);
const ground = layer(ridgeShape(220, -3.8, 1.2, 0.07, 5.0), "#7c9159", -15);

/* Lake Magadi */
const waterMat = new THREE.MeshBasicMaterial({ color: "#e8b8a0", transparent: true, opacity: 0.12 });
const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 14, 1, 1), waterMat);
water.position.set(0, -5.2, -12);
scene.add(water);

/* ripples */
const ripples = [];
function ripple(x, y) {
  const g = new THREE.RingGeometry(0.42, 0.5, 48);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  m.position.set(x, y, -11.9); m.scale.y = 0.3;
  scene.add(m);
  ripples.push({ m, t: 0 });
}

/* fever trees / acacias: thin trunk + flat umbrella canopy */
const treesMat = new THREE.MeshBasicMaterial({ color: "#3f6b40", transparent: true, opacity: 0.25, side: THREE.DoubleSide });
const trees = new THREE.Group();
const treeList = [];
{
  const spots = [[-18, -2.6, 1.1], [-9, -3.1, 0.8], [3, -2.8, 1.3], [12, -3.3, 0.9], [20, -2.7, 1.0]];
  for (const [x, y, sc] of spots) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.4), treesMat);
    trunk.position.y = 1.1;
    g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.CircleGeometry(1.7, 14), treesMat);
    canopy.scale.y = 0.32;
    canopy.position.y = 2.4;
    g.add(canopy);
    g.position.set(x, y, -20);
    g.scale.setScalar(sc);
    trees.add(g);
    treeList.push({ g, phase: Math.random() * 6.28 });
  }
}
scene.add(trees);

/* elephants + rhino silhouettes */
const animalMat = new THREE.MeshBasicMaterial({ color: "#5c4a3a", transparent: true, opacity: 0.18, side: THREE.DoubleSide });
const animals = new THREE.Group();
const animalList = [];
function elephant(x, y, s) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), animalMat);
  body.scale.set(1.25, 0.95, 1);
  g.add(body);
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.62, 14), animalMat);
  head.position.set(1.25, 0.15, 0);
  g.add(head);
  const trunk = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.2), animalMat);
  trunk.position.set(1.72, -0.55, 0);
  trunk.rotation.z = 0.25;
  g.add(trunk);
  const ear = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), animalMat);
  ear.position.set(0.95, 0.35, 0);
  g.add(ear);
  for (const lx of [-0.6, 0.55]) {
    const leg = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.1), animalMat);
    leg.position.set(lx, -1.2, 0);
    g.add(leg);
  }
  g.position.set(x, y, -18);
  g.scale.setScalar(s);
  animals.add(g);
  animalList.push({ g, phase: Math.random() * 6.28 });
}
elephant(-7.5, -2.3, 1.15);
elephant(-2.5, -2.7, 0.85);
{
  const r = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CircleGeometry(1.0, 14), animalMat);
  body.scale.set(1.35, 0.8, 1);
  r.add(body);
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), animalMat);
  head.position.set(1.35, -0.15, 0);
  r.add(head);
  const horn = new THREE.Mesh(new THREE.CircleGeometry(0.3, 3), animalMat);
  horn.position.set(1.75, 0.18, 0);
  horn.rotation.z = -0.4;
  r.add(horn);
  for (const lx of [-0.5, 0.5]) {
    const leg = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.9), animalMat);
    leg.position.set(lx, -1.0, 0);
    r.add(leg);
  }
  r.position.set(7.5, -2.8, -18);
  animals.add(r);
  animalList.push({ g: r, phase: 2.2 });
}
scene.add(animals);

/* flamingos: a drift of pink specks over the lake */
const flamMat = new THREE.MeshBasicMaterial({ color: "#e85f83", transparent: true, opacity: 0, side: THREE.DoubleSide });
const flams = [];
for (let i = 0; i < 42; i++) {
  const f = new THREE.Mesh(new THREE.CircleGeometry(0.075, 8), flamMat);
  f.scale.x = 1.9;
  f.position.set(-26 + Math.random() * 52, -6.9 + Math.random() * 3.4, -11.5);
  scene.add(f);
  flams.push({ m: f, phase: Math.random() * 6.28, amp: 0.05 + Math.random() * 0.1 });
}

/* Maasai figures on the rim */
const maasaiMat = new THREE.MeshBasicMaterial({ color: "#a03c30", transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const maasai = new THREE.Group();
{
  const spots = [[-6.6, 4.05], [-4.9, 4.15], [-3.3, 4.1]];
  for (const [x, y] of spots) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 1.3), maasaiMat);
    g.add(body);
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.17, 10), maasaiMat);
    head.position.y = 0.8;
    g.add(head);
    const spear = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1.9), maasaiMat);
    spear.position.set(0.28, 0.3, 0);
    g.add(spear);
    g.position.set(x, y, -41);
    maasai.add(g);
  }
}
scene.add(maasai);

/* cooking-fire glow on the rim at night */
const fireMat = new THREE.MeshBasicMaterial({ color: "#ffb45e", transparent: true, opacity: 0 });
const fire = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), fireMat);
fire.position.set(-5.6, 3.5, -40.8);
scene.add(fire);

/* stars */
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 300; i++) pts.push((Math.random() - 0.5) * 170, Math.random() * 50 - 4, -50 + Math.random() * 18);
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
}
const starMat = new THREE.PointsMaterial({ color: "#fff7e6", size: 0.16, transparent: true, opacity: 0, sizeAttenuation: true });
scene.add(new THREE.Points(starGeo, starMat));

/* drifting motes */
const moteGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 130; i++) pts.push((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 26, -30 + Math.random() * 24);
  moteGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
}
const moteMat = new THREE.PointsMaterial({ color: "#fff2dc", size: 0.22, transparent: true, opacity: 0.3, sizeAttenuation: true });
const motes = new THREE.Points(moteGeo, moteMat);
scene.add(motes);

/* ---------- chapters ---------- */
const CHAPTERS = [
  { skyTop: "#ffe3c2", skyBot: "#f5cfa5", fog: ["#f5cfa5", 0.015], wall: "#b08c64", slope: "#8fa06a", ground: "#7c9159",
    water: 0.12, waterC: "#e8b8a0", trees: 0.25, treesC: "#3f6b40", animals: 0.18, flams: 0, maasai: 0.85, fire: 0,
    stars: 0, motes: ["#fff2dc", 0.3], night: false,
    caption: "A whole Eden, held in one crater.", whisper: "Six hundred metres down, the world begins again." },
  { skyTop: "#eaf4ec", skyBot: "#d4ead2", fog: ["#d4ead2", 0.014], wall: "#9ab27e", slope: "#86ad66", ground: "#74a057",
    water: 0, waterC: "#d4ead2", trees: 1, treesC: "#3c6b40", animals: 1, flams: 0, maasai: 0, fire: 0,
    stars: 0, motes: ["#f4ffef", 0.35], night: false,
    caption: "Twenty-five thousand animals share one bowl.", whisper: "Lions, rhinos, elephants - all neighbours." },
  { skyTop: "#fdeef0", skyBot: "#f9dbe0", fog: ["#f9dbe0", 0.012], wall: "#cbb7a0", slope: "#a8b08e", ground: "#98a578",
    water: 0.95, waterC: "#f2a7b8", trees: 0.3, treesC: "#5f7a52", animals: 0, flams: 1, maasai: 0, fire: 0,
    stars: 0, motes: ["#ffffff", 0.22], night: false,
    caption: "A lake blushing with flamingos.", whisper: "The water answers every touch." },
  { skyTop: "#0d1226", skyBot: "#233052", fog: ["#1b2340", 0.028], wall: "#232c4e", slope: "#1d2542", ground: "#161c33",
    water: 0.18, waterC: "#3a3050", trees: 0.45, treesC: "#141a30", animals: 0, flams: 0, maasai: 0.9, fire: 1,
    stars: 1, motes: ["#d8d2c0", 0.4], night: true,
    caption: "The Maasai still walk the rim.", whisper: "Herds first, as it has always been." },
];
let chapter = 0;
const target = {
  skyTop: new THREE.Color(CHAPTERS[0].skyTop), skyBot: new THREE.Color(CHAPTERS[0].skyBot),
  fog: new THREE.Color(CHAPTERS[0].fog[0]), wall: new THREE.Color(CHAPTERS[0].wall),
  slope: new THREE.Color(CHAPTERS[0].slope), ground: new THREE.Color(CHAPTERS[0].ground),
  waterC: new THREE.Color(CHAPTERS[0].waterC), treesC: new THREE.Color(CHAPTERS[0].treesC),
  motes: new THREE.Color(CHAPTERS[0].motes[0]),
  fogN: CHAPTERS[0].fog[1], water: 0.12, trees: 0.25, animals: 0.18, flams: 0,
  maasai: 0.85, fire: 0, stars: 0, motesO: 0.3,
};

/* ---------- chrome ---------- */
const veil = document.getElementById("veil");
const caption = document.getElementById("caption");
const whisper = document.getElementById("whisper");
const chrome = [...document.querySelectorAll(".chrome")];
const dots = [...document.querySelectorAll(".dot")];
let idleTimer, whisperTimer, lakeCueTimer;
function wakeChrome() {
  chrome.forEach((c) => c.classList.remove("idle"));
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => chrome.forEach((c) => c.classList.add("idle")), 4200);
}
function setChapter(i) {
  if (i === chapter) return;
  chapter = i;
  const c = CHAPTERS[i];
  target.skyTop.set(c.skyTop); target.skyBot.set(c.skyBot); target.fog.set(c.fog[0]);
  target.wall.set(c.wall); target.slope.set(c.slope); target.ground.set(c.ground);
  target.waterC.set(c.waterC); target.treesC.set(c.treesC); target.motes.set(c.motes[0]);
  target.fogN = c.fog[1]; target.water = c.water; target.trees = c.trees;
  target.animals = c.animals; target.flams = c.flams; target.maasai = c.maasai;
  target.fire = c.fire; target.stars = c.stars; target.motesO = c.motes[1];
  document.body.classList.toggle("night", c.night);
  dots.forEach((d, j) => d.classList.toggle("active", j === i));
  caption.classList.remove("show"); whisper.classList.remove("show");
  clearTimeout(whisperTimer);
  clearInterval(lakeCueTimer);
  if (i === 2 && !reduceMotion) {
    setTimeout(() => ripple(-4 + Math.random() * 8, -6.1 + Math.random() * 1.4), 2400);
    lakeCueTimer = setInterval(() => ripple(-8 + Math.random() * 16, -6.3 + Math.random() * 1.8), 5200);
  }
  setTimeout(() => { caption.textContent = c.caption; caption.classList.add("show"); }, 1100);
  whisperTimer = setTimeout(() => { whisper.textContent = c.whisper; whisper.classList.add("show"); }, 3200);
  wakeChrome();
}
dots.forEach((d, i) => d.addEventListener("click", () => setChapter(i)));

/* ---------- pointer ---------- */
let px = 0, py = 0, dragging = false, moved = 0, downX = 0, downY = 0;
addEventListener("pointerdown", (e) => { dragging = true; moved = 0; downX = e.clientX; downY = e.clientY; wakeChrome(); });
addEventListener("pointermove", (e) => {
  if (dragging) { moved += Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY); }
  px = (e.clientX / innerWidth) * 2 - 1;
  py = (e.clientY / innerHeight) * 2 - 1;
});
addEventListener("pointerup", (e) => {
  dragging = false;
  if (moved < 12 && chapter === 2 && e.clientY > innerHeight * 0.4 && e.clientY < innerHeight * 0.86) {
    const v = new THREE.Vector3((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1), 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    const t = (-12 - camera.position.z) / dir.z;
    const hit = camera.position.clone().add(dir.multiplyScalar(t));
    ripple(hit.x, hit.y);
  }
});

/* ---------- loop ---------- */
const clock = new THREE.Clock();
let camX = 0, camY = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  camX = reduceMotion ? 0 : lerp(camX, px * 1.1, 1 - Math.exp(-3.2 * dt));
  camY = reduceMotion ? 0 : lerp(camY, -py * 0.5, 1 - Math.exp(-3.2 * dt));
  camera.position.x = camX; camera.position.y = camY + 0.4;
  camera.lookAt(camX * 0.4, camY * 0.3 + 0.6, -20);

  const k = 1 - Math.exp(-1.6 * dt);
  lerpColor(skyMat.uniforms.top.value, target.skyTop, k);
  lerpColor(skyMat.uniforms.bottom.value, target.skyBot, k);
  lerpColor(scene.fog.color, target.fog, k);
  scene.fog.density = lerp(scene.fog.density, target.fogN, k);
  lerpColor(wall.material.color, target.wall, k);
  lerpColor(slope.material.color, target.slope, k);
  lerpColor(ground.material.color, target.ground, k);
  lerpColor(waterMat.color, target.waterC, k);
  lerpColor(treesMat.color, target.treesC, k);
  lerpColor(moteMat.color, target.motes, k);
  waterMat.opacity = lerp(waterMat.opacity, target.water, k);
  treesMat.opacity = lerp(treesMat.opacity, target.trees, k);
  animalMat.opacity = lerp(animalMat.opacity, target.animals, k);
  flamMat.opacity = lerp(flamMat.opacity, target.flams, k);
  maasaiMat.opacity = lerp(maasaiMat.opacity, target.maasai, k);
  starMat.opacity = lerp(starMat.opacity, target.stars, k);
  moteMat.opacity = lerp(moteMat.opacity, target.motesO, k);
  fireMat.opacity = lerp(fireMat.opacity, target.fire * (reduceMotion ? 0.75 : 0.6 + Math.sin(t * 5.2) * 0.25 + Math.sin(t * 9.7) * 0.15), k);

  if (!reduceMotion) {
    for (const tr of treeList) tr.g.rotation.z = Math.sin(t * 0.6 + tr.phase) * 0.015;
    for (const a of animalList) a.g.rotation.z = Math.sin(t * 0.5 + a.phase) * 0.01;
    for (const f of flams) f.m.position.y += Math.sin(t * 1.3 + f.phase) * f.amp * dt * 3;
  }

  if (!reduceMotion) {
    const pos = moteGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + dt * (0.35 + (i % 5) * 0.08);
      if (x > 46) x = -46;
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  }

  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.t += dt;
    const s = 1 + r.t * 7;
    r.m.scale.set(s, s * 0.3, 1);
    r.m.material.opacity = Math.max(0, 0.85 - r.t * 0.75);
    if (r.t > 1.2) { scene.remove(r.m); r.m.geometry.dispose(); ripples.splice(i, 1); }
  }

  stepSprings(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

/* ---------- veil ---------- */
setTimeout(() => {
  veil.classList.add("gone");
  dots[0].classList.add("active");
  caption.textContent = CHAPTERS[0].caption;
  setTimeout(() => caption.classList.add("show"), 900);
  whisper.textContent = CHAPTERS[0].whisper;
  whisperTimer = setTimeout(() => whisper.classList.add("show"), 3000);
  wakeChrome();
}, 2100);
