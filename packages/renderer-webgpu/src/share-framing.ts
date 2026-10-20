import type { SeedGpuScene } from "./gpu-scene.js";
import { SEED_BLOCK_SIZE } from "./seed-model.js";

export type TreeFrame = { centerX: number; centerY: number; width: number; height: number };

// Bounds use the same isometric projection as generator v1; ornaments get a margin.
export function measureTreeFrame(scene: SeedGpuScene, gridSize: number): TreeFrame {
  let left = Infinity,
    right = -Infinity,
    bottom = Infinity,
    top = -Infinity;
  const include = (x: number, y: number, z: number, radius = 0): void => {
    const px = x * Math.cos(0.78) - z * Math.sin(0.78);
    const py = y * Math.cos(-0.55) - (x * Math.sin(0.78) + z * Math.cos(0.78)) * Math.sin(-0.55);
    left = Math.min(left, px - radius);
    right = Math.max(right, px + radius);
    bottom = Math.min(bottom, py - radius);
    top = Math.max(top, py + radius);
  };
  const half = (gridSize * SEED_BLOCK_SIZE) / 2;
  for (const x of [-half, half]) for (const z of [-half, half]) include(x, -0.03, z, 0.035);
  for (let i = 0; i < scene.segments.length; i += 12) {
    include(
      scene.segments[i]!,
      scene.segments[i + 1]!,
      scene.segments[i + 2]!,
      scene.segments[i + 3]!,
    );
    include(
      scene.segments[i + 4]!,
      scene.segments[i + 5]!,
      scene.segments[i + 6]!,
      scene.segments[i + 7]!,
    );
  }
  for (let i = 0; i < scene.flowers.length; i += 4) {
    include(
      scene.flowers[i]! * SEED_BLOCK_SIZE - half,
      scene.flowers[i + 2]!,
      scene.flowers[i + 1]! * SEED_BLOCK_SIZE - half,
      0.045,
    );
  }
  return {
    centerX: (left + right) / 2,
    centerY: (bottom + top) / 2,
    width: right - left,
    height: top - bottom,
  };
}
export function fitTreeZoom(frame: TreeFrame, gridSize: number, aspect: number): number {
  const boost = aspect < 0.8 ? 1.2 : 1;
  const scale = (41.5 / gridSize) * boost;
  return Math.min(
    1.76 / ((frame.width * scale) / Math.max(aspect, 1)),
    1.76 / ((frame.height * scale) / Math.max(1 / aspect, 1)),
  );
}

// Adapt projection only for the share presentation, leaving frozen v1 sources intact.
export function frameShareShader(source: string): string {
  if (!source.includes("fn projectPosition")) return source;
  const changes = [
    [
      "* portraitBoost * morphPulse * uniforms.camera.x;",
      "* portraitBoost * morphPulse * mix(uniforms.camera.x, 1.0, progress);",
    ],
    [
      "let yOffset = mix(-0.12, 0.08, progress);",
      "let yOffset = mix(-uniforms.camera.z, 0.08, progress);",
    ],
    [
      "let xOffset = mix(0.0, 0.015, progress);",
      "let xOffset = mix(-uniforms.camera.y, 0.015, progress);",
    ],
  ];
  for (const [before, after] of changes) {
    if (!source.includes(before!))
      throw new Error("Share projection no longer matches generator v1");
    source = source.replace(before!, after!);
  }
  return source;
}
