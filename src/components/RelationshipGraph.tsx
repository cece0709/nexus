import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef, ReactNode, RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import { Maximize, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import './RelationshipGraph.css';

export interface GraphPerson {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface GraphRelation {
  sourceId: string;
  targetId: string;
  status: string;
}

interface RelationshipGraphProps {
  people: GraphPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter?: string;
  compact?: boolean;
  relations?: GraphRelation[];
  reducedMotion?: boolean;
}

type Position = [number, number, number];
type ViewCommand = { kind: 'in' | 'out' | 'reset'; sequence: number };
type LabelElements = RefObject<Map<string, HTMLButtonElement>>;

let webglSupported: boolean | undefined;
function detectWebGL() {
  if (webglSupported !== undefined) return webglSupported;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    webglSupported = Boolean(context);
    // This temporary capability check must not retain an extra GPU context.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { webglSupported = false; }
  return webglSupported;
}

const isSelf = (id: string) => id === 'me' || id === 'self';
function getSelf(people: GraphPerson[]): GraphPerson {
  return people.find((p) => p.id === 'me') || people.find((p) => p.id === 'self') || { id: 'me', name: '我', role: '记忆中心', color: '#5defd0' };
}

function visibleEdges(people: GraphPerson[], relations: GraphRelation[] | undefined, selfId: string) {
  const ids = new Set([...people.map((person) => person.id), selfId]);
  return (relations ?? people.filter((p) => !isSelf(p.id)).map((p) => ({ sourceId: selfId, targetId: p.id, status: 'inferred' })))
    .map((edge) => ({ ...edge, sourceId: isSelf(edge.sourceId) ? selfId : edge.sourceId, targetId: isSelf(edge.targetId) ? selfId : edge.targetId }))
    .filter((edge) => edge.sourceId !== edge.targetId && ids.has(edge.sourceId) && ids.has(edge.targetId));
}

// Positions remain stable when filtering, so a person never jumps to another orbit.
const ORBIT_POSITIONS: Position[] = [
  [-2.85, 0.8, -1.1], [0.4, 1.4, -3.0], [2.8, 0.6, -1.8],
  [3.1, 0.25, 1.35], [1.4, -0.4, 2.5], [-1.25, -0.3, 2.65],
  [-3.2, -0.15, 1.6], [-0.6, 1.95, -0.9], [3.65, 1.2, -0.2],
  [-2.1, 1.8, -2.4], [0, -0.65, 3.6], [1.9, 1.3, -3.3],
];

function getPosition(index: number): Position {
  if (index < ORBIT_POSITIONS.length) return ORBIT_POSITIONS[index];
  const angle = index * 2.39996;
  const radius = 3.2 + (index % 3) * 0.35;
  return [Math.cos(angle) * radius, Math.sin(index * 0.8) * 0.7, Math.sin(angle) * radius];
}

function Dust({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const points = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
      const a = i * 2.399963;
      const r = 2 + ((i * 17) % 113) / 113 * 6;
      points[i * 3] = Math.cos(a) * r;
      points[i * 3 + 1] = ((i * 37) % 101) / 101 * 6 - 2.5;
      points[i * 3 + 2] = Math.sin(a) * r;
    }
    return points;
  }, []);
  useFrame(({ clock }) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y = clock.elapsedTime * 0.006;
  });
  return <points ref={ref}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial size={0.018} color="#76c6da" transparent opacity={0.48} depthWrite={false} sizeAttenuation />
  </points>;
}

function OrbitalRings({ reducedMotion }: { reducedMotion: boolean }) {
  const rings = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (rings.current && !reducedMotion) rings.current.rotation.z = clock.elapsedTime * 0.012;
  });
  return <group position={[0, -0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <group ref={rings}>
      {[1.3, 2.55, 3.8, 4.05].map((radius, i) => <mesh key={radius}>
        <torusGeometry args={[radius, i === 3 ? 0.006 : 0.009, 5, 144]} />
        <meshBasicMaterial color="#49e1d0" transparent opacity={i === 3 ? 0.07 : 0.11} depthWrite={false} />
      </mesh>)}
      {Array.from({ length: 64 }, (_, i) => {
        const a = i / 64 * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(a) * 3.82, Math.sin(a) * 3.82, 0]} rotation={[0, 0, a]}>
          <boxGeometry args={[i % 8 === 0 ? 0.13 : 0.045, 0.009, 0.005]} />
          <meshBasicMaterial color="#8beadf" transparent opacity={i % 8 === 0 ? 0.5 : 0.15} />
        </mesh>;
      })}
    </group>
    <mesh><circleGeometry args={[3.8, 96]} /><meshBasicMaterial color="#0a777b" transparent opacity={0.018} depthWrite={false} /></mesh>
  </group>;
}

function Connection({ start, end, color, selected, index, reducedMotion, inferred }: {
  start: Position; end: Position; color: string; selected: boolean; index: number; reducedMotion: boolean; inferred: boolean;
}) {
  const particle = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(...start),
    new THREE.Vector3((start[0] + end[0]) * 0.5, Math.max(0.5, start[1], end[1]) + 0.25, (start[2] + end[2]) * 0.5),
    new THREE.Vector3(...end),
  ]), [start, end]);
  const points = useMemo(() => curve.getPoints(40), [curve]);
  useFrame(({ clock }) => {
    if (!particle.current) return;
    const t = reducedMotion ? 0.65 : (clock.elapsedTime * 0.13 + index * 0.17) % 1;
    particle.current.position.copy(curve.getPoint(t));
  });
  return <group>
    <Line points={points} color={inferred ? '#c7a376' : color} transparent opacity={selected ? 0.8 : inferred ? 0.28 : 0.21}
      lineWidth={selected ? 1.8 : 0.8} dashed={inferred} dashSize={0.11} gapSize={0.08} />
    <mesh ref={particle}>
      <sphereGeometry args={[selected ? 0.035 : 0.021, 8, 8]} />
      <meshBasicMaterial color={inferred ? '#c7a376' : color} transparent opacity={selected ? 1 : 0.55} />
    </mesh>
  </group>;
}

function PersonNode({ person, position, selected, self, onSelect, reducedMotion }: {
  person: GraphPerson; position: Position; selected: boolean; self?: boolean;
  onSelect: (id: string) => void; reducedMotion: boolean;
}) {
  const halo = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const active = selected || hovered;
  const size = self ? 0.37 : 0.19;
  useFrame(({ clock }) => {
    if (halo.current) {
      const scale = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 1.6 + position[0]) * 0.07;
      halo.current.scale.setScalar(scale);
    }
  });
  return <group position={position}>
    <mesh ref={halo}>
      <sphereGeometry args={[size * (self ? 2.0 : 2.4), 24, 16]} />
      <meshBasicMaterial color={person.color} transparent opacity={active || self ? 0.08 : 0.035} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    <mesh onClick={(e) => { e.stopPropagation(); onSelect(person.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
      <sphereGeometry args={[size, 32, 24]} />
      <meshStandardMaterial color={self ? '#123d42' : '#173039'} emissive={person.color}
        emissiveIntensity={active ? 1.15 : self ? 0.5 : 0.26} roughness={0.2} metalness={0.7} />
    </mesh>
    <mesh rotation={[Math.PI / 2.5, 0.1, 0.25]}>
      <torusGeometry args={[size * 1.5, active ? 0.014 : 0.008, 5, 64]} />
      <meshBasicMaterial color={person.color} transparent opacity={active || self ? 0.75 : 0.32} />
    </mesh>
    {(self || active) && <mesh rotation={[Math.PI / 2.5 + 0.4, -0.4, 0.1]}>
      <torusGeometry args={[size * 1.9, 0.005, 5, 64]} />
      <meshBasicMaterial color={person.color} transparent opacity={0.25} />
    </mesh>}
  </group>;
}

// Keep labels in the application's existing DOM root. Drei Html creates separate
// React roots; avoiding those also makes switching between 3D and fallback atomic.
function ProjectLabels({ positions, labels }: { positions: Map<string, Position>; labels: LabelElements }) {
  const { camera, size } = useThree();
  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    camera.updateMatrixWorld();
    for (const [id, position] of positions) {
      const element = labels.current.get(id);
      if (!element) continue;
      projected.set(...position).project(camera);
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      const visible = projected.z > -1 && projected.z < 1 && x > -60 && x < size.width + 60 && y > -40 && y < size.height;
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-14px)`;
      element.style.zIndex = String(100 - Math.round(projected.z * 50));
    }
  });
  return null;
}

function ContextLossGuard({ onLost }: { onLost: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => { event.preventDefault(); onLost(); };
    canvas.addEventListener('webglcontextlost', handleLost);
    return () => canvas.removeEventListener('webglcontextlost', handleLost);
  }, [gl, onLost]);
  return null;
}

function Scene({ people, allPeople, selectedId, onSelect, reducedMotion, command, paused, relations, onContextLost, labelElements }: {
  people: GraphPerson[]; allPeople: GraphPerson[]; selectedId: string | null;
  onSelect: (id: string) => void; reducedMotion: boolean; command: ViewCommand; paused: boolean;
  relations?: GraphRelation[]; onContextLost: () => void;
  labelElements: LabelElements;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const self = getSelf(allPeople);
  const positions = useMemo(() => {
    const map = new Map<string, Position>([[self.id, [0, 0.4, 0]]]);
    allPeople.filter((p) => !isSelf(p.id)).forEach((p, i) => map.set(p.id, getPosition(i)));
    return map;
  }, [allPeople, self.id]);
  const edges = useMemo(() => visibleEdges(people, relations, self.id), [people, relations, self.id]);
  useEffect(() => {
    if (!controls.current) return;
    if (command.kind === 'reset') {
      camera.position.set(0, 4.7, 9.7);
      controls.current.target.set(0, 0.25, 0);
    } else {
      const target = controls.current.target;
      const vector = camera.position.clone().sub(target);
      const length = THREE.MathUtils.clamp(vector.length() * (command.kind === 'in' ? 0.82 : 1.22), 6, 16);
      camera.position.copy(target).add(vector.setLength(length));
    }
    controls.current.update();
  }, [command, camera]);
  return <>
    <ContextLossGuard onLost={onContextLost} />
    <ambientLight intensity={1.1} />
    <pointLight position={[0, 4, 2]} intensity={4} color="#7df7e6" />
    <fog attach="fog" args={['#070f18', 11, 24]} />
    <Dust reducedMotion={reducedMotion || paused} />
    <OrbitalRings reducedMotion={reducedMotion || paused} />
    {edges.map((edge, index) => <Connection key={`${edge.sourceId}-${edge.targetId}-${index}`}
      start={positions.get(edge.sourceId)!} end={positions.get(edge.targetId)!}
      color={people.find((person) => person.id === edge.targetId)?.color ?? '#61d7c5'}
      selected={selectedId === edge.sourceId || selectedId === edge.targetId} index={index}
      reducedMotion={reducedMotion || paused} inferred={edge.status !== 'confirmed'} />)}
    {people.filter((p) => !isSelf(p.id)).map((person) => <PersonNode key={person.id} person={person}
      position={positions.get(person.id)!} selected={selectedId === person.id} onSelect={onSelect} reducedMotion={reducedMotion || paused} />)}
    <PersonNode person={self} position={[0, 0.4, 0]} selected={selectedId === self.id} self onSelect={onSelect} reducedMotion={reducedMotion || paused} />
    <ProjectLabels positions={positions} labels={labelElements} />
    <OrbitControls ref={controls} target={[0, 0.25, 0]} enablePan={false} enableDamping dampingFactor={0.06}
      autoRotate={!paused && !reducedMotion} autoRotateSpeed={0.17} minDistance={6} maxDistance={16}
      minPolarAngle={0.45} maxPolarAngle={Math.PI / 2.1} />
  </>;
}

class GraphBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFailed: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailed(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function FlatGraph({ people, selectedId, onSelect, relations, command }: Pick<RelationshipGraphProps, 'people' | 'selectedId' | 'onSelect' | 'relations'> & { command: ViewCommand }) {
  const { t: tx } = useI18n();
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom((value) => command.kind === 'reset' ? 1 : THREE.MathUtils.clamp(value * (command.kind === 'in' ? 1.15 : 0.87), 0.6, 1.6)), [command]);
  const self = getSelf(people);
  const others = people.filter((p) => !isSelf(p.id));
  const edges = visibleEdges(people, relations, self.id);
  const point = (id: string) => {
    const index = others.findIndex((p) => p.id === id);
    if (index === -1) return { x: 350, y: 225 };
    const angle = index / Math.max(1, others.length) * Math.PI * 2 - Math.PI / 2;
    return { x: 350 + Math.cos(angle) * 245, y: 225 + Math.sin(angle) * 145 };
  };
  return <div className="nx-flat-graph" style={{ transform: `scale(${zoom})` }}>
    <svg viewBox="0 0 700 450" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <ellipse cx="350" cy="225" rx="250" ry="155" fill="none" stroke="#6ff5dc" strokeOpacity=".12" />
      <ellipse cx="350" cy="225" rx="180" ry="110" fill="none" stroke="#6ff5dc" strokeOpacity=".08" />
      {edges.map((edge, index) => {
        const start = point(edge.sourceId), end = point(edge.targetId);
        return <path key={`${edge.sourceId}-${edge.targetId}-${index}`}
          d={`M${start.x},${start.y} Q${(start.x + end.x) / 2 + 20},${(start.y + end.y) / 2 - 10} ${end.x},${end.y}`}
          fill="none" stroke={edge.status === 'confirmed' ? '#61d7c5' : '#c7a376'} strokeDasharray={edge.status === 'confirmed' ? undefined : '5 5'}
          strokeOpacity={selectedId === edge.targetId || selectedId === edge.sourceId ? .8 : .25} />;
      })}
    </svg>
    <button className="nx-flat-self" onClick={() => onSelect(self.id)} aria-label={tx('查看我的记忆中心')}>{tx('我')}<span>{tx('记忆中心')}</span></button>
    {others.map((person, index) => {
      const angle = index / Math.max(1, others.length) * Math.PI * 2 - Math.PI / 2;
      return <button key={person.id} className={`nx-flat-person ${selectedId === person.id ? 'is-selected' : ''}`}
        style={{ left: `${50 + Math.cos(angle) * 35}%`, top: `${50 + Math.sin(angle) * 32}%`, '--node-color': person.color } as React.CSSProperties}
        onClick={() => onSelect(person.id)} aria-pressed={selectedId === person.id}>
        <i>{person.name.slice(0, 1)}</i><strong>{person.name}</strong><small>{person.role}</small>
      </button>;
    })}
    <span className="nx-flat-notice">{tx('当前设备无法启用 WebGL · 已切换到可交互 2D 视图')}</span>
  </div>;
}

export default function RelationshipGraph({ people, selectedId, onSelect, filter, compact = false, relations, reducedMotion: requestedReducedMotion = false }: RelationshipGraphProps) {
  const { t: tx } = useI18n();
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState<ViewCommand>({ kind: 'reset', sequence: 0 });
  const wrapper = useRef<HTMLDivElement>(null);
  const labelElements = useRef(new Map<string, HTMLButtonElement>());
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reducedMotion = systemReducedMotion || requestedReducedMotion;
  const [contextLost, setContextLost] = useState(false);
  const [canRenderWebGL] = useState(detectWebGL);
  const handleContextLost = useCallback(() => setContextLost(true), []);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const visiblePeople = useMemo(() => people.filter((p) => isSelf(p.id) || !filter || ['all', '全部', '全部关系'].includes(filter) || p.role === filter), [people, filter]);
  const fallback = <FlatGraph people={visiblePeople} selectedId={selectedId} onSelect={onSelect} relations={relations} command={command} />;
  const webglAvailable = !contextLost && canRenderWebGL;
  const self = getSelf(people);
  const labelPeople = [self, ...visiblePeople.filter((p) => !isSelf(p.id))];
  const issueCommand = (kind: ViewCommand['kind']) => setCommand((previous) => ({ kind, sequence: previous.sequence + 1 }));
  return <div ref={wrapper} className={`nx-relationship-graph ${compact ? 'is-compact' : ''}`}>
    <div className="nx-graph-vignette" aria-hidden="true" />
    <div className="nx-graph-status"><span /><div>{tx('关系宇宙')}<small>PERSONAL RELATIONSHIP NEXUS</small></div></div>
    <div className="nx-graph-count"><b>{visiblePeople.filter((p) => !isSelf(p.id)).length.toString().padStart(2, '0')}</b><span>{tx('位记忆人物')}</span></div>
    <GraphBoundary fallback={fallback} onFailed={handleContextLost}>
      {webglAvailable ? <div className="nx-graph-3d">
        <Canvas camera={{ position: [0, 4.7, 9.7], fov: compact ? 48 : 43 }} dpr={[1, 1.5]} frameloop={paused || reducedMotion ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        onCreated={({ gl }) => { gl.setClearColor('#070f18', 0); }}>
        <Scene people={visiblePeople} allPeople={people} selectedId={selectedId} onSelect={onSelect}
          reducedMotion={reducedMotion} command={command} paused={paused} relations={relations} onContextLost={handleContextLost} labelElements={labelElements} />
        </Canvas>
        <div className="nx-projected-labels">
          {labelPeople.map((person) => <button key={person.id} type="button"
            ref={(element) => { if (element) labelElements.current.set(person.id, element); else labelElements.current.delete(person.id); }}
            className={`nx-projected-node ${isSelf(person.id) ? 'is-self' : ''} ${selectedId === person.id ? 'is-selected' : ''}`}
            style={{ '--node-color': person.color } as React.CSSProperties}
            onClick={() => onSelect(person.id)} aria-label={tx('查看{name}的人物档案', { name: person.name })} aria-pressed={selectedId === person.id}>
            <span className="nx-projected-initial">{isSelf(person.id) ? tx('我') : person.name.slice(-2, -1) || person.name[0]}</span>
            <span className="nx-node-label"><strong>{person.name}</strong><small>{isSelf(person.id) ? 'PERSONAL NEXUS' : person.role}</small></span>
          </button>)}
        </div>
      </div> : fallback}
    </GraphBoundary>
    <div className="nx-graph-legend"><span><i className="nx-legend-cyan" />{tx('实线 · 已确认关系')}</span><span><i className="nx-legend-amber" />{tx('虚线 · 待确认推断')}</span></div>
    <div className="nx-graph-controls" aria-label={tx('关系图视角控制')}>
      <button onClick={() => issueCommand('in')} aria-label={tx('放大关系图')} title={tx('放大')}><Plus size={15} /></button>
      <button onClick={() => issueCommand('out')} aria-label={tx('缩小关系图')} title={tx('缩小')}><Minus size={15} /></button>
      <span />
      <button onClick={() => issueCommand('reset')} aria-label={tx('重置关系图视角')} title={tx('重置视角')}><RotateCcw size={14} /></button>
      <button disabled={!webglAvailable || reducedMotion} onClick={() => setPaused((p) => !p)} aria-label={paused ? tx('继续图谱动画') : tx('暂停图谱动画')} title={!webglAvailable || reducedMotion ? tx('当前视图已关闭动态效果') : paused ? tx('继续动画') : tx('暂停动画')}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>
      <button onClick={() => { if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); } else { void wrapper.current?.requestFullscreen?.().catch(() => {}); } }} aria-label={tx('全屏显示关系图')} title={tx('全屏')}><Maximize size={14} /></button>
    </div>
    <div className="nx-graph-hint">{tx('拖动旋转')} <span>·</span> {tx('滚轮缩放')} <span>·</span> {tx('点击探索')}</div>
  </div>;
}
