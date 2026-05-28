import * as THREE from "three";
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  BloomEffect,
  ChromaticAberrationEffect,
  NoiseEffect,
  BlendFunction,
  KernelSize,
} from "postprocessing";
import type { QfxSettings } from "./types";

function clampPixelRatio(pr: number): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  return Math.max(1, Math.min(dpr, pr));
}

const KERNEL_SIZES: KernelSize[] = [
  KernelSize.VERY_SMALL,
  KernelSize.SMALL,
  KernelSize.MEDIUM,
  KernelSize.LARGE,
  KernelSize.VERY_LARGE,
  KernelSize.HUGE,
];

function toKernelSize(n: number): KernelSize {
  const i = Math.max(0, Math.min(KERNEL_SIZES.length - 1, Math.round(n)));
  return KERNEL_SIZES[i];
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;
  uniform float uSize;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uSize * uPixelRatio * (320.0 / -mv.z);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uGlow;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float halo = pow(core, 2.2);
    vec3 col = vColor * (halo * uGlow + core * 0.6);
    gl_FragColor = vec4(col, vAlpha * halo);
  }
`;

function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function paletteColor(palette: string[], t: number): [number, number, number] {
  const n = palette.length;
  const x = (t % 1 + 1) % 1 * n;
  const i = Math.floor(x);
  const f = x - i;
  return mixColor(hexToRGB(palette[i % n]), hexToRGB(palette[(i + 1) % n]), f);
}

export class QfxEngine {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloom!: BloomEffect;
  private chromatic!: ChromaticAberrationEffect;
  private noise!: NoiseEffect;
  private effectPass!: EffectPass;
  private renderPass!: RenderPass;

  private geometry!: THREE.BufferGeometry;
  private material!: THREE.ShaderMaterial;
  private points!: THREE.Points;

  // particle pool (CPU side)
  private cap: number;
  private posArr!: Float32Array;
  private colArr!: Float32Array;
  private sizeArr!: Float32Array;
  private alphaArr!: Float32Array;
  private velX!: Float32Array;
  private velY!: Float32Array;
  private velZ!: Float32Array;
  private age!: Float32Array;
  private life!: Float32Array;
  private alive!: Uint8Array;
  private cursor = 0;
  private aliveCount = 0;

  private settings: QfxSettings;
  private mouse = { x: 0, y: 0, world: new THREE.Vector3() };
  private prevMouse = { x: 0, y: 0 };
  private clock = new THREE.Clock();
  private rafId = 0;
  private time = 0;
  private cycleT = 0;
  private fps = 60;
  private fpsAccum = 60;

  constructor(canvas: HTMLCanvasElement, settings: QfxSettings) {
    this.canvas = canvas;
    this.settings = { ...settings };
    this.cap = 10000; // hard cap of pool

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(clampPixelRatio(this.settings.pixelRatio));
    this.renderer.setClearColor(0x05060a, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.012);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 80);

    this.buildParticles();
    this.buildComposer();
    this.resize();

    window.addEventListener("resize", this.resize);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);

    this.clock.start();
    this.loop();
  }

  private buildParticles() {
    const cap = this.cap;
    this.posArr = new Float32Array(cap * 3);
    this.colArr = new Float32Array(cap * 3);
    this.sizeArr = new Float32Array(cap);
    this.alphaArr = new Float32Array(cap);
    this.velX = new Float32Array(cap);
    this.velY = new Float32Array(cap);
    this.velZ = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.alive = new Uint8Array(cap);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colArr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizeArr, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uSize: { value: this.settings.size * 4 },
        uGlow: { value: this.settings.glow },
      },
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  private buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    const s = this.settings;
    this.bloom = new BloomEffect({
      intensity: s.glow,
      luminanceThreshold: 0.0,
      luminanceSmoothing: 0.4,
      mipmapBlur: true,
      kernelSize: toKernelSize(s.bloomKernel),
    });
    this.chromatic = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(s.chromaticOffset, s.chromaticOffset),
      radialModulation: true,
      modulationOffset: 0.4,
    });
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
    (this.noise.blendMode.opacity as { value: number }).value = s.noiseIntensity;

    this.rebuildEffectPass();
  }

  private rebuildEffectPass() {
    if (this.effectPass) {
      this.composer.removePass(this.effectPass);
      this.effectPass.dispose();
    }
    const effects = [];
    if (this.settings.bloom) effects.push(this.bloom);
    if (this.settings.chromatic) effects.push(this.chromatic);
    if (this.settings.noise) effects.push(this.noise);
    if (effects.length === 0) {
      // need at least one pass that writes to screen
      this.effectPass = new EffectPass(this.camera);
    } else {
      this.effectPass = new EffectPass(this.camera, ...effects);
    }
    this.composer.addPass(this.effectPass);
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
  };

  private screenToWorld(clientX: number, clientY: number): THREE.Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(x, y, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    const dist = -this.camera.position.z / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(dist));
  }

  private onPointerMove = (e: PointerEvent) => {
    this.prevMouse.x = this.mouse.x;
    this.prevMouse.y = this.mouse.y;
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.world.copy(this.screenToWorld(e.clientX, e.clientY));
    const dx = this.mouse.x - this.prevMouse.x;
    const dy = this.mouse.y - this.prevMouse.y;
    const speed = Math.min(Math.hypot(dx, dy), 60);
    const spawn = Math.max(1, Math.floor(speed * 0.6));
    this.spawnAt(this.mouse.world, spawn);
  };

  private onPointerDown = (e: PointerEvent) => {
    const w = this.screenToWorld(e.clientX, e.clientY);
    this.spawnAt(w, 200);
  };

  private spawnAt(pos: THREE.Vector3, n: number) {
    const cap = this.cap;
    const max = Math.min(this.settings.count, cap);
    const t = this.cycleT;
    const palette = this.settings.palette;
    for (let i = 0; i < n; i++) {
      let idx = -1;
      // find slot within max range
      for (let tries = 0; tries < 8; tries++) {
        const c = this.cursor % max;
        this.cursor = (this.cursor + 1) % max;
        if (!this.alive[c]) { idx = c; break; }
        idx = c; // overwrite
      }
      if (idx < 0) idx = 0;

      const wasAlive = this.alive[idx];
      this.alive[idx] = 1;
      if (!wasAlive) this.aliveCount++;

      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.6;
      this.posArr[idx * 3] = pos.x + Math.cos(a) * r;
      this.posArr[idx * 3 + 1] = pos.y + Math.sin(a) * r;
      this.posArr[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * 2;

      const sp = 6 + Math.random() * 10;
      this.velX[idx] = Math.cos(a) * sp * 0.2;
      this.velY[idx] = Math.sin(a) * sp * 0.2;
      this.velZ[idx] = (Math.random() - 0.5) * 2;

      const baseLife = this.settings.lifetime * (this.settings.trails ? 2.2 : 1) * (0.7 + Math.random() * 0.6);
      this.life[idx] = baseLife;
      this.age[idx] = 0;

      const col = paletteColor(palette, Math.random() + t);
      this.colArr[idx * 3] = col[0];
      this.colArr[idx * 3 + 1] = col[1];
      this.colArr[idx * 3 + 2] = col[2];

      this.sizeArr[idx] = 0.6 + Math.random() * 1.2;
      this.alphaArr[idx] = 1;
    }
  }

  private update(dt: number) {
    this.time += dt;
    if (this.settings.cycleColors) this.cycleT += dt * 0.1;

    const mode = this.settings.motion;
    const speed = this.settings.speed;
    const cap = this.cap;
    const max = Math.min(this.settings.count, cap);

    for (let i = 0; i < max; i++) {
      if (!this.alive[i]) continue;
      const age = this.age[i] + dt;
      if (age >= this.life[i]) {
        this.alive[i] = 0;
        this.aliveCount--;
        this.alphaArr[i] = 0;
        // hide
        this.posArr[i * 3 + 2] = 9999;
        continue;
      }
      this.age[i] = age;
      const lifeT = age / this.life[i];

      const ix = i * 3;
      let px = this.posArr[ix];
      let py = this.posArr[ix + 1];
      let pz = this.posArr[ix + 2];
      let vx = this.velX[i];
      let vy = this.velY[i];
      let vz = this.velZ[i];

      switch (mode) {
        case "vortex": {
          const r = Math.hypot(px, py) + 0.0001;
          const ang = 1.6 / (r * 0.05 + 1);
          const tx = -py / r;
          const ty = px / r;
          vx += (tx * ang - px * 0.04) * dt * 60 * 0.1;
          vy += (ty * ang - py * 0.04) * dt * 60 * 0.1;
          vz *= 0.98;
          break;
        }
        case "wave": {
          vy -= 18 * dt;
          vx += Math.sin(py * 0.08 + this.time * 1.5) * 14 * dt;
          break;
        }
        case "explosion": {
          const r = Math.hypot(px, py, pz) + 0.0001;
          vx += (px / r) * 30 * dt;
          vy += (py / r) * 30 * dt;
          vz += (pz / r) * 30 * dt;
          vx *= 0.985;
          vy *= 0.985;
          vz *= 0.985;
          break;
        }
        case "orbit": {
          const r = Math.hypot(px, py) + 0.0001;
          const target = 30;
          const pull = (target - r) * 0.5;
          vx += (-py / r) * 8 * dt + (px / r) * pull * dt;
          vy += (px / r) * 8 * dt + (py / r) * pull * dt;
          vx *= 0.99;
          vy *= 0.99;
          break;
        }
        case "gravity": {
          vy += Math.sin(this.time * 0.4) * 4 * dt;
          vx += Math.cos(this.time * 0.3 + py * 0.05) * 6 * dt;
          vx *= 0.99;
          vy *= 0.99;
          vz *= 0.99;
          break;
        }
      }

      px += vx * dt * speed;
      py += vy * dt * speed;
      pz += vz * dt * speed;

      this.posArr[ix] = px;
      this.posArr[ix + 1] = py;
      this.posArr[ix + 2] = pz;
      this.velX[i] = vx;
      this.velY[i] = vy;
      this.velZ[i] = vz;

      // alpha curve: fade in fast, fade out slow
      const a = lifeT < 0.1 ? lifeT / 0.1 : 1 - (lifeT - 0.1) / 0.9;
      this.alphaArr[i] = a;

      if (this.settings.cycleColors) {
        const col = paletteColor(this.settings.palette, lifeT + this.cycleT + i * 0.0001);
        this.colArr[ix] = col[0];
        this.colArr[ix + 1] = col[1];
        this.colArr[ix + 2] = col[2];
      }
    }

    this.geometry.setDrawRange(0, max);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;

    // ambient camera motion
    this.camera.position.x = Math.sin(this.time * 0.12) * 4;
    this.camera.position.y = Math.cos(this.time * 0.1) * 3;
    this.camera.lookAt(0, 0, 0);
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.settings.paused) {
      this.update(dt);
    }
    this.material.uniforms.uSize.value = this.settings.size * 4;
    this.material.uniforms.uGlow.value = this.settings.glow;
    this.composer.render(dt);
    // smooth FPS estimate
    if (dt > 0) {
      this.fpsAccum += (1 / dt - this.fpsAccum) * 0.08;
      this.fps = this.fpsAccum;
    }
  };

  // ===== Public API =====

  getFps(): number {
    return Math.round(this.fps);
  }

  update_settings(patch: Partial<QfxSettings>) {
    const before = this.settings;
    const next = { ...before, ...patch };

    const effectsChanged =
      patch.bloom !== undefined ||
      patch.chromatic !== undefined ||
      patch.noise !== undefined;

    const bloomKernelChanged =
      patch.bloomKernel !== undefined && patch.bloomKernel !== before.bloomKernel;
    const pixelRatioChanged =
      patch.pixelRatio !== undefined && patch.pixelRatio !== before.pixelRatio;

    this.settings = next;

    if (patch.bloom !== undefined || patch.glow !== undefined) {
      this.bloom.intensity = next.glow;
    }
    if (patch.chromaticOffset !== undefined) {
      this.chromatic.offset.set(next.chromaticOffset, next.chromaticOffset);
    }
    if (patch.noiseIntensity !== undefined) {
      (this.noise.blendMode.opacity as { value: number }).value = next.noiseIntensity;
    }

    if (bloomKernelChanged || pixelRatioChanged) {
      if (pixelRatioChanged) {
        this.renderer.setPixelRatio(clampPixelRatio(next.pixelRatio));
        this.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
      }
      // BloomEffect has no kernelSize setter — rebuild composer.
      this.composer.dispose();
      this.buildComposer();
      this.resize();
    } else if (effectsChanged) {
      this.rebuildEffectPass();
    }
  }

  clear() {
    this.alive.fill(0);
    this.alphaArr.fill(0);
    for (let i = 0; i < this.posArr.length; i += 3) this.posArr[i + 2] = 9999;
    this.aliveCount = 0;
  }

  randomizeBurst() {
    this.clear();
    for (let i = 0; i < 30; i++) {
      const p = new THREE.Vector3(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 20,
      );
      this.spawnAt(p, Math.floor(80 + Math.random() * 120));
    }
  }

  screenshot(): string {
    this.composer.render(0);
    return this.canvas.toDataURL("image/png");
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.geometry.dispose();
    this.material.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
