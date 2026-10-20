import { createEveryQRCodeIdentity, createQRSvgPath } from "@every-qrcode/core";
import type { SeedRenderer, SeedSceneConfig } from "../../../packages/renderer-webgpu/src/index";
import "./share.css";

const params = new URLSearchParams(location.search);
const en = params.get("lang") === "en";
const embed = params.get("embed") === "1";
const text = (zh: string, english: string): string => (en ? english : zh);
const scene = document.querySelector<HTMLButtonElement>("#scene")!;
let canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const svg = document.querySelector<SVGSVGElement>("svg")!;
const hint = document.querySelector<HTMLParagraphElement>("#hint")!;
const loading = document.querySelector<HTMLSpanElement>("#loading")!;
const address = document.querySelector<HTMLAnchorElement>("#address")!;
const copy = document.querySelector<HTMLButtonElement>("#copy")!;
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let renderer: SeedRenderer | undefined;
let revision = 0;
let flat = false;
let ready = false;
let still = false;
let hasQR = false;
let timeout: ReturnType<typeof setTimeout> | undefined;
const palettes: Record<string, SeedSceneConfig["palette"]> = {
  original: undefined,
  winter: [
    [0.36, 0.44, 0.56],
    [0.55, 0.63, 0.74],
    [0.6, 0.62, 0.64],
    [0.27, 0.33, 0.3],
    [0.68, 0.7, 0.72],
  ],
  garden: [
    [0.42, 0.57, 0.29],
    [0.64, 0.71, 0.43],
    [0.72, 0.68, 0.5],
    [0.25, 0.34, 0.18],
    [0.75, 0.76, 0.65],
  ],
  autumn: [
    [0.76, 0.48, 0.22],
    [0.87, 0.68, 0.35],
    [0.75, 0.69, 0.55],
    [0.35, 0.33, 0.19],
    [0.78, 0.76, 0.65],
  ],
};
// 網站可指定季節色調、天氣與樹形；沒指定時沿用原作。
const EFFECTS = ["calm", "rain", "snow", "wind"] as const;
const SEASON_PALETTE: Record<string, string> = { spring: "original", summer: "garden", autumn: "autumn", winter: "winter" };
const seasonPalette = palettes[SEASON_PALETTE[params.get("season") ?? ""] ?? "original"];
const effectParam = EFFECTS.find((name) => name === params.get("weather")) ?? "calm";
let config: SeedSceneConfig = {
  background: [32 / 255, 37 / 255, 31 / 255],
  effect: effectParam,
  ...(seasonPalette ? { palette: seasonPalette } : {}),
};
const treeParam = params.get("tree");
document.documentElement.lang = en ? "en" : "zh-Hant";
document.documentElement.classList.toggle("embed", embed);
if (en) {
  document.title = "Share a tree";
  document.querySelector("h1")!.textContent = "Share this page";
  document.querySelector("header p")!.textContent = "A link, a tree.";
  document.querySelector("#review")!.setAttribute("hidden", "");
}
loading.textContent = text("正在長成一棵樹…", "Growing a tree…");
copy.textContent = text("複製", "Copy");
copy.ariaLabel = text("複製連結", "Copy link");

function stop(): void {
  revision += 1;
  clearTimeout(timeout);
  renderer?.dispose();
  renderer = undefined;
  ready = false;
}
function fallback(): void {
  stop();
  canvas.hidden = true;
  svg.toggleAttribute("hidden", !hasQR);
  loading.hidden = hasQR;
  scene.disabled = true;
  scene.ariaLabel = text("掃描 QR 碼開啟這一頁", "Scan the QR code to open this page");
  hint.textContent = text("掃描 QR 碼開啟這一頁", "Scan to open this page");
}
function updateHint(): void {
  hint.textContent = flat
    ? text("點選返回樹景", "Return to tree view")
    : text("點選顯示 QR 碼", "Show QR code");
  scene.ariaLabel = flat
    ? text("點選返回樹景", "Return to tree")
    : text("點選顯示 QR 碼", "Show QR code");
  scene.setAttribute("aria-pressed", String(flat));
}
const identityPromise = createEveryQRCodeIdentity(params.get("url") || "https://weichenyeh.com/", {
  identityScope: "url",
});
async function mount(): Promise<void> {
  stop();
  const version = revision;
  scene.disabled = true;
  try {
    const identity = await identityPromise;
    if (version !== revision) return;
    address.textContent = identity.link.payloadUrl;
    address.href = identity.link.payloadUrl;
    const qr = createQRSvgPath(identity.qr);
    svg.setAttribute("viewBox", `0 0 ${qr.size} ${qr.size}`);
    svg.querySelector("rect")!.setAttribute("width", String(qr.size));
    svg.querySelector("rect")!.setAttribute("height", String(qr.size));
    svg.querySelector("path")!.setAttribute("d", qr.path);
    hasQR = true;
    if (document.hidden) return;
    timeout = setTimeout(fallback, 15000);
    const { createSeedModel, mountSeed } =
      await import("../../../packages/renderer-webgpu/src/index");
    const { TREE_ARCHETYPES } = await import("../../../packages/renderer-webgpu/src/seed-model");
    const base = await createSeedModel(identity, { generatorVersion: 1 });
    const archetype = TREE_ARCHETYPES.find((name) => name === treeParam);
    const model = archetype ? { ...base, archetype } : base;
    if (version !== revision) return;
    const next = document.createElement("canvas");
    canvas.replaceWith(next);
    canvas = next;
    renderer = mountSeed(canvas, model, config, "tree", {
      reducedMotion: motion.matches || still,
      fitTree: true,
      onReady: () => {
        if (version !== revision) return;
        clearTimeout(timeout);
        ready = true;
        svg.setAttribute("hidden", "");
        loading.hidden = true;
        canvas.hidden = false;
        scene.disabled = false;
        updateHint();
      },
      onError: () => {
        if (version === revision) fallback();
      },
    });
    renderer.setZoom(1);
    renderer.setFlat(flat);
  } catch {
    if (version !== revision) return;
    if (hasQR) fallback();
    else {
      loading.textContent = text("這個網址無法產生 QR 碼", "This URL cannot be encoded");
      hint.textContent = "";
    }
  }
}
scene.addEventListener("click", () => {
  if (!ready) return;
  flat = !flat;
  renderer?.setFlat(flat);
  updateHint();
});
copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(address.href);
    copy.textContent = text("已複製", "Copied");
  } catch {
    copy.textContent = text("請選取網址複製", "Select link to copy");
  }
  setTimeout(() => {
    copy.textContent = text("複製", "Copy");
  }, 2000);
});
document.querySelectorAll<HTMLButtonElement>("[data-palette]").forEach((button) =>
  button.addEventListener("click", () => {
    const palette = palettes[button.dataset["palette"]!];
    const { palette: _old, ...rest } = config;
    config = palette ? { ...rest, palette } : rest;
    renderer?.setScene(config);
    document
      .querySelectorAll("[data-palette]")
      .forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  }),
);
document.querySelectorAll<HTMLButtonElement>("[data-effect]").forEach((button) =>
  button.addEventListener("click", () => {
    config = { ...config, effect: EFFECTS.find((name) => name === button.dataset["effect"]) ?? "calm" };
    renderer?.setScene(config);
    document
      .querySelectorAll("[data-effect]")
      .forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  }),
);
document.querySelector<HTMLButtonElement>("#still")!.addEventListener("click", (event) => {
  still = !still;
  (event.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(still));
  void mount();
});
const observer = new ResizeObserver(() => renderer?.resize());
observer.observe(scene);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  else void mount();
});
motion.addEventListener("change", () => {
  void mount();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    observer.observe(scene);
    void mount();
  }
});
window.addEventListener("pagehide", () => {
  stop();
  observer.disconnect();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && embed)
    window.parent.postMessage({ type: "tree-qr:close" }, location.origin);
});
void mount();
