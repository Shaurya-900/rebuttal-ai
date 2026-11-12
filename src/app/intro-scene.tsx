"use client";
// The 3D intro: a black metal card and a solid swipe reader (react-three-fiber + Rapier physics). Hold the card,
// drop its edge into the reader's groove and swipe it along. Let go and it is a real rigid body: it falls, and it
// bounces off the reader unless it lands edge-first in the groove.
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { drawCardBack, drawCardFront, drawLcd } from "./intro-textures";

// World units. Card is ISO-ratio; the reader's groove runs its whole length, open at both ends.
const W = 3.2, H = 2.02, T = 0.03;
const L = 4.6, RH = 1.3, D = 1.1, GAP = 0.12, GD = 0.62, RT = -0.75; // reader length/height/depth, groove gap/depth, top y
const FLOOR = RT - GD; // groove floor
const HOME = new THREE.Vector3(0, 1.45, 0);
const IN_Y = FLOOR + H / 2 + 0.01; // card centre when seated in the groove
const SWIPE = 1.6; // distance travelled along the groove (furthest left to furthest right) that counts as a swipe

const DYNAMIC = 0, KINEMATIC = 2; // Rapier RigidBodyType
type Mode = "idle" | "spawn" | "drag" | "free" | "auto" | "done";
const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));

function cardShape() {
  const s = new THREE.Shape(), r = 0.14, x = -W / 2, y = -H / 2;
  s.moveTo(x + r, y); s.lineTo(x + W - r, y); s.quadraticCurveTo(x + W, y, x + W, y + r);
  s.lineTo(x + W, y + H - r); s.quadraticCurveTo(x + W, y + H, x + W - r, y + H);
  s.lineTo(x + r, y + H); s.quadraticCurveTo(x, y + H, x, y + H - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function faceGeometry(shape: THREE.Shape) {
  const g = new THREE.ShapeGeometry(shape, 12);
  const p = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, (p.getY(i) + H / 2) / H);
  return g;
}

function useCanvasTexture(draw: () => HTMLCanvasElement) {
  return useMemo(() => {
    const t = new THREE.CanvasTexture(draw());
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }, [draw]);
}

function Card({ font }: { font: string }) {
  const shape = useMemo(cardShape, []);
  const body = useMemo(() => { const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 12 }); g.translate(0, 0, -T / 2); return g; }, [shape]);
  const face = useMemo(() => faceGeometry(shape), [shape]);
  const front = useCanvasTexture(useMemo(() => () => drawCardFront(font), [font]));
  const back = useCanvasTexture(useMemo(() => () => drawCardBack(font), [font]));
  return (
    <group>
      <mesh geometry={body}><meshStandardMaterial color="#0c0d0d" metalness={0.9} roughness={0.35} /></mesh>
      <mesh geometry={face} position={[0, 0, T / 2 + 0.0008]}>
        <meshPhysicalMaterial map={front} metalness={0.55} roughness={0.4} clearcoat={1} clearcoatRoughness={0.28} />
      </mesh>
      <mesh geometry={face} position={[0, 0, -T / 2 - 0.0008]} rotation={[0, Math.PI, 0]}>
        <meshPhysicalMaterial map={back} metalness={0.5} roughness={0.45} clearcoat={0.8} clearcoatRoughness={0.3} />
      </mesh>
    </group>
  );
}

function Reader({ lcd }: { lcd: { text: string; tone: "idle" | "ok" | "warn" } }) {
  const cv = useMemo(() => Object.assign(document.createElement("canvas"), { width: 512, height: 128 }), []);
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }, [cv]);
  useEffect(() => { drawLcd(cv, lcd.text, lcd.tone); tex.needsUpdate = true; }, [cv, tex, lcd]);
  const wall = (D - GAP) / 2, wz = GAP / 2 + wall / 2, baseH = RH - GD, baseY = RT - RH + baseH / 2;
  const shell = <meshStandardMaterial color="#e4dac2" roughness={0.72} metalness={0} />;
  return (
    <RigidBody type="fixed" colliders={false}>
      {/* colliders: solid base under the groove, and a wall either side of it */}
      <CuboidCollider args={[L / 2, baseH / 2, D / 2]} position={[0, baseY, 0]} restitution={0.45} friction={0.5} />
      <CuboidCollider args={[L / 2, GD / 2, wall / 2]} position={[0, RT - GD / 2, wz]} restitution={0.45} friction={0.5} />
      <CuboidCollider args={[L / 2, GD / 2, wall / 2]} position={[0, RT - GD / 2, -wz]} restitution={0.45} friction={0.5} />
      {/* what you see */}
      <RoundedBox args={[L, baseH, D]} radius={0.08} smoothness={4} position={[0, baseY, 0]}>{shell}</RoundedBox>
      <RoundedBox args={[L, GD + 0.06, wall]} radius={0.05} smoothness={4} position={[0, RT - GD / 2 - 0.03, wz]}>{shell}</RoundedBox>
      <RoundedBox args={[L, GD + 0.06, wall]} radius={0.05} smoothness={4} position={[0, RT - GD / 2 - 0.03, -wz]}>{shell}</RoundedBox>
      <mesh position={[0, FLOOR + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[L - 0.1, GAP]} /><meshBasicMaterial color="#1c1a17" /></mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (L / 2 - 0.85), RT + 0.001, wz]}>
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} position={[(i - 4.5) * 0.1, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.035, wall * 0.5]} /><meshBasicMaterial color="#3e3a33" /></mesh>
          ))}
        </group>
      ))}
      {/* front panel: display and status light */}
      <mesh position={[0, baseY - 0.02, D / 2 + 0.002]}><planeGeometry args={[1.9, 0.5]} /><meshStandardMaterial color="#111" roughness={0.4} /></mesh>
      <mesh position={[0, baseY - 0.02, D / 2 + 0.004]}><planeGeometry args={[1.8, 0.42]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      <mesh position={[L / 2 - 0.42, baseY - 0.02, D / 2 + 0.01]}>
        <torusGeometry args={[0.07, 0.025, 12, 32]} /><meshStandardMaterial color="#222" roughness={0.3} />
      </mesh>
      <mesh position={[0, RT - GD - 0.08, D / 2 + 0.003]}><planeGeometry args={[L - 0.3, 0.012]} /><meshBasicMaterial color="#cbbf9f" /></mesh>
    </RigidBody>
  );
}

function Rig({ font, auto, onLcd, onApproved }: { font: string; auto: number; onLcd: (t: string, tone?: "idle" | "ok" | "warn") => void; onApproved: () => void }) {
  const rb = useRef<RapierRigidBody>(null);
  const { camera, gl, size } = useThree();
  const st = useRef({ mode: "spawn" as Mode, t: 0, target: new THREE.Vector3(), grab: new THREE.Vector3(), vel: new THREE.Vector3(),
    last: new THREE.Vector3(), q: new THREE.Quaternion(), freeT: 0, inGroove: false, x0: 0, x1: 0, dir: 1, ptr: new THREE.Vector2(), hasPtr: false });
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);

  // Fit the reader on narrow screens: pull the camera back until 6 units of width are visible.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(0, 1.1, Math.max(12.5, 3.2 / (half * (size.width / size.height))));
    cam.lookAt(0, -0.3, 0); cam.updateProjectionMatrix();
  }, [camera, size]);

  const pointerOnPlane = (out: THREE.Vector3) => { ray.setFromCamera(st.current.ptr, camera); return ray.ray.intersectPlane(plane, out); };

  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      st.current.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); st.current.hasPtr = true;
    };
    const up = (e: PointerEvent) => {
      move(e); // the release point counts
      const s = st.current, b = rb.current;
      if (s.mode !== "drag" || !b) return;
      document.body.style.cursor = "";
      placeDrag();
      if (s.mode !== "drag") return; // that last move finished the swipe
      b.setTranslation(s.target, true);
      if (s.inGroove) b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      b.setBodyType(DYNAMIC, true);
      b.enableCcd(true); // falling fast: don't tunnel through the reader
      b.setLinvel(s.inGroove ? { x: 0, y: 0, z: 0 } : { x: clamp(s.vel.x, 14), y: clamp(s.vel.y, 14), z: 0 }, true); // seated: it just stands there
      // a little tumble so a careless drop hits the walls and bounces, instead of sliding neatly in
      b.setAngvel(s.inGroove ? { x: 0, y: 0, z: 0 } : { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 4, z: -s.vel.x * 0.5 }, true);
      s.mode = "free"; s.freeT = 0;
      onLcd(s.inGroove ? "SWIPE IT" : "READY", s.inGroove ? "warn" : "idle");
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [gl, onLcd]);

  useEffect(() => { // keyboard path: the card swipes itself
    if (!auto || !rb.current) return;
    const b = rb.current, s = st.current;
    b.setBodyType(KINEMATIC, true); b.enableCcd(false);
    const p = b.translation(); s.target.set(p.x, p.y, 0); s.mode = "auto"; s.t = 0; s.dir = 1;
    onLcd("READING", "idle");
  }, [auto, onLcd]);

  function down(e: ThreeEvent<PointerEvent>) {
    const s = st.current, b = rb.current;
    if (!b || s.mode === "done" || s.mode === "auto") return;
    e.stopPropagation();
    const r = gl.domElement.getBoundingClientRect();
    s.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const hit = new THREE.Vector3(); if (!pointerOnPlane(hit)) return;
    const p = b.translation();
    b.setBodyType(KINEMATIC, true);
    b.enableCcd(false); // while held, our code places the card (and keeps it out of the reader's solid parts)
    s.grab.set(hit.x - p.x, hit.y - p.y, 0); s.target.set(p.x, p.y, 0); s.last.copy(s.target); s.vel.set(0, 0, 0);
    const q = b.rotation(); s.q.set(q.x, q.y, q.z, q.w);
    s.mode = "drag"; s.inGroove = false;
    document.body.style.cursor = "grabbing";
    onLcd("INSERT CARD", "idle");
  }

  // Where the held card goes for the current pointer. Shared by the frame loop and the release, so a quick flick
  // is judged on where the pointer really ended, not on the last frame drawn.
  function placeDrag(want?: THREE.Euler) {
    const s = st.current;
    const hit = new THREE.Vector3();
    if (pointerOnPlane(hit)) s.target.set(hit.x - s.grab.x, hit.y - s.grab.y, 0);
    const overReader = Math.abs(s.target.x) < L / 2 + W / 2 - 0.15;
    if (overReader) s.target.y = Math.max(s.target.y, IN_Y); // the reader is solid: only the groove lets the card in
    const nowIn = overReader && s.target.y - H / 2 < RT - 0.12;
    if (nowIn && !s.inGroove) { s.x0 = s.x1 = s.target.x; onLcd("SWIPE  ⇄", "idle"); }
    if (!nowIn && s.inGroove) onLcd("INSERT CARD", "idle");
    s.inGroove = nowIn;
    if (nowIn) {
      s.x0 = Math.min(s.x0, s.target.x); s.x1 = Math.max(s.x1, s.target.x);
      const prog = Math.min(1, (s.x1 - s.x0) / SWIPE);
      if (prog > 0.06) onLcd("▮".repeat(Math.round(prog * 8)).padEnd(8, "▯"), "idle");
      if (prog >= 1) { s.mode = "done"; s.dir = s.target.x - s.x0 > s.x1 - s.target.x ? 1 : -1; onLcd("APPROVED", "ok"); setTimeout(onApproved, 900); }
    } else {
      want?.set(clamp(-s.vel.y * 0.05, 0.5), clamp(s.vel.x * 0.07, 0.6), clamp(-s.vel.x * 0.035, 0.35));
    }
  }

  useFrame((_, dtRaw) => {
    const b = rb.current, s = st.current;
    if (!b) return;
    const dt = Math.min(dtRaw, 1 / 30);
    s.t += dt;
    const want = new THREE.Euler();
    if (s.mode === "spawn") { // a fresh card drops in from above
      s.target.lerp(HOME, 1 - Math.pow(0.002, dt));
      if (s.target.distanceTo(HOME) < 0.01) s.mode = "idle";
    } else if (s.mode === "idle") {
      s.target.set(HOME.x, HOME.y + Math.sin(s.t * 1.6) * 0.05, 0);
      want.set(-0.08 + Math.sin(s.t * 0.9) * 0.04, Math.sin(s.t * 0.7) * 0.18, 0.04);
    } else if (s.mode === "drag") {
      placeDrag(want);
    } else if (s.mode === "auto") { // into the groove, then along it
      const start = new THREE.Vector3(-1.4, IN_Y, 0);
      s.target.lerp(start, 1 - Math.pow(0.0005, Math.min(dtRaw, 0.25))); // real time, so it is quick even on a slow GPU
      if (s.target.distanceTo(start) < 0.03) { s.mode = "done"; s.dir = 1; onLcd("APPROVED", "ok"); setTimeout(onApproved, 900); }
    } else if (s.mode === "done") { // swiped through: it runs on out of the end of the groove
      s.target.x += s.dir * 5 * dt; s.target.y = IN_Y;
    } else if (s.mode === "free") {
      s.freeT += dt;
      const p = b.translation();
      const resting = Math.abs(p.x) < L / 2 + W / 2 && p.y - H / 2 < RT - 0.1;
      if (p.y < -7 || Math.abs(p.x) > 9 || (s.freeT > 3.5 && !resting)) { // gone, or lying on the reader: deal a new one
        b.setBodyType(KINEMATIC, true); b.enableCcd(false);
        // teleport above the screen: moving it there would drag it through the solid reader
        b.setTranslation({ x: HOME.x, y: 5.5, z: 0 }, true); b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        s.target.set(HOME.x, 5.5, 0); s.last.copy(s.target); s.vel.set(0, 0, 0); s.q.identity(); s.mode = "spawn";
        onLcd("TRY AGAIN", "warn");
        setTimeout(() => { if (st.current.mode === "idle" || st.current.mode === "spawn") onLcd("READY", "idle"); }, 1400);
      }
      return; // physics drives it
    }
    // kinematic follow: velocity from the motion, rotation eased toward the tilt the motion implies
    s.vel.copy(s.target).sub(s.last).divideScalar(Math.max(dt, 1e-3)).multiplyScalar(0.5).add(s.vel.multiplyScalar(0.5));
    s.last.copy(s.target);
    if (s.mode === "drag" && s.inGroove) s.q.identity(); // the groove holds it upright; any tilt would put it inside the walls
    else s.q.slerp(new THREE.Quaternion().setFromEuler(want), 1 - Math.pow(0.0001, dt));
    b.setNextKinematicTranslation(s.target);
    b.setNextKinematicRotation(s.q);
  });

  return (
    <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={[0, 5.5, 0]} canSleep={false}>
      <CuboidCollider args={[W / 2, H / 2, T / 2]} restitution={0.4} friction={0.6} density={2} />
      <group onPointerDown={down} onPointerOver={() => { if (st.current.mode !== "drag") document.body.style.cursor = "grab"; }} onPointerOut={() => { if (st.current.mode !== "drag") document.body.style.cursor = ""; }}>
        <Card font={font} />
      </group>
    </RigidBody>
  );
}

export default function IntroScene({ auto, onApproved }: { auto: number; onApproved: () => void }) {
  const [lcd, setLcd] = useState<{ text: string; tone: "idle" | "ok" | "warn" }>({ text: "READY", tone: "idle" });
  const [font, setFont] = useState<string | null>(null);
  useEffect(() => { document.fonts.ready.then(() => setFont(getComputedStyle(document.body).fontFamily)); }, []);
  const onLcd = useMemo(() => (text: string, tone: "idle" | "ok" | "warn" = "idle") => setLcd((l) => (l.text === text && l.tone === tone ? l : { text, tone })), []);
  if (!font) return null;
  const said = lcd.text.includes("▮") ? "Reading" : lcd.text.replace(/\s+⇄/, "");
  return (
    <>
    <p className="sr-only" aria-live="polite">{said}</p>
    <Canvas dpr={[1, 2]} camera={{ fov: 32, position: [0, 1.1, 10] }} gl={{ antialias: true, alpha: true }} style={{ touchAction: "none" }}>
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 6, 6]} intensity={1.5} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 5]} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-5, 1, 3]} rotation-y={Math.PI / 3} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[5, -1, 3]} rotation-y={-Math.PI / 3} scale={[4, 6, 1]} />
      </Environment>
      <Physics gravity={[0, -22, 0]}>
        <Reader lcd={lcd} />
        <Rig font={font} auto={auto} onLcd={onLcd} onApproved={onApproved} />
      </Physics>
      <ContactShadows position={[0, RT - RH - 0.005, 0]} opacity={0.32} scale={12} blur={2.6} far={5} />
    </Canvas>
    </>
  );
}
