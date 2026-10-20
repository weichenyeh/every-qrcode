import { expect, it } from "vitest";
import { createEveryQRCodeIdentity } from "@every-qrcode/core";
import { createSeedModel } from "./seed-model";
import { createSeedGpuScene } from "./gpu-scene";
import { fitTreeZoom, frameShareShader, measureTreeFrame } from "./share-framing";
import { SEED_UNIFORMS_WGSL } from "./shared-shaders";

it.each([
  "https://weichenyeh.com/",
  "https://weichenyeh.com/zh-tw/notes/",
  "https://weichenyeh.com/zh-tw/photography/svalbard-light/",
])("fits tree and ground without cropping for %s", async (url) => {
  const model = await createSeedModel(
    await createEveryQRCodeIdentity(url, { identityScope: "url" }),
  );
  const frame = measureTreeFrame(createSeedGpuScene(model), model.qrSize);
  for (const aspect of [0.6, 1, 1.8, 2.6]) {
    const zoom = fitTreeZoom(frame, model.qrSize, aspect);
    const scale = (41.5 / model.qrSize) * (aspect < 0.8 ? 1.2 : 1) * zoom;
    const width = (frame.width * scale) / Math.max(aspect, 1);
    const height = (frame.height * scale) / Math.max(1 / aspect, 1);
    expect(width).toBeLessThanOrEqual(1.760001);
    expect(height).toBeLessThanOrEqual(1.760001);
    expect(Math.max(width, height)).toBeCloseTo(1.76);
    expect(Number.isFinite(frame.centerY)).toBe(true);
  }
});
it("rejects changed upstream projection instead of silently misframing", () => {
  expect(frameShareShader(SEED_UNIFORMS_WGSL)).toContain("mix(-uniforms.camera.z, 0.08, progress)");
  expect(() =>
    frameShareShader(SEED_UNIFORMS_WGSL.replace("mix(-0.12, 0.08, progress)", "0.0")),
  ).toThrow("no longer matches");
});
