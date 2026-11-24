import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Cpu } from 'lucide-react';
import { GraphicsQuality, Lang } from '../types/ghad';
import { translate } from '../i18n/translations';

interface AiCore3DProps {
  isGenerating: boolean;
  graphicsQuality: GraphicsQuality;
  lang: Lang;
}

const MOTE_COUNT = 16;
const _moteDummy = new THREE.Object3D();

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

export const AiCore3D: React.FC<AiCore3DProps> = ({
  isGenerating,
  graphicsQuality,
  lang,
}) => {
  const t = (k: string) => translate(lang, k);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const generatingRef = useRef(isGenerating);
  const qualityRef = useRef<GraphicsQuality>(graphicsQuality);
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    generatingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    qualityRef.current = graphicsQuality;
  }, [graphicsQuality]);

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
      setWebglReady(false);
      return;
    }

    const applyPixelRatio = () => {
      const cap = isSoftwareGl || qualityRef.current === 'low' ? 1 : 2;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    };

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    applyPixelRatio();

    const width = Math.max(96, container.clientWidth || 132);
    const height = Math.max(96, container.clientHeight || 104);
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    setWebglReady(true);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 30);
    camera.position.set(0, 0.35, 4.35);
    camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0x38bdf8, 0.9);
    const keyLight = new THREE.DirectionalLight(0x10b981, 2.2);
    keyLight.position.set(3, 4, 3);
    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.2);
    rimLight.position.set(-3, -2, -2);
    scene.add(ambient, keyLight, rimLight);

    const disposables: Array<{ dispose: () => void }> = [];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposables.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      disposables.push(m);
      return m;
    };

    // Composite Holographic AI Core Group
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // 1. Outer geodesic wireframe icosahedron
    const wireMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        wireframe: true,
        transparent: true,
        opacity: 0.72,
      })
    );
    const outerIco = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(0.95, 1)), wireMat);
    coreGroup.add(outerIco);

    // 2. Inner crystalline octahedron nucleus
    const innerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x10b981,
        emissiveIntensity: 0.7,
        roughness: 0.18,
        metalness: 0.85,
        transparent: true,
        opacity: 0.88,
      })
    );
    const innerCore = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.48, 0)), innerMat);
    coreGroup.add(innerCore);

    // 3. Three concentric glowing gyro rings (emerald, cyan, amber/gold)
    const ring1Mat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.75 })
    );
    const ring2Mat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 })
    );
    const ring3Mat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.55 })
    );

    const ring1 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.24, 0.024, 10, 64)), ring1Mat);
    ring1.rotation.set(1.1, 0.2, 0);

    const ring2 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.38, 0.018, 10, 64)), ring2Mat);
    ring2.rotation.set(-0.95, 0.65, 0.4);

    const ring3 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.5, 0.014, 10, 64)), ring3Mat);
    ring3.rotation.set(0.35, -1.15, 0.25);

    coreGroup.add(ring1, ring2, ring3);

    // 4. Instanced orbiting quantum data motes
    const moteGeo = trackGeo(new THREE.OctahedronGeometry(0.055, 0));
    const moteMat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 })
    );
    const motes = new THREE.InstancedMesh(moteGeo, moteMat, MOTE_COUNT);
    motes.frustumCulled = false;
    coreGroup.add(motes);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(96, container.clientWidth || 132);
      const h = Math.max(96, container.clientHeight || 104);
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
    let phase = 0;
    let speedMultiplier = 1;
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
      if (qualityRef.current !== lastQuality) {
        lastQuality = qualityRef.current;
        applyPixelRatio();
      }

      const now = performance.now();
      const delta = Math.min(0.05, (now - lastTime) * 0.001);
      lastTime = now;

      const active = generatingRef.current;
      speedMultiplier = THREE.MathUtils.damp(speedMultiplier, active ? 4.6 : 1.0, 5.5, delta);
      phase += delta * speedMultiplier;

      const pulse = active ? 0.5 + 0.5 * Math.sin(phase * 3.2) : 0.25 + 0.15 * Math.sin(phase * 1.4);

      outerIco.rotation.y = phase * 0.52;
      outerIco.rotation.x = Math.sin(phase * 0.35) * 0.32;
      outerIco.scale.setScalar(1 + pulse * (active ? 0.09 : 0.025));

      innerCore.rotation.y = -phase * 0.85;
      innerCore.rotation.z = phase * 0.48;
      innerCore.scale.setScalar(1 + pulse * (active ? 0.16 : 0.04));

      wireMat.color.setHex(active && pulse > 0.5 ? 0x38bdf8 : 0x10b981);
      wireMat.opacity = active ? 0.75 + pulse * 0.25 : 0.65;
      innerMat.emissiveIntensity = active ? 0.9 + pulse * 1.2 : 0.55;
      ring1Mat.opacity = active ? 0.85 + pulse * 0.15 : 0.6;
      ring2Mat.opacity = active ? 0.78 + pulse * 0.2 : 0.55;

      ring1.rotation.z = phase * 0.7;
      ring2.rotation.z = -phase * 0.95;
      ring3.rotation.x = 0.35 + phase * 0.45;

      for (let i = 0; i < MOTE_COUNT; i++) {
        const a = (i / MOTE_COUNT) * Math.PI * 2 + phase * 0.85;
        const r = 1.28 + (i % 3) * 0.14;
        _moteDummy.position.set(
          Math.cos(a) * r,
          Math.sin(a * 2 + i) * 0.45,
          Math.sin(a) * r
        );
        _moteDummy.scale.setScalar(active ? 1.15 : 0.85);
        _moteDummy.updateMatrix();
        motes.setMatrixAt(i, _moteDummy.matrix);
      }
      motes.instanceMatrix.needsUpdate = true;

      renderer.render(scene, camera);

      if (isSoftwareGl || qualityRef.current === 'low') {
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
      data-testid="ai-core-3d"
      data-generating={String(isGenerating)}
      data-webgl-ready={String(webglReady)}
      className={`holo-glass holo-reticle rounded-2xl border px-4 py-2.5 flex items-center justify-between gap-4 transition-colors ${
        isGenerating
          ? 'border-[#38bdf8]/65 shadow-[0_0_28px_-6px_rgba(56,189,248,0.45)]'
          : 'border-[#10b981]/35'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          ref={mountRef}
          className="w-[104px] h-[86px] sm:w-[120px] sm:h-[94px] shrink-0 rounded-xl bg-[#030712]/70 border border-[#10b981]/25 overflow-hidden grid place-items-center"
        >
          {!webglReady && <Cpu className="w-7 h-7 text-[#10b981]" />}
        </div>

        <div className="min-w-0 space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#38bdf8]">
            <Cpu className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
            <span className="truncate">{t('ai_core_title')}</span>
          </div>
          <p className="text-xs sm:text-sm font-display font-bold text-[var(--text)] truncate">
            {isGenerating ? t('ai_core_active') : t('ai_core_standby')}
          </p>
          <p className="text-[11px] text-[var(--muted)] truncate">
            {t('assistant_advisor_badge')}
          </p>
        </div>
      </div>

      <span
        className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono-tabular font-semibold border shrink-0 ${
          isGenerating
            ? 'border-[#38bdf8]/50 bg-[#38bdf8]/15 text-[#38bdf8]'
            : 'border-[#10b981]/40 bg-[#10b981]/15 text-[#10b981]'
        }`}
      >
        {isGenerating ? t('toast_busy') : t('assistant_ready')}
      </span>
    </div>
  );
};
