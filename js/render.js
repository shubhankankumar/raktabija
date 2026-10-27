// three.js view of the simulation. Reads game state, never writes it.
// Colours come from the CSS tokens (readPalette in main.js); models are built from primitives, no assets.
import * as THREE from 'three';
import { DROP_HEIGHT, CHAPPAL_LEN, MAX_PARTICLES, MAX_SWARM, ROACH_HEIGHT } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const STRIDE = 0.22; // roach body-lengths per leg cycle, in world units

// CSS colours may be oklch(), which THREE.Color cannot parse: let the 2D canvas resolve them.
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function rgb(css) {
  probe.clearRect(0, 0, 1, 1); probe.fillStyle = css; probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

export function createRenderer(canvas, pal) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const bg = rgb(pal.paper);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 30, 60);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

  // kitchen tube light almost overhead, so a falling chappal's shadow sits close to where it lands
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a2c22, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(1.5, 16, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // ---- floor and walls ----
  const marble = new THREE.CanvasTexture(paintMarble(pal));
  marble.colorSpace = THREE.SRGBColorSpace;
  marble.wrapS = marble.wrapT = THREE.RepeatWrapping;
  marble.repeat.set(6, 6);
  marble.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.MeshStandardMaterial({ map: marble, roughness: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: rgb(pal.wall), roughness: 0.9 });
  const walls = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wallMat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  });

  // ---- models ----
  const roachMats = {
    shell: new THREE.MeshPhysicalMaterial({ color: rgb(pal.shell), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12 }),
    dark: new THREE.MeshPhysicalMaterial({ color: rgb(pal.shellDark), roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    margin: new THREE.MeshPhysicalMaterial({ color: rgb(pal.margin), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.15 }),
    leg: new THREE.MeshStandardMaterial({ color: rgb(pal.leg), roughness: 0.6 }),
  };
  const nymphMat = new THREE.MeshPhysicalMaterial({ color: rgb(pal.nymph), roughness: 0.45, clearcoat: 0.6 });
  const player = makeRoach(roachMats);
  scene.add(player);
  const babies = Array.from({ length: MAX_SWARM }, () => {
    const b = cloneRoach(player, nymphMat);
    b.scale.setScalar(0.55);
    scene.add(b);
    return b;
  });

  const chappalModel = makeChappal(pal);
  const chappals = [];
  const decalTex = new THREE.CanvasTexture(paintBlob());
  const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const decals = [];
  const reticleMat = new THREE.MeshBasicMaterial({ color: rgb(pal.alert), transparent: true, depthWrite: false });
  const reticleGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  const reticles = [];
  const splat = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: rgb(pal.blood), map: decalTex, transparent: true, depthWrite: false }));
  scene.add(splat);

  const pool = (list, make) => (i) => list[i] || (list[i] = make());
  const chappalAt = pool(chappals, () => { const c = chappalModel.clone(); scene.add(c); return c; });
  const decalAt = pool(decals, () => {
    const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x000000, map: decalTex, transparent: true, depthWrite: false }));
    scene.add(m); return m;
  });
  const reticleAt = pool(reticles, () => { const m = new THREE.Mesh(reticleGeo, reticleMat); scene.add(m); return m; });

  // particles: one draw call for all blood and dust
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3), pCol = new Float32Array(MAX_PARTICLES * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
  points.frustumCulled = false;
  scene.add(points);
  const blood = rgb(pal.blood), dust = rgb(pal.dust);

  // ---- camera fit: back off until the whole arena, walls included, is on screen ----
  const camDir = new THREE.Vector3(0, Math.sin(1.02), Math.cos(1.02)); // ~58° above the floor
  const camLook = new THREE.Vector3(0, 0, 0.3);
  let camDist = 20, arenaKey = '';
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
  const ground = new THREE.Plane(UP, 0);

  function layout(g) {
    const key = `${g.hw}|${g.hd}|${camera.aspect}`;
    if (key === arenaKey) return;
    arenaKey = key;
    const { hw, hd } = g, t = 0.25;
    walls[0].scale.set(hw * 2 + t * 2, 1.2, t); walls[0].position.set(0, 0.6, -hd - t / 2);
    walls[1].scale.set(t, 0.5, hd * 2); walls[1].position.set(-hw - t / 2, 0.25, 0);
    walls[2].scale.set(t, 0.5, hd * 2); walls[2].position.set(hw + t / 2, 0.25, 0);
    const corners = [[-hw, 0, hd], [hw, 0, hd], [-hw, 1.2, -hd], [hw, 1.2, -hd]].map((c) => new THREE.Vector3(...c));
    let lo = 4, hi = 80;
    for (let i = 0; i < 24; i++) {
      camDist = (lo + hi) / 2;
      placeCamera(0, 0);
      const fits = corners.every((c) => { const p = c.clone().project(camera); return Math.abs(p.x) < 0.96 && p.y < 0.86 && p.y > -0.96; });
      if (fits) hi = camDist; else lo = camDist;
    }
    camDist = hi;
  }

  function placeCamera(sx, sz) {
    camera.position.copy(camLook).addScaledVector(camDir, camDist);
    camera.position.x += sx; camera.position.z += sz;
    camera.lookAt(camLook.x + sx, camLook.y, camLook.z + sz);
    camera.updateMatrixWorld();
  }

  return {
    resize(w, h, dpr, g) {
      renderer.setPixelRatio(Math.min(dpr, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      layout(g);
    },

    // screen point -> floor point, or null
    pick(x, y, out) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(ground, hit)) return null;
      out.x = hit.x; out.z = hit.z;
      return out;
    },

    draw(g, menu, t, reduced) {
      layout(g);
      const p = g.player;

      if (menu) {
        // product shot: the roach twitching on the marble, the title to its left
        const a = reduced ? 0.5 : 0.5 + Math.sin(t * 0.15) * 0.35;
        const d = 3.1;
        camera.position.set(p.x + Math.sin(a) * d, 1.5, p.z + Math.cos(a) * d);
        camera.lookAt(p.x - 0.9 * Math.cos(a), 0.05, p.z + 0.9 * Math.sin(a));
        camera.updateMatrixWorld();
      } else {
        const s = reduced ? 0 : g.shake * 0.25;
        placeCamera((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }

      // player
      const twitch = menu ? Math.sin(t * 7) * Math.sin(t * 1.3) * 0.004 : 0;
      poseRoach(player, p.x, p.z, p.heading, menu ? Math.max(0, Math.sin(t * 0.8)) * 0.03 + twitch : p.gait, t);
      player.visible = g.over || g.invuln === 0 || Math.floor(g.invuln * 14) % 2 === 0;
      player.scale.set(1, g.over ? 0.25 : 1, g.over ? 1.25 : 1); // squashed flat
      splat.visible = g.over;
      if (g.over) { splat.position.set(p.x, 0.012, p.z); splat.scale.setScalar(1.6); splat.material.opacity = 0.85; }

      babies.forEach((b, i) => {
        const s = g.swarm[i];
        b.visible = !!s;
        if (s) poseRoach(b, s.x, s.z, s.heading, s.gait / 0.55, t + i);
      });

      // chappals, their landing shadows and the giant one's reticle
      let nd = 0, nr = 0;
      chappals.forEach((m) => { m.visible = false; });
      g.chappals.forEach((c, i) => {
        const m = chappalAt(i);
        m.visible = true;
        m.scale.setScalar(c.scale);
        const sink = c.state === 'rest' && c.rest < 0.4 ? (0.4 - c.rest) * 0.25 * c.scale : 0; // sinks away under the floor
        m.position.set(c.x, c.y - sink, c.z);
        m.rotation.set(0, -c.yaw, c.tilt, 'YXZ');

        if (c.state === 'air') {
          // the shadow on the landing spot darkens and tightens as the chappal comes down
          const k = Math.min(1, Math.max(0, c.y / DROP_HEIGHT));
          const dcl = decalAt(nd++);
          dcl.visible = true;
          dcl.position.set(c.tx, 0.011, c.tz);
          dcl.rotation.y = -c.yaw;
          dcl.scale.set(CHAPPAL_LEN * c.scale * (1.1 + k), 1, CHAPPAL_LEN * 0.55 * c.scale * (1.1 + k));
          dcl.material.opacity = 0.65 - k * 0.45;
          if (c.kind !== 'drop') {
            const r = reticleAt(nr++);
            r.visible = true;
            r.position.set(c.tx, 0.013, c.tz);
            r.scale.setScalar((c.r + c.reach) * (1 + 0.15 * Math.sin(t * 18)));
          }
        }
      });
      for (let i = nd; i < decals.length; i++) decals[i].visible = false;
      for (let i = nr; i < reticles.length; i++) reticles[i].visible = false;

      // particles
      const n = Math.min(g.particles.length, MAX_PARTICLES);
      for (let i = 0; i < n; i++) {
        const q = g.particles[i], col = q.kind === 'blood' ? blood : dust, f = Math.min(1, q.life / q.max * 2);
        pPos[i * 3] = q.x; pPos[i * 3 + 1] = q.y; pPos[i * 3 + 2] = q.z;
        pCol[i * 3] = col.r * f + bg.r * (1 - f); pCol[i * 3 + 1] = col.g * f + bg.g * (1 - f); pCol[i * 3 + 2] = col.b * f + bg.b * (1 - f);
      }
      pGeo.setDrawRange(0, n);
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);
    },
  };
}

// ---------- roach: American cockroach, head toward +x, feet on y = 0 ----------

function blob(geo, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function segment(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, d.length(), 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  m.castShadow = true;
  return m;
}

function makeRoach(mat) {
  const root = new THREE.Group(), body = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 32, 18);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  body.position.y = ROACH_HEIGHT * 0.35;
  root.add(body);

  body.add(blob(sphere, mat.shell, 0.34, 0.09, 0.19, -0.08, 0.02, 0));     // wings over the abdomen
  body.add(blob(sphere, mat.dark, 0.3, 0.07, 0.17, -0.12, 0.0, 0));        // abdomen underside
  body.add(blob(sphere, mat.margin, 0.11, 0.06, 0.17, 0.25, 0.03, 0));    // pronotum, pale rim
  body.add(blob(sphere, mat.dark, 0.07, 0.065, 0.1, 0.26, 0.035, 0));     // its dark centre mark
  body.add(blob(sphere, mat.dark, 0.06, 0.05, 0.07, 0.36, 0.0, 0));       // head
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.004, 0.006), mat.dark); // where the wings meet
  seam.position.set(-0.1, 0.112, 0);
  body.add(seam);
  for (const s of [-1, 1]) body.add(segment(v(-0.4, 0.0, s * 0.04), v(-0.52, 0.02, s * 0.08), 0.012, mat.dark)); // cerci

  // legs: tripod gait, each pivots at the hip
  const legs = [];
  [[0.18, 0.2, 0.3], [0.05, 0.0, 0.38], [-0.08, -0.25, 0.44]].forEach(([hx, fx, reach], j) => {
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(hx, 0.0, s * 0.1);
      const knee = v((fx - hx) * 0.5, 0.06, s * reach * 0.55), foot = v(fx - hx, -body.position.y, s * reach);
      hip.add(segment(v(0, 0, 0), knee, 0.016, mat.leg), segment(knee, foot, 0.011, mat.leg));
      hip.userData.phase = (j + (s > 0 ? 1 : 0)) % 2 ? Math.PI : 0;
      body.add(hip);
      legs.push(hip);
    }
  });

  const antennae = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.4, 0.02, s * 0.03);
    const curve = new THREE.CatmullRomCurve3([v(0, 0, 0), v(0.3, 0.08, s * 0.12), v(0.6, 0.06, s * 0.3), v(0.82, 0.02, s * 0.42)]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.005, 4), mat.leg);
    pivot.add(m);
    body.add(pivot);
    return pivot;
  });

  root.rig = { body, legs, antennae }; // not userData: clone() deep-copies that as JSON
  return root;
}

function cloneRoach(src, nymphMat) {
  const c = src.clone();
  const body = c.children[0];
  c.traverse((o) => { if (o.isMesh && o.material !== src.rig.legs[0].children[0].material) o.material = nymphMat; });
  const legs = body.children.filter((o) => o.userData.phase !== undefined);
  const antennae = body.children.filter((o) => o.isGroup && o.userData.phase === undefined);
  c.rig = { body, legs, antennae };
  return c;
}

function poseRoach(r, x, z, heading, gait, t) {
  r.position.set(x, 0, z);
  r.rotation.y = -heading;
  const ph = (gait / STRIDE) * Math.PI * 2;
  for (const leg of r.rig.legs) {
    leg.rotation.y = Math.sin(ph + leg.userData.phase) * 0.35;
    leg.rotation.x = Math.max(0, Math.cos(ph + leg.userData.phase)) * 0.15 * Math.sign(leg.position.z);
  }
  r.rig.body.position.y = ROACH_HEIGHT * 0.35 + Math.abs(Math.sin(ph)) * 0.006;
  r.rig.antennae.forEach((a, i) => {
    a.rotation.y = Math.sin(t * 3.1 + i * 2) * 0.18 + Math.sin(t * 11 + i) * 0.04;
    a.rotation.z = Math.sin(t * 2.3 + i) * 0.1;
  });
}

// ---------- chappal: blue-strap Hawai, toe toward +x, sole on y = 0 ----------

function makeChappal(pal) {
  const L = CHAPPAL_LEN, H = L / 2;
  // half-width along the sole: round heel, pinched arch, broad toe
  const width = (u) => L * (0.13 + 0.05 * Math.sin(Math.PI * u) - 0.045 * Math.exp(-((u - 0.45) ** 2) / 0.01) + 0.03 * u);
  const top = [], bottom = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, x = -H + u * L, round = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 12));
    top.push(new THREE.Vector2(x, width(u) * round));
    bottom.unshift(new THREE.Vector2(x, -width(u) * round));
  }
  const shape = new THREE.Shape().setFromPoints([...top, ...bottom]);
  const thick = 0.1;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2); // extrude upward; the shape's y becomes -z
  geo.translate(0, 0.012, 0);

  const footbed = new THREE.MeshStandardMaterial({ color: rgb(pal.foot), roughness: 0.85 });
  const rim = new THREE.MeshStandardMaterial({ color: rgb(pal.rim), roughness: 0.7 });
  const strap = new THREE.MeshStandardMaterial({ color: rgb(pal.strap), roughness: 0.55 });
  const group = new THREE.Group();
  const sole = new THREE.Mesh(geo, [footbed, rim]);
  sole.castShadow = sole.receiveShadow = true;
  group.add(sole);

  const y0 = thick + 0.02;
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(H * 0.55, y0, 0),
      new THREE.Vector3(H * 0.3, y0 + 0.14, s * 0.07),
      new THREE.Vector3(H * 0.02, y0 + 0.12, s * 0.17),
      new THREE.Vector3(-H * 0.12, y0, s * 0.2),
    ]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.035, 6), strap);
    m.scale.y = 0.7; // straps are flat bands, not ropes
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

// ---------- textures ----------

function paintBlob() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return c;
}

// one tile of polished marble with a seam on two edges; it repeats across the floor
function paintMarble(pal) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const f = c.getContext('2d');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  f.fillStyle = pal.ground; f.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    const cx = rnd() * S, cy = rnd() * S, r = S * (0.15 + rnd() * 0.4);
    const g = f.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rnd() < 0.6 ? pal.cloud : pal.gloss); g.addColorStop(1, 'rgba(0,0,0,0)');
    f.globalAlpha = 0.1 + rnd() * 0.15; f.fillStyle = g; f.fillRect(0, 0, S, S);
  }
  const dir = rnd() * Math.PI;
  f.lineCap = 'round'; f.lineJoin = 'round'; f.strokeStyle = pal.vein;
  for (let v = 0; v < 10; v++) {
    const pts = [];
    let px = rnd() * S - Math.cos(dir) * S * 0.6, py = rnd() * S - Math.sin(dir) * S * 0.6, a = dir;
    for (let j = 0, n = 30 + rnd() * 60; j < n; j++) { a += (rnd() - 0.5) * 0.7 + (dir - a) * 0.08; px += Math.cos(a) * 16; py += Math.sin(a) * 16; pts.push(px, py); }
    for (const [lw, alpha] of [[16, 0.05], [1 + rnd() * 2, 0.2 + rnd() * 0.3]]) {
      f.lineWidth = lw; f.globalAlpha = alpha;
      f.beginPath(); f.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) f.lineTo(pts[k], pts[k + 1]);
      f.stroke();
    }
  }
  f.globalAlpha = 0.8; f.fillStyle = pal.seam;
  f.fillRect(0, 0, S, 4); f.fillRect(0, 0, 4, S);
  f.globalAlpha = 1;
  return c;
}
