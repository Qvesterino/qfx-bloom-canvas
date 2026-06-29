// Sample target point clouds from text or images for shape-attractor motion.

export type ShapeTargets = {
  points: Float32Array; // xyz triplets
  count: number;
};

const SAMPLE_W = 160;

/** Sample dark/opaque pixels from an HTMLImageElement into a centered point cloud. */
export function sampleImage(img: HTMLImageElement, density = 1): ShapeTargets {
  const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
  const w = SAMPLE_W;
  const h = Math.max(16, Math.round(SAMPLE_W * ratio));
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // World scale: fit ~70 units wide.
  const worldW = 70;
  const worldH = worldW * ratio;
  const step = Math.max(1, Math.round(1 / Math.max(0.25, density)));

  const buf: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 32) continue;
      // luminance — prefer non-bright pixels (foreground subjects),
      // but accept anything visible.
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      // weight inverse-luminance so darker silhouettes are kept densely;
      // still keep mid/bright to preserve full image.
      const keep = a / 255 * (1 - lum / 510);
      if (Math.random() > keep + 0.05) continue;

      const wx = (x / w - 0.5) * worldW;
      const wy = -(y / h - 0.5) * worldH;
      buf.push(wx, wy, (Math.random() - 0.5) * 1.5);
    }
  }
  const points = new Float32Array(buf);
  return { points, count: points.length / 3 };
}

/** Sample text glyph silhouettes into a centered point cloud. */
export function sampleText(text: string, opts: { fontSize?: number; font?: string } = {}): ShapeTargets {
  const fontSize = opts.fontSize ?? 200;
  const font = opts.font ?? `900 ${fontSize}px Inter, system-ui, sans-serif`;

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const m = measure.measureText(text);
  const w = Math.max(64, Math.ceil(m.width) + 40);
  const h = Math.ceil(fontSize * 1.4);

  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2);
  const data = ctx.getImageData(0, 0, w, h).data;

  // Fit text to ~80 world units wide.
  const worldW = 80;
  const worldH = (worldW * h) / w;
  const step = 2;

  const buf: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i] < 128) continue;
      if (Math.random() < 0.35) continue;
      const wx = (x / w - 0.5) * worldW;
      const wy = -(y / h - 0.5) * worldH;
      buf.push(wx, wy, (Math.random() - 0.5) * 1.5);
    }
  }
  const points = new Float32Array(buf);
  return { points, count: points.length / 3 };
}
