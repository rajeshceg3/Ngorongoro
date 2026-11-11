import * as THREE from "three";
import { createSoundscape } from './soundscape/soundscape-engine.js';
import soundProgram from './soundscape/soundscape-program.js';

/* Ngorongoro, rebuilt as a real 3D bowl: drag to look around 360, chapters
   move the viewpoint (rim dawn, animal floor, flamingo lake, Maasai night). */

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (c, t, k) => { c.r = lerp(c.r, t.r, k); c.g = lerp(c.g, t.g, k); c.b = lerp(c.b, t.b, k); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* cheap deterministic value noise */
function vnoise(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function coherentNoise(x,z) {
  const ix=Math.floor(x), iz=Math.floor(z);
  const fx=x-ix, fz=z-iz, u=fx*fx*(3-2*fx), v=fz*fz*(3-2*fz);
  return lerp(lerp(vnoise(ix,iz),vnoise(ix+1,iz),u),lerp(vnoise(ix,iz+1),vnoise(ix+1,iz+1),u),v);
}
function fbm(x,z) { return coherentNoise(x,z)*.6+coherentNoise(x*2.7,z*2.7)*.3+coherentNoise(x*6.1,z*6.1)*.1; }

/* ---------- renderer ---------- */
const canvas = document.getElementById("crater");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
scene.fog = new THREE.FogExp2(0xf5cfa5, 0.0045);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

/* ---------- lights ---------- */
const hemi = new THREE.HemisphereLight(0xffe0bb, 0x8a7a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
sun.position.set(60, 18, -30);
scene.add(sun);
const rimLight = new THREE.DirectionalLight(0xfff2dd, 0.55);
rimLight.position.set(-40, 25, 40);
scene.add(rimLight);
const fireLight = new THREE.PointLight(0xff9a3c, 0, 26, 1.8);
fireLight.position.set(31, 2.4, 32.4);
scene.add(fireLight);

/* ---------- sky dome + sun/moon ---------- */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color("#7fb2dd") }, mid: { value: new THREE.Color("#ffe3c2") }, bot: { value: new THREE.Color("#f5cfa5") } },
  vertexShader: "varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h=normalize(vP).y; vec3 c=h>0.12? mix(mid,top,smoothstep(0.12,0.65,h)) : mix(bot,mid,smoothstep(-0.08,0.12,h)); gl_FragColor=vec4(c,1.0); }",
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(320, 32, 18), skyMat));
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 32),
  new THREE.MeshBasicMaterial({ color: "#fff2cf", transparent: true, opacity: 0.95, fog: false }));
sunDisc.position.set(180, 26, -95); sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);
const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(5, 32),
  new THREE.MeshBasicMaterial({ color: "#e8ecf4", transparent: true, opacity: 0, fog: false }));
moonDisc.position.set(-150, 90, 160); moonDisc.lookAt(0, 0, 0);
scene.add(moonDisc);

/* stars */
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * 1.1 + 0.08, r = 290;
    pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
}
const starMat = new THREE.PointsMaterial({ color: "#fff7e6", size: 1.1, transparent: true, opacity: 0, fog: false });
scene.add(new THREE.Points(starGeo, starMat));

/* ---------- the crater bowl ---------- */
const RIM_R = 46, FLOOR_R = 34;
function groundH(x, z) {
  const r = Math.hypot(x, z);
  const rim = smooth(FLOOR_R, RIM_R + 16, r);
  const ridge = fbm(x * 0.08, z * 0.08) * 4.2 * smooth(FLOOR_R - 4, RIM_R, r);
  const lakeBasin = smooth(17, 22, r); /* flat bed under Lake Magadi */
  const floorN = (fbm(x * 0.22 + 9, z * 0.22) - 0.5) * 0.55 * (1 - smooth(FLOOR_R - 8, FLOOR_R, r)) * lakeBasin;
  const h = rim * 15 + ridge + floorN;
  return lerp(h,7.8,1-smooth(3,6,Math.hypot(x-31,z-32.4)));
}
const terrain = (() => {
  const R = 150, N = 210;
  const g = new THREE.PlaneGeometry(R * 2, R * 2, N, N);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color("#8ba465"), cDry = new THREE.Color("#b3a06b"),
        cSand = new THREE.Color("#cbb891"), cRock = new THREE.Color("#8d7962");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    pos.setY(i, groundH(x, z));
    const n = fbm(x * 0.12 + 4, z * 0.12);
    let c = cGrass.clone().lerp(cDry, smooth(0.35, 0.75, n));
    c.lerp(cSand, smooth(14, 7, Math.abs(r - 13)));   /* pale ring where the lake sits */
    c.lerp(cRock, smooth(FLOOR_R + 6, RIM_R + 14, r) * 0.8);  /* rocky rim walls */
    const shade = 0.9 + fbm(x * 0.35, z * 0.35) * 0.2;
    colors[i * 3] = c.r * shade; colors[i * 3 + 1] = c.g * shade; colors[i * 3 + 2] = c.b * shade;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: false, roughness: 1, metalness: 0,
  }));
  scene.add(m);
  return m;
})();

/* Lake Magadi: shallow soda disc, pink when the flamingos are home */
const lakeMat = new THREE.MeshStandardMaterial({ color: "#9fc4c2", roughness: 0.3, metalness: 0.05, flatShading: true });
const lakeGeometry = new THREE.CircleGeometry(11,96);
for(let i=1;i<lakeGeometry.attributes.position.count;i++) {
  const x=lakeGeometry.attributes.position.getX(i),y=lakeGeometry.attributes.position.getY(i);
  const a=Math.atan2(y,x),scale=1+.075*Math.sin(a*3+.5)+.04*Math.sin(a*7);
  lakeGeometry.attributes.position.setXY(i,x*scale,y*scale);
}
const lakeTime = {value:0};
lakeMat.onBeforeCompile = shader => {
  shader.uniforms.lakeTime=lakeTime;
  shader.vertexShader='varying vec3 lakePoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n lakePoint=position;');
  shader.fragmentShader='uniform float lakeTime; varying vec3 lakePoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float w=sin(lakePoint.x*4.0+sin(lakePoint.y*1.2+lakeTime*.3)*.8)+sin(lakePoint.y*7.0-lakeTime*.5);
    diffuseColor.rgb *= .94 + .06*sin(lakePoint.y*2.0+lakePoint.x*.2);
    diffuseColor.rgb += vec3(.10,.11,.10)*smoothstep(1.78,1.98,w);
  `);
};
const lake = new THREE.Mesh(lakeGeometry, lakeMat);
lake.rotation.x = -Math.PI / 2;
lake.position.set(0, 0.12, 0);
lake.scale.set(1.25, 1, 0.8);
scene.add(lake);

/* fever trees: pale trunk, flat umbrella canopy */
const trees = new THREE.Group();
const trunkMat = new THREE.MeshStandardMaterial({ color: "#d8c690", flatShading: true, roughness: 1 });
const canopyMat = new THREE.MeshStandardMaterial({ color: "#5c7a3f", flatShading: true, roughness: 1 });
function acacia(x, z, s) {
  const g = new THREE.Group();
  const y = groundH(x, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.16 * s, 2.6 * s, 5), trunkMat);
  trunk.position.y = 1.3 * s;
  trunk.rotation.z = (vnoise(x, z) - 0.5) * 0.16;
  g.add(trunk);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.9 * s, 7, 4), canopyMat);
  canopy.scale.y = 0.28;
  canopy.position.y = 2.7 * s;
  g.add(canopy);
  const canopy2 = new THREE.Mesh(new THREE.SphereGeometry(1.2 * s, 6, 4), canopyMat);
  canopy2.scale.y = 0.3; canopy2.position.set(0.9 * s, 2.2 * s, 0.4 * s);
  g.add(canopy2);
  g.position.set(x, y, z);
  g.rotation.y = vnoise(z, x) * 6.28;
  trees.add(g);
  return g;
}
{
  const spots = [[-20, -14, 1.2], [-26, 4, 1.0], [-14, 18, 1.35], [8, 22, 1.1], [22, 12, 0.95],
                 [26, -10, 1.25], [12, -22, 1.05], [-8, -26, 1.15], [30, 2, 0.9], [-30, -8, 1.0],
                 [4, -18, 0.8], [18, -2, 0.85], [-4, 26, 1.0], [-18, 8, 0.75]];
  for (const [x, z, s] of spots) acacia(x, z, s);
}
scene.add(trees);

/* ---------- animals: low-poly, recognizable, alive ---------- */
const animalRoot = new THREE.Group();
scene.add(animalRoot);
const hidelist = []; // {obj, key} faded per chapter
const hide = (obj, key) => { if(!hidelist.some(h=>h.obj===obj)) hidelist.push({obj,key}); obj.depthWrite=false; };

const eleMat = new THREE.MeshStandardMaterial({ color: "#9a8874", flatShading: false, roughness: 1, transparent: true });
const eleDark = new THREE.MeshStandardMaterial({ color: "#7a6a58", flatShading: false, roughness: 1, transparent: true });
const tuskMat = new THREE.MeshStandardMaterial({ color: "#e8ddc4", flatShading: true, roughness: 0.7, transparent: true });
const elephants = [];
function elephant(x, z, s, yaw) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), eleMat);
  body.scale.set(1.45, 0.85, 0.78); body.position.y = 1.9; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 16), eleMat);
  head.position.set(1.9, 2.15, 0); g.add(head);
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 16), eleDark);
    ear.scale.set(0.20, 1.08, 0.80); ear.position.set(1.55, 2.3, side * 0.78);
    ear.rotation.y = side * 0.8; g.add(ear); ears.push(ear);
  }
  const eyeMat = new THREE.MeshStandardMaterial({color:0x171916,roughness:.4,transparent:true});
  for(const side of [-1,1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.055,10,8),eyeMat);
    eye.position.set(2.32,2.38,side*.61); g.add(eye);
  }
  hide(eyeMat,"animals");
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.45,2.05,0), new THREE.Vector3(2.70,1.30,0),
    new THREE.Vector3(2.70,.52,0),new THREE.Vector3(2.95,.28,0),new THREE.Vector3(3.15,.52,0)
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve,24,.15,10,false),eleMat);
  g.add(trunk);
  for (const side of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7, 5), tuskMat);
    tusk.position.set(2.35, 1.45, side * 0.3); tusk.rotation.z = -1.9;
    g.add(tusk);
  }
  for (const [lx, lz] of [[-0.9, 0.55], [-0.9, -0.55], [0.9, 0.55], [0.9, -0.55]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.5, 12), eleDark);
    leg.position.set(lx, 0.75, lz); g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 1.0, 4), eleDark);
  tail.position.set(-2.0, 1.7, 0); tail.rotation.z = 0.5; g.add(tail);
  g.position.set(x, groundH(x, z), z);
  g.rotation.y = yaw; g.scale.setScalar(s);
  animalRoot.add(g);
  elephants.push({ g, ears, trunk, tail, phase: vnoise(x, z) * 6.28, baseY: g.position.y });
  hide(eleMat, "animals"); hide(eleDark, "animals"); hide(tuskMat, "animals");
  return g;
}
elephant(-9.5, -9.5, 0.95, 0.25);
elephant(-18, -4, 0.7, -0.2);
elephant(-6, -13, 0.45, 0.3);

const rhinoMat = new THREE.MeshStandardMaterial({ color: "#a39a8b", flatShading: true, roughness: 1, transparent: true });
const rhinos = [];
{
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), rhinoMat);
  body.scale.set(1.45, 0.9, 0.85); body.position.y = 1.35; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.6), rhinoMat);
  head.position.set(1.75, 1.15, 0); g.add(head);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 5), tuskMat);
  horn.position.set(2.2, 1.5, 0); horn.rotation.z = -0.5; g.add(horn);
  for (const [lx, lz] of [[-0.75, 0.45], [-0.75, -0.45], [0.75, 0.45], [0.75, -0.45]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 1.0, 5), rhinoMat);
    leg.position.set(lx, 0.5, lz); g.add(leg);
  }
  g.position.set(9, groundH(9, 6), 6); g.rotation.y = -2.1;
  animalRoot.add(g); rhinos.push({ g, phase: 1.7 });
  hide(rhinoMat, "animals");
}

/* wildebeest herds: small dark grazers with horns, spread over the floor */
const herdMat = new THREE.MeshStandardMaterial({ color: "#655648", flatShading: true, roughness: 1, transparent: true });
const herdMat2 = new THREE.MeshStandardMaterial({ color: "#7a6a55", flatShading: true, roughness: 1, transparent: true });
const herds = [];
for (let i = 0; i < 26; i++) {
  const a = vnoise(i, 3) * 6.28, r = 16 + vnoise(i, 7) * 16;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const hm = i % 2 ? herdMat2 : herdMat;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.34), hm);
  body.position.y = 0.62; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.24), hm);
  head.position.set(0.48, 0.72, 0); g.add(head);
  for (const [lx, lz] of [[-0.25, 0.1], [-0.25, -0.1], [0.25, 0.1], [0.25, -0.1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 4), hm);
    leg.position.set(lx, 0.25, lz); g.add(leg);
  }
  g.position.set(x, groundH(x, z), z);
  g.rotation.y = vnoise(i, 11) * 6.28;
  animalRoot.add(g);
  herds.push({ g, phase: vnoise(i, 17) * 6.28, baseY: g.position.y });
}
hide(herdMat, "herds"); hide(herdMat2, "herds");

/* flamingos at the soda lake */
const flamMat = new THREE.MeshStandardMaterial({ color: "#e87f9a", flatShading: true, roughness: 1, transparent: true });
const flams = [];
for (let i = 0; i < 14; i++) {
  const a = vnoise(i, 23) * 6.28, r = 4 + vnoise(i, 29) * 8;
  const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.75;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), flamMat);
  body.scale.set(1.4, 1, 1); body.position.y = 0.72; g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 4), flamMat);
  neck.position.set(0.3, 1.05, 0); neck.rotation.z = -0.35; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), flamMat);
  head.position.set(0.42, 1.32, 0); g.add(head);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 3), flamMat);
    leg.position.set(0, 0.3, side * 0.05); g.add(leg);
  }
  g.position.set(x, 0.1, z);
  g.rotation.y = vnoise(i, 31) * 6.28;
  scene.add(g);
  flams.push({ g, neck, head, phase: vnoise(i, 37) * 6.28 });
}
hide(flamMat, "flams");

/* Maasai on the rim + their fire */
const maasaiMat = new THREE.MeshStandardMaterial({ color: "#b03428", flatShading: true, roughness: 1, transparent: true });
const skinMat = new THREE.MeshStandardMaterial({ color: "#3d2c22", flatShading: true, roughness: 1, transparent: true });
const maasai = new THREE.Group();
{
  const spots = [[30.5, 31.5, 2.4], [32.2, 33.2, 2.9], [29, 33.5, 1.9]];
  for (const [x, z, yaw] of spots) {
    const g = new THREE.Group();
    const shuka = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.35, 6), maasaiMat);
    shuka.position.y = 0.95; g.add(shuka);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), skinMat);
    head.position.y = 1.85; g.add(head);
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 4), skinMat);
    spear.position.set(0.3, 1.25, 0); g.add(spear);
    g.position.set(x, groundH(x, z), z); g.rotation.y = yaw;
    maasai.add(g);
  }
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: "#ff9a3c", emissive: "#ff7a1c", emissiveIntensity: 1.6, flatShading: true, transparent: true }));
  fire.position.set(31, groundH(31, 32.4) + 0.45, 32.4);
  maasai.add(fire);
  maasai.userData.fire = fire;
  const glowCanvas=document.createElement('canvas'); glowCanvas.width=glowCanvas.height=128;
  const gc=glowCanvas.getContext('2d'), grad=gc.createRadialGradient(64,64,0,64,64,64);
  grad.addColorStop(0,'rgba(255,165,55,.7)');grad.addColorStop(.3,'rgba(255,115,30,.25)');grad.addColorStop(1,'rgba(255,90,20,0)');gc.fillStyle=grad;gc.fillRect(0,0,128,128);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),color:0xffbc69,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.position.copy(fire.position);glow.position.y+=.3;glow.scale.set(3.2,3.2,1);maasai.add(glow); hide(glow.material,'fire');

}
scene.add(maasai);
fireLight.position.set(31, groundH(31, 32.4) + 2.4, 32.4);
hide(maasaiMat, "maasai"); hide(skinMat, "maasai");

/* birds: slow circling v-pairs */
const birdMat = new THREE.MeshBasicMaterial({ color: "#3a332a", transparent: true, opacity: 0.75, side: THREE.DoubleSide });
const birds = [];
for (let i = 0; i < 5; i++) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.16), birdMat);
    w.position.x = side * 0.26; w.rotation.z = side * 0.35;
    g.add(w);
  }
  scene.add(g);
  birds.push({ g, r: 20 + i * 6, h: 14 + i * 2.5, speed: 0.05 + i * 0.012, phase: i * 1.9 });
}
hide(birdMat, "birds");

/* ---------- chapters ---------- */
const CHAPTERS = [
  { skyTop: "#7fb2dd", skyMid: "#ffe3c2", skyBot: "#f5cfa5", fog: ["#f2cf9f", 0.005],
    hemiSky: "#ffe0bb", hemiGnd: "#8a7a5a", hemiI: 0.9, sunC: "#ffd9a0", sunI: 1.6, sunPos: [60, 18, -30],
    sunDisc: ["#fff2cf", 0.95], moon: 0, stars: 0,
    water: "#9fc4c2", animals: 1, herds: 1, flams: 0, maasai: 0, fire: 0, birds: 0.75,
    view: { pos: [-58, 45, -36], yaw: -2.14, pitch: -0.57 },
    night: false,
    caption: "A whole Eden, held in one crater.", whisper: "Six hundred metres down, the world begins again." },
  { skyTop: "#8fc3e8", skyMid: "#eaf4ec", skyBot: "#d4ead2", fog: ["#cfe4c4", 0.0046],
    hemiSky: "#eaf4ec", hemiGnd: "#7d9463", hemiI: 1.0, sunC: "#fff3da", sunI: 1.75, sunPos: [30, 70, 20],
    sunDisc: ["#fff8e2", 0.85], moon: 0, stars: 0,
    water: "#9fc4c2", animals: 1, herds: 1, flams: 0, maasai: 0, fire: 0, birds: 0.75,
    view: { pos: [3, 3.8, 18], yaw: 0.43, pitch: -0.045 },
    night: false,
    caption: "Twenty-five thousand animals share one bowl.", whisper: "Hooves, dust, grass - the bowl feeds them all." },
  { skyTop: "#a9c8e0", skyMid: "#fdeef0", skyBot: "#f9dbe0", fog: ["#f2d4d8", 0.0044],
    hemiSky: "#fdeef0", hemiGnd: "#9a8f7a", hemiI: 0.95, sunC: "#ffe8e0", sunI: 1.4, sunPos: [-40, 40, 40],
    sunDisc: ["#ffeef0", 0.8], moon: 0, stars: 0,
    water: "#e5a7b4", animals: 0, herds: 0, flams: 1, maasai: 0, fire: 0, birds: 0.5,
    view: { pos: [16, 2.2, 2], yaw: 1.5, pitch: -0.08 },
    night: false,
    caption: "A lake blushing with flamingos.", whisper: "They feed with their heads upside down." },
  { skyTop: "#060a1c", skyMid: "#101736", skyBot: "#233052", fog: ["#141b36", 0.006],
    hemiSky: "#2a3455", hemiGnd: "#0c1020", hemiI: 0.55, sunC: "#93a7d8", sunI: 0.35, sunPos: [-50, 60, 40],
    sunDisc: ["#fff2cf", 0], moon: 0.9, stars: 1,
    water: "#2c3350", animals: 0, herds: 0, flams: 0, maasai: 1, fire: 1, birds: 0,
    view: { pos: [24, 13, 44], yaw: -0.53, pitch: -0.24 },
    night: true,
    caption: "The Maasai still walk the rim.", whisper: "Herds first, as it has always been." },
];

const cur = {
  skyTop: new THREE.Color(CHAPTERS[0].skyTop), skyMid: new THREE.Color(CHAPTERS[0].skyMid),
  skyBot: new THREE.Color(CHAPTERS[0].skyBot), fog: new THREE.Color(CHAPTERS[0].fog[0]),
  hemiSky: new THREE.Color(CHAPTERS[0].hemiSky), hemiGnd: new THREE.Color(CHAPTERS[0].hemiGnd),
  sunC: new THREE.Color(CHAPTERS[0].sunC), sunDisc: new THREE.Color(CHAPTERS[0].sunDisc[0]),
  water: new THREE.Color(CHAPTERS[0].water),
  fogN: CHAPTERS[0].fog[1], hemiI: CHAPTERS[0].hemiI, sunI: CHAPTERS[0].sunI,
  sunDiscO: CHAPTERS[0].sunDisc[1], moon: 0, stars: 0,
  animals: 1, herds: 1, flams: 0, maasai: 0, fire: 0, birds: 0.75,
  pos: new THREE.Vector3(...CHAPTERS[0].view.pos),
  sunPos: new THREE.Vector3(...CHAPTERS[0].sunPos),
};
const want = JSON.parse(JSON.stringify({ ...CHAPTERS[0], view: CHAPTERS[0].view }));
want.pos = new THREE.Vector3(...CHAPTERS[0].view.pos);
want.sunPos = new THREE.Vector3(...CHAPTERS[0].sunPos);
for (const k of ["skyTop", "skyMid", "skyBot", "fogC", "hemiSky", "hemiGnd", "sunC", "sunDiscC", "water"]) delete want[k];
want.skyTop = new THREE.Color(CHAPTERS[0].skyTop); want.skyMid = new THREE.Color(CHAPTERS[0].skyMid);
want.skyBot = new THREE.Color(CHAPTERS[0].skyBot); want.fogC = new THREE.Color(CHAPTERS[0].fog[0]);
want.hemiSky = new THREE.Color(CHAPTERS[0].hemiSky); want.hemiGnd = new THREE.Color(CHAPTERS[0].hemiGnd);
want.sunC = new THREE.Color(CHAPTERS[0].sunC); want.sunDiscC = new THREE.Color(CHAPTERS[0].sunDisc[0]);
want.water = new THREE.Color(CHAPTERS[0].water);
want.fogN = CHAPTERS[0].fog[1];
want.sunDiscO = CHAPTERS[0].sunDisc[1];
for (const {obj,key} of hidelist) obj.opacity=want[key];

/* ---------- camera rig: drag to look around, unbounded azimuth ---------- */
const rig = {
  yaw: CHAPTERS[0].view.yaw, pitch: CHAPTERS[0].view.pitch,
  yawV: 0, pitchV: 0,
  entryYaw: CHAPTERS[0].view.yaw, entryPitch: CHAPTERS[0].view.pitch,
  pos: new THREE.Vector3(...CHAPTERS[0].view.pos),
};
let dragging = false, downX = 0, downY = 0, lastX = 0, lastY = 0, moved = 0, dockPointer = null;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true; moved = 0; downX = lastX = e.clientX; downY = lastY = e.clientY;
  rig.yawV = 0; rig.pitchV = 0;
  canvas.setPointerCapture(e.pointerId);
  wakeChrome();
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  rig.yaw -= dx * 0.0042;
  rig.pitch = Math.min(0.35, Math.max(-0.8, rig.pitch - dy * 0.0026));
  rig.yawV = -dx * 0.0042 / 1.0;
  rig.pitchV = -dy * 0.0026;
  maybeShowReset();
});
function endDrag() {
  dragging = false;
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

const resetOrb = document.getElementById("reset-orb");
function angDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function maybeShowReset() {
  const off = Math.abs(angDiff(rig.yaw, rig.entryYaw)) > 0.22 || Math.abs(rig.pitch - rig.entryPitch) > 0.1;
  resetOrb.hidden = !off;
}
let resetting = false;
resetOrb.addEventListener("click", () => { resetting = true; rig.yawV = 0; rig.pitchV = 0; wakeChrome(); });

/* ---------- chapter switching ---------- */
let chapter = 0;
const veil = document.getElementById("veil");
const caption = document.getElementById("caption");
const whisper = document.getElementById("whisper");
const chrome = [...document.querySelectorAll(".chrome")];
const dots = [...document.querySelectorAll(".dot")];
let idleTimer, whisperTimer;
function wakeChrome() {
  chrome.forEach((c) => c.classList.remove("idle"));
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => chrome.forEach((c) => c.classList.add("idle")), 4200);
}
function setChapter(i) {
  if (i === chapter) return;
  chapter = i;
  const c = CHAPTERS[i];
  want.skyTop.set(c.skyTop); want.skyMid.set(c.skyMid); want.skyBot.set(c.skyBot);
  want.fogC.set(c.fog[0]); want.hemiSky.set(c.hemiSky); want.hemiGnd.set(c.hemiGnd);
  want.sunC.set(c.sunC); want.sunDiscC.set(c.sunDisc[0]); want.water.set(c.water);
  want.fogN = c.fog[1]; want.hemiI = c.hemiI; want.sunI = c.sunI;
  want.sunDiscO = c.sunDisc[1]; want.moon = c.moon; want.stars = c.stars;
  want.animals = c.animals; want.herds = c.herds; want.flams = c.flams;
  want.maasai = c.maasai; want.fire = c.fire; want.birds = c.birds;
  want.pos.set(...c.view.pos); want.sunPos.set(...c.sunPos);
  /* the chapter defines its own entry view; the viewer's azimuth is preserved
     per the world rules - Reset returns to the entry view */
  rig.entryYaw = c.view.yaw; rig.entryPitch = c.view.pitch;
  soundscape.setScene(AUDIO_SCENES[i]);
  /* each chapter defines its own entry view: glide to it (world rules ch.4) */
  resetting = true;
  document.body.classList.toggle("night", c.night);
  dots.forEach((d, j) => {
    d.classList.toggle("active", j === i);
    if (j === i) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
  });
  caption.classList.remove("show"); whisper.classList.remove("show");
  clearTimeout(whisperTimer);
  setTimeout(() => { caption.textContent = c.caption; caption.classList.add("show"); }, 1100);
  whisperTimer = setTimeout(() => { whisper.textContent = c.whisper; whisper.classList.add("show"); }, 3200);
  resetOrb.hidden = true;
  wakeChrome();
}
dots.forEach((d, i) => d.addEventListener("click", () => setChapter(i)));

/* ---------- dock gestures: swipe to change face, arrows to step ---------- */
const dock = document.getElementById("dock");
dock.addEventListener("focusin", wakeChrome);
let dockDownX = 0, dockDownY = 0, dockSwiping = false, dockPointerId = null, suppressDockClick = false;
dock.addEventListener("pointerdown", (e) => {
  dockDownX = e.clientX; dockDownY = e.clientY; dockSwiping = false; dockPointerId = e.pointerId;
  dockPointer = e.pointerId;
});
dock.addEventListener("pointermove", (e) => {
  if (dockPointerId !== e.pointerId) return;
  const dx = e.clientX - dockDownX, dy = e.clientY - dockDownY;
  if (!dockSwiping && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    dockSwiping = true;
    try { dock.setPointerCapture(e.pointerId); } catch (_) {}
  }
});
dock.addEventListener("pointerup", (e) => {
  if (dockPointerId !== e.pointerId) return;
  const dx = e.clientX - dockDownX;
  dockPointerId = null; dockPointer = null;
  if (dockSwiping) {
    suppressDockClick = true;
    if (dx <= -48) setChapter((chapter + 1) % CHAPTERS.length);
    else if (dx >= 48) setChapter((chapter + CHAPTERS.length - 1) % CHAPTERS.length);
  }
  dockSwiping = false;
});
dock.addEventListener("pointercancel", () => { dockPointerId = null; dockSwiping = false; dockPointer = null; });
addEventListener("pointercancel", (e) => { if (dockPointer === e.pointerId) dockPointer = null; });
dock.addEventListener("click", (e) => {
  if (suppressDockClick) { e.preventDefault(); e.stopPropagation(); suppressDockClick = false; }
}, true);
dock.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") {
    e.preventDefault();
    setChapter((chapter + 1) % CHAPTERS.length);
    dots[chapter] && dots[chapter].focus();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    setChapter((chapter + CHAPTERS.length - 1) % CHAPTERS.length);
    dots[chapter] && dots[chapter].focus();
  }
});

/* ---------- opt-in crater sound, off by default ----------
   The soundscape is synthesized from what the crater holds - rim wind and
   doves at dawn, insects over the floor by day, lapping water and a flamingo
   flock at the lake, crickets, hyena and herd bells at night. No samples,
   no voice; it follows the chapter and starts only on request. */
const AUDIO_SCENES = ["dawn", "day", "lake", "night"];
const soundscape = createSoundscape(soundProgram, { masterGain: 0.9 });
const audioOrb = document.getElementById("audio-orb");
let audioStarted = false;
audioOrb.addEventListener("click", async () => {
  if (!audioStarted) {
    audioStarted = true;
    await soundscape.start(AUDIO_SCENES[chapter]);
  } else {
    soundscape.setOn(!soundscape.on);
  }
  audioOrb.setAttribute("aria-pressed", String(soundscape.on));
  audioOrb.setAttribute("aria-label", soundscape.on ? "Crater sounds, on" : "Crater sounds, off");
  wakeChrome();
});
document.addEventListener("visibilitychange", () => soundscape.handleVisibility());
window.__soundscape = soundscape;

/* ---------- loop ---------- */
const clock = new THREE.Clock();
function tick() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  const t = clock.elapsedTime;
  lakeTime.value = reduceMotion ? 0 : t;
  const k = 1 - Math.exp(-1.6 * Math.min(rawDt,1));

  /* look-around inertia (Windermere ease), skipped under reduced motion */
  if (!dragging && !resetting) {
    if (!reduceMotion) {
      rig.yaw += rig.yawV; rig.pitch = Math.min(0.35, Math.max(-0.8, rig.pitch + rig.pitchV));
      rig.yawV *= Math.exp(-3.4 * dt); rig.pitchV *= Math.exp(-3.4 * dt);
      if (Math.abs(rig.yawV) > 0.0004 || Math.abs(rig.pitchV) > 0.0004) maybeShowReset();
    } else { rig.yawV = 0; rig.pitchV = 0; }
  }
  if (resetting) {
    const rk = 1 - Math.exp(-4.5 * Math.min(rawDt,1));
    rig.yaw += angDiff(rig.entryYaw, rig.yaw) * rk;
    rig.pitch = lerp(rig.pitch, rig.entryPitch, rk);
    if (Math.abs(angDiff(rig.entryYaw, rig.yaw)) < 0.004 && Math.abs(rig.pitch - rig.entryPitch) < 0.004) {
      rig.yaw = rig.entryYaw; rig.pitch = rig.entryPitch; resetting = false; resetOrb.hidden = true;
    }
  }
  cur.pos.lerp(want.pos, k);
  camera.position.copy(cur.pos);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(rig.yaw);
  camera.rotateX(rig.pitch);
  canvas.dataset.yaw=rig.yaw.toFixed(4); canvas.dataset.pitch=rig.pitch.toFixed(4);

  /* palette + lights */
  lerpColor(skyMat.uniforms.top.value, want.skyTop, k);
  lerpColor(skyMat.uniforms.mid.value, want.skyMid, k);
  lerpColor(skyMat.uniforms.bot.value, want.skyBot, k);
  lerpColor(scene.fog.color, want.fogC, k);
  scene.fog.density = lerp(scene.fog.density, want.fogN, k);
  lerpColor(hemi.color, want.hemiSky, k); lerpColor(hemi.groundColor, want.hemiGnd, k);
  hemi.intensity = lerp(hemi.intensity, want.hemiI, k);
  lerpColor(sun.color, want.sunC, k); sun.intensity = lerp(sun.intensity, want.sunI, k);
  sun.position.lerp(want.sunPos, k);
  lerpColor(sunDisc.material.color, want.sunDiscC, k);
  sunDisc.material.opacity = lerp(sunDisc.material.opacity, want.sunDiscO, k);
  moonDisc.material.opacity = lerp(moonDisc.material.opacity, want.moon, k);
  starMat.opacity = lerp(starMat.opacity, want.stars, k);
  lerpColor(lakeMat.color, want.water, k);
  for (const { obj, key } of hidelist) {
    const m = obj.material || obj;
    m.opacity = lerp(m.opacity, want[key], k);
    if (Math.abs(m.opacity - want[key]) < 0.02) m.opacity = want[key];
  }
  const firePulse = reduceMotion ? 0.75 : 0.6 + Math.sin(t * 5.2) * 0.25 + Math.sin(t * 9.7) * 0.15;
  fireLight.intensity = lerp(fireLight.intensity, want.fire * 2.4 * firePulse, k);
  const fireMesh = maasai.userData.fire;
  fireMesh.material.opacity = lerp(fireMesh.material.opacity, want.fire, k);
  if (!reduceMotion) fireMesh.scale.setScalar(1 + Math.sin(t * 7.3) * 0.08);

  if (!reduceMotion) {
    for (const e of elephants) {
      e.g.position.y = e.baseY + Math.sin(t * 1.1 + e.phase) * 0.045;
      e.g.rotation.y += Math.sin(t * 0.11 + e.phase) * 0.0004;
      e.ears[0].rotation.x = Math.sin(t * 1.7 + e.phase) * 0.16;
      e.ears[1].rotation.x = -Math.sin(t * 1.7 + e.phase + 0.5) * 0.16;
      e.trunk.rotation.z = Math.sin(t * 0.9 + e.phase) * 0.025;
      e.tail.rotation.x = Math.sin(t * 2.1 + e.phase) * 0.3;
    }
    for (const r of rhinos) r.g.rotation.y += Math.sin(t * 0.13 + r.phase) * 0.0003;
    for (const h of herds) h.g.position.y = h.baseY + Math.sin(t * 1.9 + h.phase) * 0.02;
    for (const f of flams) {
      f.neck.rotation.z = -0.35 + Math.sin(t * 1.4 + f.phase) * 0.18;
      f.head.position.y = 1.32 + Math.sin(t * 1.4 + f.phase) * 0.08;
    }
    for (const b of birds) {
      const a = t * b.speed + b.phase;
      b.g.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + b.phase) * 1.2, Math.sin(a) * b.r);
      b.g.rotation.y = -a;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

/* ---------- veil ---------- */
setTimeout(() => {
  veil.classList.add("gone");
  dots[0].classList.add("active");
  dots[0].setAttribute("aria-current", "true");
  caption.textContent = CHAPTERS[0].caption;
  setTimeout(() => caption.classList.add("show"), 900);
  whisper.textContent = CHAPTERS[0].whisper;
  whisperTimer = setTimeout(() => whisper.classList.add("show"), 3000);
  wakeChrome();
}, 2100);

