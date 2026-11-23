import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

type CameraPreset = 'hero' | 'top' | 'detail';

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; look: [number, number, number] }> = {
  hero: { pos: [3.2, 2.35, 4.15], look: [0, 0.72, 0] },
  top: { pos: [0.05, 4.4, 1.35], look: [0, 0.52, 0] },
  detail: { pos: [-2.4, 1.85, 3.3], look: [0, 0.76, 0] },
};

// Module-scoped reusable helpers (zero per-frame GC in animation loop)
const _dummy = new THREE.Object3D();
const _tempColor = new THREE.Color();
const _targetCamPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _currentLook = new THREE.Vector3(0, 0.72, 0);

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createRebPageTexture(side: 'left' | 'right', maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Ivory A4 paper base
    ctx.fillStyle = '#fcfbf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle paper margin rule
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

    // Header band in REB Emerald
    ctx.fillStyle = '#ecfdf5';
    ctx.fillRect(34, 38, canvas.width - 68, 56);
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 38, canvas.width - 68, 56);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(
      side === 'left' ? 'REB CBC · IDENTIFICATION' : 'CBC TEACHING STAGES',
      50,
      72
    );

    if (side === 'left') {
      // Identification grid rows
      const rows = [
        ['Term / Date', 'Term 1 · P1–S6'],
        ['Subject', 'Mathematics / SRS'],
        ['Unit Title', 'Competence Unit'],
        ['Key Competence', 'To apply & explain'],
        ['Objective', 'Condition · Who · Action'],
        ['Materials & SEN', 'Adapted visual aids'],
      ];
      let y = 122;
      rows.forEach(([label, val], idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
        ctx.fillRect(34, y, canvas.width - 68, 66);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.25;
        ctx.strokeRect(34, y, canvas.width - 68, 66);

        ctx.fillStyle = '#15803d';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(label, 48, y + 26);

        ctx.fillStyle = '#334155';
        ctx.font = '15px sans-serif';
        ctx.fillText(val, 48, y + 50);
        y += 74;
      });
    } else {
      // 3-stage numbered timeline cards
      const stages = [
        { badge: "Intro · 5'", color: '#0284c7', lines: ['1. Greet & verify SEN seating', '2. Prior knowledge check'] },
        { badge: "Body · 30'", color: '#15803d', lines: ['1. Group discovery task', '2. Board synthesis & practice'] },
        { badge: "Concl · 5'", color: '#d97706', lines: ['1. Summary & exit quiz', '2. Homework & self-eval'] },
      ];
      let y = 122;
      stages.forEach((st) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(34, y, canvas.width - 68, 136);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.25;
        ctx.strokeRect(34, y, canvas.width - 68, 136);

        ctx.fillStyle = st.color;
        ctx.fillRect(48, y + 16, 118, 28);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(st.badge, 60, y + 36);

        ctx.fillStyle = '#0f172a';
        ctx.font = '16px sans-serif';
        st.lines.forEach((line, lIdx) => {
          ctx.fillText(line, 48, y + 76 + lIdx * 32);
        });
        y += 154;
      });
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso || 1);
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 122);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.16)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const HeroScene3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const presetRef = useRef<CameraPreset>('hero');
  const dragRotationRef = useRef({ yaw: 0, pitch: 0 });
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const [preset, setPreset] = useState<CameraPreset>('hero');
  const [controlsOpen, setControlsOpen] = useState(true);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const selectPreset = (next: CameraPreset) => {
    presetRef.current = next;
    setPreset(next);
    dragRotationRef.current = { yaw: 0, pitch: 0 };
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(280, container.clientWidth);
    const height = Math.max(260, container.clientHeight);
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 60);
    camera.position.set(...CAMERA_PRESETS.hero.pos);
    camera.lookAt(...CAMERA_PRESETS.hero.look);

    // 3-point warm/cool studio lighting rig (<= 3 shadow casters)
    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    keyLight.position.set(4.5, 6.5, 4.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-4.5, 3.2, -3.5);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const leftPageTex = createRebPageTexture('left', maxAniso);
    const rightPageTex = createRebPageTexture('right', maxAniso);
    const shadowTex = createContactShadowTexture();

    const disposables: Array<{ dispose: () => void }> = [leftPageTex, rightPageTex, shadowTex, envTexture];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposables.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      disposables.push(m);
      return m;
    };

    // Soft contact shadow plane
    const contactShadow = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(4.2, 4.2)),
      trackMat(
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.55,
        })
      )
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.01;
    scene.add(contactShadow);

    // Composite Hero Academic Centerpiece (THREE.Group, grounded bottom-center at y=0)
    const assembly = new THREE.Group();
    scene.add(assembly);

    // 1. Sculpted circular slate pedestal + gold ring trim
    const baseMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72, metalness: 0.14 })
    );
    const goldMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xf59e0b,
        roughness: 0.2,
        metalness: 0.92,
        clearcoat: 0.5,
      })
    );
    const emeraldMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.56, metalness: 0.08 })
    );
    const skyMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.38, metalness: 0.22 })
    );
    const paperMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xfaf7f0, roughness: 0.88, metalness: 0.0 })
    );

    const plinth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.48, 1.62, 0.16, 48)), baseMat);
    plinth.position.y = 0.08;
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    assembly.add(plinth);

    const trimRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.5, 0.028, 16, 64)), goldMat);
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.y = 0.165;
    assembly.add(trimRing);

    // 2. Angled Brass Display Cradle
    const cradle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.07, 0.88)), goldMat);
    cradle.position.set(0, 0.22, -0.05);
    cradle.rotation.x = 0.22;
    cradle.castShadow = true;
    assembly.add(cradle);

    // 3. Open REB CBC Folio Book Group
    const bookGroup = new THREE.Group();
    bookGroup.position.set(0, 0.62, -0.02);
    bookGroup.rotation.x = 0.42;
    assembly.add(bookGroup);

    // Hardcover spine
    const spine = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 1.56, 20)), goldMat);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, -0.03, 0);
    spine.castShadow = true;
    bookGroup.add(spine);

    // Left cover & page block
    const leftBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.12, 0.045, 1.52)), emeraldMat);
    leftBoard.position.set(-0.58, 0.02, 0);
    leftBoard.rotation.z = -0.14;
    leftBoard.castShadow = true;
    bookGroup.add(leftBoard);

    const leftPages = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.04, 0.075, 1.44)),
      [
        paperMat,
        paperMat,
        trackMat(new THREE.MeshStandardMaterial({ map: leftPageTex, roughness: 0.78, metalness: 0.0 })),
        paperMat,
        paperMat,
        paperMat,
      ]
    );
    leftPages.position.set(-0.56, 0.072, 0);
    leftPages.rotation.z = -0.14;
    leftPages.castShadow = true;
    leftPages.receiveShadow = true;
    bookGroup.add(leftPages);

    // Right cover & page block
    const rightBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.12, 0.045, 1.52)), emeraldMat);
    rightBoard.position.set(0.58, 0.02, 0);
    rightBoard.rotation.z = 0.14;
    rightBoard.castShadow = true;
    bookGroup.add(rightBoard);

    const rightPages = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.04, 0.075, 1.44)),
      [
        paperMat,
        paperMat,
        trackMat(new THREE.MeshStandardMaterial({ map: rightPageTex, roughness: 0.78, metalness: 0.0 })),
        paperMat,
        paperMat,
        paperMat,
      ]
    );
    rightPages.position.set(0.56, 0.072, 0);
    rightPages.rotation.z = 0.14;
    rightPages.castShadow = true;
    rightPages.receiveShadow = true;
    bookGroup.add(rightPages);

    // Bookmark satin ribbon curving from spine
    const ribbonCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.08, 0.25),
      new THREE.Vector3(0.08, 0.11, 0.65),
      new THREE.Vector3(0.16, 0.02, 0.92),
    ]);
    const ribbon = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(ribbonCurve, 20, 0.022, 8, false)),
      skyMat
    );
    ribbon.castShadow = true;
    bookGroup.add(ribbon);

    // 4. Fountain Stylus resting on pedestal front-right
    const stylusGroup = new THREE.Group();
    stylusGroup.position.set(0.75, 0.21, 0.86);
    stylusGroup.rotation.y = -0.45;
    stylusGroup.rotation.z = Math.PI / 2;
    const penBody = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.03, 0.78, 16)), skyMat);
    penBody.castShadow = true;
    const penNib = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.03, 0.14, 16)), goldMat);
    penNib.position.y = 0.46;
    const penCapRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.034, 0.008, 8, 24)), goldMat);
    penCapRing.rotation.x = Math.PI / 2;
    penCapRing.position.y = 0.12;
    stylusGroup.add(penBody, penNib, penCapRing);
    assembly.add(stylusGroup);

    // 5. Orbital Curriculum Gyro Rings & Instanced Knowledge Nodes (24 nodes)
    const orbitGroup = new THREE.Group();
    orbitGroup.position.set(0, 0.88, 0);
    assembly.add(orbitGroup);

    const outerOrbit = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.62, 0.014, 12, 96)), skyMat);
    outerOrbit.rotation.set(1.18, 0.35, 0);
    orbitGroup.add(outerOrbit);

    const innerOrbit = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.38, 0.012, 12, 84)), goldMat);
    innerOrbit.rotation.set(-1.12, -0.42, 0.2);
    orbitGroup.add(innerOrbit);

    const nodeCount = 24;
    const nodeGeo = trackGeo(new THREE.OctahedronGeometry(0.055, 0));
    const nodeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.68 })
    );
    const instancedNodes = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount);
    const palette = [0x15803d, 0x0284c7, 0xf59e0b];
    const nodeOrbits: Array<{ radius: number; angle: number; speed: number; tilt: number; scale: number }> = [];

    for (let i = 0; i < nodeCount; i++) {
      const ringA = i % 2 === 0;
      const radius = ringA ? 1.62 : 1.38;
      const angle = (i / nodeCount) * Math.PI * 2;
      const speed = (ringA ? 0.22 : -0.28) * (0.85 + (i % 3) * 0.1);
      const tilt = ringA ? 0.42 : -0.38;
      const scale = 0.82 + (i % 4) * 0.14;
      nodeOrbits.push({ radius, angle, speed, tilt, scale });

      _dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * tilt, Math.sin(angle) * radius);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      instancedNodes.setMatrixAt(i, _dummy.matrix);

      _tempColor.setHex(palette[i % palette.length]);
      instancedNodes.setColorAt(i, _tempColor);
    }
    instancedNodes.instanceMatrix.needsUpdate = true;
    if (instancedNodes.instanceColor) instancedNodes.instanceColor.needsUpdate = true;
    instancedNodes.computeBoundingSphere();
    instancedNodes.frustumCulled = false;
    orbitGroup.add(instancedNodes);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Pointer interaction (smooth drag tilt, zero scroll hijacking)
    const onPointerDown = (e: PointerEvent) => {
      isDraggingRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      dragRotationRef.current.yaw = THREE.MathUtils.clamp(
        dragRotationRef.current.yaw + dx * 0.006,
        -1.1,
        1.1
      );
      dragRotationRef.current.pitch = THREE.MathUtils.clamp(
        dragRotationRef.current.pitch + dy * 0.004,
        -0.35,
        0.35
      );
    };
    const onPointerUp = () => {
      isDraggingRef.current = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // ResizeObserver for crisp responsive sizing
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(280, container.clientWidth);
      const h = Math.max(260, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    // Animation loop with software WebGL pacing via afterDraw
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(0.05, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      // Gentle breathing float on book cradle + steady rotation with pointer damping
      bookGroup.position.y = 0.62 + Math.sin(elapsed * 1.4) * 0.025;
      const targetYaw = dragRotationRef.current.yaw + Math.sin(elapsed * 0.38) * 0.16;
      const targetPitch = dragRotationRef.current.pitch;
      assembly.rotation.y = THREE.MathUtils.damp(assembly.rotation.y, targetYaw, 5.5, delta);
      assembly.rotation.x = THREE.MathUtils.damp(assembly.rotation.x, targetPitch, 5.5, delta);

      // Orbit rings & instanced nodes
      outerOrbit.rotation.z = elapsed * 0.16;
      innerOrbit.rotation.z = -elapsed * 0.21;
      for (let i = 0; i < nodeCount; i++) {
        const cfg = nodeOrbits[i];
        const a = cfg.angle + elapsed * cfg.speed;
        _dummy.position.set(
          Math.cos(a) * cfg.radius,
          Math.sin(a * 1.2) * 0.42 * cfg.tilt,
          Math.sin(a) * cfg.radius
        );
        _dummy.rotation.set(elapsed * 0.8 + i, elapsed * 0.5, 0);
        _dummy.scale.setScalar(cfg.scale);
        _dummy.updateMatrix();
        instancedNodes.setMatrixAt(i, _dummy.matrix);
      }
      instancedNodes.instanceMatrix.needsUpdate = true;

      // Smooth damped camera preset transitions
      const p = CAMERA_PRESETS[presetRef.current];
      _targetCamPos.set(p.pos[0], p.pos[1], p.pos[2]);
      _targetLook.set(p.look[0], p.look[1], p.look[2]);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, 5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, 5, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, 5, delta);
      _currentLook.x = THREE.MathUtils.damp(_currentLook.x, _targetLook.x, 5, delta);
      _currentLook.y = THREE.MathUtils.damp(_currentLook.y, _targetLook.y, 5, delta);
      _currentLook.z = THREE.MathUtils.damp(_currentLook.z, _targetLook.z, 5, delta);
      camera.lookAt(_currentLook);

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
    };
  }, []);

  if (webglUnavailable) {
    return (
      <div className="w-full h-[320px] sm:h-[360px] rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] grid place-items-center p-6 text-center">
        <div className="space-y-1.5">
          <div className="text-sm font-bold text-[var(--text)]">Interactive 3D REB CBC Showcase</div>
          <p className="text-xs text-[var(--muted)]">
            3D WebGL preview is unavailable on this device — all lesson planning tools work cleanly below.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[320px] sm:h-[370px] rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[#0f172a] via-[#111c33] to-[#0f172a] overflow-hidden shadow-lg select-none">
      {/* Top-left static spec label */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md bg-[#0f172a]/90 border border-[#334155] text-[11px] font-semibold text-slate-100">
        Interactive 3D CBC Folio · Drag to inspect
      </div>

      {/* Isolated WebGL canvas mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Collapsible Bottom Control Dock (solid/rgba surface — NO backdrop-blur over WebGL) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[94%]">
        <button
          type="button"
          onClick={() => setControlsOpen((o) => !o)}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold rounded-t-lg border border-b-0 border-[#334155] bg-[#1e293b] text-slate-200 hover:text-white cursor-pointer"
        >
          {controlsOpen ? (
            <>
              <ChevronDown className="w-3 h-3" />
              <span>Hide 3D Controls</span>
            </>
          ) : (
            <>
              <ChevronUp className="w-3 h-3" />
              <span>Show 3D Controls</span>
            </>
          )}
        </button>

        {controlsOpen && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#334155] bg-[#0f172a]/95 shadow-lg">
            {(
              [
                { id: 'hero', label: '3D Folio' },
                { id: 'top', label: 'Top Plan' },
                { id: 'detail', label: 'CBC Rings' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectPreset(item.id)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  preset === item.id
                    ? 'bg-[#15803D] text-white'
                    : 'bg-[#1e293b] text-slate-300 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => selectPreset('hero')}
              title="Reset 3D angle"
              className="p-1.5 rounded-lg bg-[#1e293b] text-slate-300 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
