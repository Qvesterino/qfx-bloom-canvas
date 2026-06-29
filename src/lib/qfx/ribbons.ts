import * as THREE from "three";

/**
 * Ribbon trail system. Maintains R ribbons, each with M segment samples,
 * rendered as a single additive line draw with vertex colors and per-vertex alpha
 * baked into color * alpha (using ShaderMaterial).
 */
const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uGlow;
  void main() {
    gl_FragColor = vec4(vColor * uGlow, vAlpha);
  }
`;

export class RibbonSystem {
  ribbonCount: number;
  segments: number; // history samples per ribbon
  positions: Float32Array; // (R * (M-1) * 2) * 3
  colors: Float32Array;
  alphas: Float32Array;
  history: Float32Array; // R * M * 3 ring buffer
  histColor: Float32Array; // R * 3 (one color per ribbon, current)
  head: Int32Array; // R, where the next sample goes
  filled: Uint8Array; // R, how many samples written so far

  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  lines: THREE.LineSegments;

  constructor(ribbonCount: number, segments: number) {
    this.ribbonCount = ribbonCount;
    this.segments = segments;
    const segPairs = ribbonCount * (segments - 1) * 2;
    this.positions = new Float32Array(segPairs * 3);
    this.colors = new Float32Array(segPairs * 3);
    this.alphas = new Float32Array(segPairs);
    this.history = new Float32Array(ribbonCount * segments * 3);
    this.histColor = new Float32Array(ribbonCount * 3);
    this.head = new Int32Array(ribbonCount);
    this.filled = new Uint8Array(ribbonCount);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uGlow: { value: 1.4 } },
    });

    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  setVisible(v: boolean) {
    this.lines.visible = v;
  }

  setGlow(g: number) {
    this.material.uniforms.uGlow.value = g;
  }

  reset() {
    this.head.fill(0);
    this.filled.fill(0);
    this.alphas.fill(0);
    (this.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Push current leader positions/colors. `posXYZ`, `colRGB` are flat arrays of length R*3.
   * Caller must guarantee length matches ribbonCount; alive flag controls whether the
   * sample is recorded (skipped ribbons leave a gap).
   */
  pushSamples(posXYZ: Float32Array, colRGB: Float32Array, alive: Uint8Array) {
    const R = this.ribbonCount;
    const M = this.segments;
    for (let i = 0; i < R; i++) {
      if (!alive[i]) continue;
      const h = this.head[i];
      const idx = (i * M + h) * 3;
      this.history[idx] = posXYZ[i * 3];
      this.history[idx + 1] = posXYZ[i * 3 + 1];
      this.history[idx + 2] = posXYZ[i * 3 + 2];
      this.head[i] = (h + 1) % M;
      if (this.filled[i] < M) this.filled[i]++;

      this.histColor[i * 3] = colRGB[i * 3];
      this.histColor[i * 3 + 1] = colRGB[i * 3 + 1];
      this.histColor[i * 3 + 2] = colRGB[i * 3 + 2];
    }
  }

  /** Rebuild line strip vertex buffers from history. */
  rebuild() {
    const R = this.ribbonCount;
    const M = this.segments;
    let outI = 0;
    for (let i = 0; i < R; i++) {
      const f = this.filled[i];
      const head = this.head[i];
      const cr = this.histColor[i * 3];
      const cg = this.histColor[i * 3 + 1];
      const cb = this.histColor[i * 3 + 2];
      // Walk oldest → newest
      const start = f < M ? 0 : head;
      const len = f;
      for (let s = 0; s < len - 1; s++) {
        const a = (start + s) % M;
        const b = (start + s + 1) % M;
        const ax = i * M + a;
        const bx = i * M + b;
        const aBase = ax * 3;
        const bBase = bx * 3;
        // Pair (a, b) as one segment
        this.positions[outI * 3] = this.history[aBase];
        this.positions[outI * 3 + 1] = this.history[aBase + 1];
        this.positions[outI * 3 + 2] = this.history[aBase + 2];
        const tA = s / Math.max(1, len - 1);
        const aA = tA * tA; // older = dimmer
        this.colors[outI * 3] = cr;
        this.colors[outI * 3 + 1] = cg;
        this.colors[outI * 3 + 2] = cb;
        this.alphas[outI] = aA;
        outI++;
        this.positions[outI * 3] = this.history[bBase];
        this.positions[outI * 3 + 1] = this.history[bBase + 1];
        this.positions[outI * 3 + 2] = this.history[bBase + 2];
        const tB = (s + 1) / Math.max(1, len - 1);
        const aB = tB * tB;
        this.colors[outI * 3] = cr;
        this.colors[outI * 3 + 1] = cg;
        this.colors[outI * 3 + 2] = cb;
        this.alphas[outI] = aB;
        outI++;
      }
    }
    // Hide unused tail
    for (let k = outI; k < this.alphas.length; k++) this.alphas[k] = 0;

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
