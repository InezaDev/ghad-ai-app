import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GraphicsQuality } from '../types/ghad';

interface GlobalScene3DProps {
  graphicsQuality: GraphicsQuality;
}

const MAX_NODES = 72;
const LOW_NODES = 24;

// Module-scoped reusable objects for zero per-frame GC
const _dummy = new THREE.Object3D();
const _tempColor = new THREE.Color();

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

export const GlobalScene3D: React.FC<GlobalScene3DProps> = ({ graphicsQuality }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const qualityRef = useRef<GraphicsQuality>(graphicsQuality);
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    qualityRef.current = graphicsQuality;
  }, [graphicsQuality]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglReady(false);
      return;
    }

    const applyPixelRatio = () => {
      const cap = isSoftwareGl || qualityRef.current === 'low' ? 1 : 2;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    };

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    applyPixelRatio();

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(320, container.clientHeight || window.innerHeight);
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    setWebglReady(true);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);
    scene.fog = new THREE.FogExp2(0x030712, 0.036);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 80);
    camera.position.set(0, 1.4, 14);
    camera.lookAt(0, 0.2, 0);

    // Lighting rig (emerald, cyan & warm gold rim)
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x030712, 0.85);
    scene.add(hemiLight);

    const emeraldLight = new THREE.DirectionalLight(0x10b981, 1.9);
    emeraldLight.position.set(6, 8, 5);
    scene.add(emeraldLight);

    const goldRimLight = new THREE.DirectionalLight(0xf59e0b, 1.15);
    goldRimLight.position.set(-7, -3, -6);
    scene.add(goldRimLight);

    const disposables: Array<{ dispose: () => void }> = [envTexture];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposables.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      disposables.push(m);
      return m;
    };

    // Dual Holographic Coordinate Grids (non-overlapping vertical offsets)
    const floorGrid = new THREE.GridHelper(64, 48, 0x10b981, 0x0d3d35);
    floorGrid.position.y = -4.2;
    const floorMat = floorGrid.material;
    if (Array.isArray(floorMat)) {
      floorMat.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.42;
        disposables.push(m);
      });
    } else {
      floorMat.transparent = true;
      floorMat.opacity = 0.42;
      disposables.push(floorMat);
    }
    disposables.push(floorGrid.geometry);
    scene.add(floorGrid);

    const skyGrid = new THREE.GridHelper(64, 32, 0x38bdf8, 0x0c243a);
    skyGrid.position.y = 6.8;
    const skyMat = skyGrid.material;
    if (Array.isArray(skyMat)) {
      skyMat.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.24;
        disposables.push(m);
      });
    } else {
      skyMat.transparent = true;
      skyMat.opacity = 0.24;
      disposables.push(skyMat);
    }
    disposables.push(skyGrid.geometry);
    scene.add(skyGrid);

    // Instanced Floating Geometric Knowledge Nodes (72 Ultra / 24 Low-Power)
    const nodeGeo = trackGeo(new THREE.OctahedronGeometry(0.16, 0));
    const nodeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x064e3b,
        emissiveIntensity: 0.45,
        roughness: 0.25,
        metalness: 0.75,
      })
    );
    const instancedNodes = new THREE.InstancedMesh(nodeGeo, nodeMat, MAX_NODES);
    instancedNodes.frustumCulled = false;

    const palette = [0x10b981, 0x38bdf8, 0xf59e0b];
    const nodeSeeds: Array<{
      angle: number;
      radius: number;
      baseY: number;
      speed: number;
      bobSpeed: number;
      bobAmp: number;
      scale: number;
    }> = [];

    for (let i = 0; i < MAX_NODES; i++) {
      const golden = (i / MAX_NODES) * Math.PI * 2 * 3.1;
      const radius = 4.2 + (i % 9) * 1.15;
      const baseY = ((i % 11) - 5) * 0.72;
      const speed = (i % 2 === 0 ? 1 : -1) * (0.04 + (i % 5) * 0.014);
      const bobSpeed = 0.55 + (i % 4) * 0.18;
      const bobAmp = 0.18 + (i % 3) * 0.09;
      const scale = 0.65 + (i % 5) * 0.18;
      nodeSeeds.push({ angle: golden, radius, baseY, speed, bobSpeed, bobAmp, scale });

      _dummy.position.set(Math.cos(golden) * radius, baseY, Math.sin(golden) * radius - 3.5);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      instancedNodes.setMatrixAt(i, _dummy.matrix);
      _tempColor.setHex(palette[i % palette.length]);
      instancedNodes.setColorAt(i, _tempColor);
    }
    instancedNodes.instanceMatrix.needsUpdate = true;
    if (instancedNodes.instanceColor) instancedNodes.instanceColor.needsUpdate = true;
    instancedNodes.count = qualityRef.current === 'low' ? LOW_NODES : MAX_NODES;
    scene.add(instancedNodes);

    // 3 Distant Holographic Wireframe Crystal Beacons (composite THREE.Group)
    const beacons: THREE.Group[] = [];
    const beaconConfigs = [
      { pos: [-8.4, 2.6, -8.5] as const, color: 0x10b981, ringColor: 0x38bdf8, scale: 1.05 },
      { pos: [8.4, 1.8, -8.5] as const, color: 0x38bdf8, ringColor: 0xf59e0b, scale: 0.95 },
      { pos: [1.8, 4.9, -13.5] as const, color: 0xf59e0b, ringColor: 0x10b981, scale: 1.2 },
    ];

    const wireGeo = trackGeo(new THREE.IcosahedronGeometry(0.9, 1));
    const beaconRingGeo = trackGeo(new THREE.TorusGeometry(1.32, 0.02, 10, 48));

    beaconConfigs.forEach((cfg) => {
      const grp = new THREE.Group();
      grp.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      grp.scale.setScalar(cfg.scale);

      const coreWire = new THREE.Mesh(
        wireGeo,
        trackMat(
          new THREE.MeshBasicMaterial({
            color: cfg.color,
            wireframe: true,
            transparent: true,
            opacity: 0.22,
          })
        )
      );
      const ringA = new THREE.Mesh(
        beaconRingGeo,
        trackMat(
          new THREE.MeshBasicMaterial({
            color: cfg.ringColor,
            transparent: true,
            opacity: 0.28,
          })
        )
      );
      ringA.rotation.set(1.1, 0.4, 0);

      grp.add(coreWire, ringA);
      scene.add(grp);
      beacons.push(grp);
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Subtle mouse-driven parallax (non-blocking window listener)
    const pointerTarget = { x: 0, y: 0 };
    const onPointerMove = (e: PointerEvent) => {
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      pointerTarget.x = (e.clientX / vw - 0.5) * 2;
      pointerTarget.y = (e.clientY / vh - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(320, container.clientWidth || window.innerWidth);
      const h = Math.max(320, container.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      applyPixelRatio();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    let disposed = false;
    let frameId = 0;
    let lastTime = performance.now();
    let lastQuality: GraphicsQuality = qualityRef.current;

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
    const onContextRestored = () => {
      if (!disposed) tick();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 85);
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
          frameId = window.setTimeout(cb, 85);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const currentQuality = qualityRef.current;
      if (currentQuality !== lastQuality) {
        lastQuality = currentQuality;
        applyPixelRatio();
        instancedNodes.count = currentQuality === 'low' ? LOW_NODES : MAX_NODES;
        beacons.forEach((b, idx) => {
          b.visible = currentQuality === 'ultra' || idx === 0;
        });
      }

      const now = performance.now();
      const delta = Math.min(0.05, (now - lastTime) * 0.001);
      lastTime = now;
      const elapsed = prefersReducedMotion ? 0 : now * 0.001;

      // Update instanced geometric nodes
      const activeCount = instancedNodes.count;
      for (let i = 0; i < activeCount; i++) {
        const s = nodeSeeds[i];
        const angle = s.angle + elapsed * s.speed;
        _dummy.position.set(
          Math.cos(angle) * s.radius,
          s.baseY + Math.sin(elapsed * s.bobSpeed + i) * s.bobAmp,
          Math.sin(angle) * s.radius - 4.2
        );
        _dummy.rotation.set(elapsed * 0.4 + i * 0.3, elapsed * 0.55 + i, 0);
        _dummy.scale.setScalar(s.scale);
        _dummy.updateMatrix();
        instancedNodes.setMatrixAt(i, _dummy.matrix);
      }
      instancedNodes.instanceMatrix.needsUpdate = true;

      // Slowly drift coordinate grids & beacons
      floorGrid.position.z = ((elapsed * 0.45) % 1.333) - 2;
      skyGrid.position.z = -((elapsed * 0.32) % 2.0) - 2;

      beacons.forEach((grp, idx) => {
        if (!grp.visible) return;
        grp.rotation.y = elapsed * (0.14 + idx * 0.05);
        grp.rotation.x = Math.sin(elapsed * 0.25 + idx) * 0.12;
      });

      // Damped mouse-driven 3D camera parallax
      const targetCamX = pointerTarget.x * 1.15;
      const targetCamY = 1.4 - pointerTarget.y * 0.65;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamX, 3.6, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamY, 3.6, delta);
      camera.lookAt(0, 0.2, -2);

      renderer.render(scene, camera);

      if (isSoftwareGl || currentQuality === 'low') {
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
      window.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      id="globalScene3D"
      data-testid="global-scene-3d"
      data-graphics={graphicsQuality}
      data-webgl-ready={String(webglReady)}
      aria-hidden="true"
      className="no-print pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#030712]"
    >
      <div ref={mountRef} className="w-full h-full" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(3, 7, 18, 0.34) 24%, rgba(3, 7, 18, 0.72) 100%)',
        }}
      />
    </div>
  );
};
