import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, SRGBColorSpace, type Group, type MeshStandardMaterial } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FormationProp, FormationPropKind } from '@coverscape/shared';
import type { FormationInput, FormationMember } from '@/data/formations';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { cssColor, cssFont } from '../cssTokens';
import { positionsAt, propsAt, type Stage } from '../formationRules';
import { PROP_SIZE } from '../propRules';
import { initialOf, personColors } from '../StageView';
import { CAMERA_LABELS, CAMERA_TARGET, cameraPosition, propYaw, toWorld, type CameraView } from './cameraRules';

/**
 * REQ-13 · The stage in 3D: the floor with its grid and the audience's edge, a capsule per participant in their
 * colour with their initial above, and the props as simple boxes. Follows the player's clock like the 2D stage (the
 * meshes are moved in `useFrame`, never through React), and only draws when something changes (`frameloop="demand"`).
 * Loaded on demand with three.js; the 2D stage stays the main view (and has the positions in text).
 */

export interface Stage3DProps {
  stage: Stage;
  memberIds: string[];
  people: Map<string, FormationMember>;
  list: FormationInput[];
}

const PROP_HEIGHT: Record<FormationPropKind, number> = { chair: 0.45, bench: 0.45, step: 0.25, mark: 0.02 };
const BODY_RADIUS = 0.22;
const BODY_LENGTH = 1.0;

export default function Stage3D({ stage, memberIds, people, list }: Stage3DProps) {
  const [view, setView] = useState<{ kind: CameraView; n: number }>({ kind: 'audience', n: 0 });
  const bg = cssColor('--color-sumi-900');
  return (
    <div>
      <div
        role="img"
        aria-label="Vista 3D del escenario. La vista 2D, con la lista de posiciones en texto, sigue siendo la principal."
        className="aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-line bg-sumi-900"
      >
        <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 42, near: 0.1, far: 200, position: cameraPosition('audience', stage) }}>
          <color attach="background" args={[bg]} />
          <hemisphereLight args={[cssColor('--color-washi'), cssColor('--color-sumi-950'), 1.1]} />
          <directionalLight position={[3, 9, 6]} intensity={1.8} />
          <Floor stage={stage} />
          <Scene stage={stage} memberIds={memberIds} people={people} list={list} />
          <Controls view={view} stage={stage} />
        </Canvas>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Cámara">
        {(Object.keys(CAMERA_LABELS) as CameraView[]).map((kind) => (
          <motion.button
            key={kind}
            type="button"
            aria-pressed={view.kind === kind}
            onClick={() => setView((v) => ({ kind, n: v.n + 1 }))}
            whileTap={{ scale: 0.9 }}
            transition={jelly}
            className={cn(
              'flex h-11 items-center rounded-[10px] border px-3 text-[13px] font-bold transition-colors',
              view.kind === kind ? 'border-ai-400/60 bg-ai-600/50 text-ai-200' : 'border-line-strong bg-sumi-800 text-washi-muted hover:text-washi',
            )}
          >
            {CAMERA_LABELS[kind]}
          </motion.button>
        ))}
        <span className="text-[12px] text-washi-subtle">Arrastra para girar · pellizca para acercar</span>
      </div>
    </div>
  );
}

/** A label drawn on a canvas, as a texture. */
function textTexture(text: string, color: string, px: number, width: number, height: number, background?: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = cssColor('--color-sumi-950');
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.font = `800 ${px}px ${cssFont('--font-sans')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + px * 0.04);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function Floor({ stage }: { stage: Stage }) {
  const { width: W, depth: D } = stage;
  const grid = useMemo(() => {
    const g = stage.grid > 0 ? stage.grid : 0.5;
    const pts: number[] = [];
    for (let x = 0; x <= W + 1e-6; x += g) pts.push(x - W / 2, 0.003, -D / 2, x - W / 2, 0.003, D / 2);
    for (let y = 0; y <= D + 1e-6; y += g) pts.push(-W / 2, 0.003, y - D / 2, W / 2, 0.003, y - D / 2);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return geometry;
  }, [W, D, stage.grid]);
  const centre = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0.005, -D / 2, 0, 0.005, D / 2], 3));
    return geometry;
  }, [D]);
  const audience = useMemo(() => textTexture('PÚBLICO', cssColor('--color-shu-300'), 88, 512, 128), []);
  useEffect(() => () => grid.dispose(), [grid]);
  useEffect(() => () => centre.dispose(), [centre]);
  useEffect(() => () => audience.dispose(), [audience]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={cssColor('--color-sumi-850')} roughness={0.95} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={cssColor('--color-washi')} transparent opacity={0.14} />
      </lineSegments>
      <lineSegments geometry={centre}>
        <lineBasicMaterial color={cssColor('--color-kin-300')} transparent opacity={0.55} />
      </lineSegments>
      {/* The audience's edge and its label on the floor in front of it */}
      <mesh position={[0, 0.012, D / 2]}>
        <boxGeometry args={[W, 0.024, 0.07]} />
        <meshBasicMaterial color={cssColor('--color-shu-400')} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, D / 2 + 0.55]}>
        <planeGeometry args={[2.4, 0.6]} />
        <meshBasicMaterial map={audience} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

function Person({ person, register }: { person: FormationMember | undefined; register: (el: Group | null) => void }) {
  const c = personColors(person);
  const fill = cssColor(c.fill);
  const badge = useMemo(() => textTexture(initialOf(person?.name), cssColor(c.ink), 132, 192, 192, fill), [person?.name, c.ink, fill]);
  useEffect(() => () => badge.dispose(), [badge]);
  return (
    <group ref={register}>
      <mesh position-y={BODY_RADIUS + BODY_LENGTH / 2}>
        <capsuleGeometry args={[BODY_RADIUS, BODY_LENGTH, 6, 18]} />
        <meshStandardMaterial color={fill} roughness={0.55} />
      </mesh>
      <sprite position-y={BODY_LENGTH + BODY_RADIUS * 2 + 0.3} scale={[0.46, 0.46, 1]}>
        <spriteMaterial map={badge} depthWrite={false} />
      </sprite>
    </group>
  );
}

function PropBox({ prop, register }: { prop: FormationProp; register: (el: Group | null) => void }) {
  const { w, d } = PROP_SIZE[prop.kind];
  const h = PROP_HEIGHT[prop.kind];
  const color = cssColor(prop.kind === 'mark' ? '--color-kin-300' : prop.kind === 'step' ? '--color-sumi-600' : '--color-kiji-400');
  return (
    <group ref={register}>
      <mesh position-y={h / 2}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.8} transparent />
      </mesh>
    </group>
  );
}

/** People and props, moved on every drawn frame to where the player's clock puts them. */
function Scene({ stage, memberIds, people, list }: Stage3DProps) {
  const invalidate = useThree((s) => s.invalidate);
  const bodies = useRef(new Map<string, Group>());
  const props = useRef(new Map<string, Group>());
  const allProps = useMemo(() => {
    const seen = new Map<string, FormationProp>();
    for (const f of list) for (const p of f.props ?? []) seen.set(p.id, p);
    return [...seen.values()];
  }, [list]);

  // Draw again when the clock moves or the plan changes (the canvas only draws on demand).
  useEffect(
    () =>
      usePlayer.subscribe((s, prev) => {
        if (s.time !== prev.time) invalidate();
      }),
    [invalidate],
  );
  useEffect(() => invalidate(), [invalidate, list, memberIds, stage]);

  useFrame(() => {
    const t = usePlayer.getState().time;
    const at = positionsAt(list, t, memberIds, stage);
    for (const [id, g] of bodies.current) {
      const p = at[id];
      g.visible = Boolean(p);
      if (!p) continue;
      const [x, z] = toWorld(p, stage);
      g.position.set(x, 0, z);
    }
    const frames = new Map(propsAt(list, t).map((f) => [f.id, f]));
    for (const [id, g] of props.current) {
      const f = frames.get(id);
      g.visible = Boolean(f && f.opacity > 0.01);
      if (!f) continue;
      const [x, z] = toWorld(f, stage);
      g.position.set(x, 0, z);
      g.rotation.y = propYaw(f.rot);
      const mesh = g.children[0] as unknown as { material: MeshStandardMaterial } | undefined;
      if (mesh) mesh.material.opacity = Math.min(1, f.opacity);
    }
  });

  const keep = (map: Map<string, Group>, id: string) => (el: Group | null) => {
    if (el) map.set(id, el);
    else map.delete(id);
  };

  return (
    <group>
      {allProps.map((p) => (
        <PropBox key={p.id} prop={p} register={keep(props.current, p.id)} />
      ))}
      {memberIds.map((id) => (
        <Person key={id} person={people.get(id)} register={keep(bodies.current, id)} />
      ))}
    </group>
  );
}

/** Orbit with the finger or the mouse; a shortcut puts the camera back on its spot. */
function Controls({ view, stage }: { view: { kind: CameraView; n: number }; stage: Stage }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);

  useEffect(() => {
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 2;
    controls.maxDistance = 60;
    controls.target.set(...CAMERA_TARGET);
    const onChange = () => invalidate();
    controls.addEventListener('change', onChange);
    return () => {
      controls.removeEventListener('change', onChange);
      controls.dispose();
    };
  }, [controls, invalidate]);

  useEffect(() => {
    camera.position.set(...cameraPosition(view.kind, stage));
    controls.target.set(...CAMERA_TARGET);
    controls.update();
    invalidate();
  }, [view, stage, camera, controls, invalidate]);

  return null;
}
