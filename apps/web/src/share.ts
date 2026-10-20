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
const badge = document.querySelector<HTMLButtonElement>("#badge")!;
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
const SEASON_PALETTE: Record<string, string> = {
  spring: "original",
  summer: "garden",
  autumn: "autumn",
  winter: "winter",
};
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
loading.hidden = true;
hint.textContent = text("正在準備", "Preparing");

// 角落的 QR 小地磚：跟場景同一個等角視角，顏色取自當季色盤；按下去切成 QR，QR 那一面換成一棵小樹
const BADGE = ["tile", "cube", "flat"].find((name) => name === params.get("badge")) ?? "tile";
const BADGE_MATRIX = [
  "11111011111",
  "10001110001",
  "10101010101",
  "10001010001",
  "11111011111",
  "00010101000",
  "11111010011",
  "10001100100",
  "10101011001",
  "10001000010",
  "11111010100",
];
const DEFAULT_PALETTE: NonNullable<SeedSceneConfig["palette"]> = [
  [0.91, 0.48, 0.64],
  [0.98, 0.73, 0.83],
  [0.91, 0.88, 0.79],
  [0.31, 0.43, 0.18],
  [0.965, 0.945, 0.906],
];
const rgb = (c: readonly number[], k = 1): string =>
  `rgb(${c.map((v) => Math.round(Math.min(1, v * k) * 255)).join(" ")})`;
function drawBadge(): void {
  const pal = config.palette ?? DEFAULT_PALETTE;
  // 跟真正的 QR 一樣淺底深格：底取地面色，格子壓深，定位角帶一點季節色
  const ink = rgb(pal[3]!, 0.55),
    finder = rgb(pal[0]!, 0.5),
    paper = rgb(pal[4]!, 0.95);
  const n = 11,
    cx = 24,
    top = 8,
    w = 18,
    h = 9;
  const thick = BADGE === "cube" ? 11 : BADGE === "tile" ? 4 : 0;
  const pt = (u: number, v: number): string =>
    BADGE === "flat"
      ? `${(6 + u * 36).toFixed(2)},${(4 + v * 36).toFixed(2)}`
      : `${(cx + (u - v) * w).toFixed(2)},${(top + (u + v) * h).toFixed(2)}`;
  const quad = (u0: number, v0: number, u1: number, v1: number): string =>
    `${pt(u0, v0)} ${pt(u1, v0)} ${pt(u1, v1)} ${pt(u0, v1)}`;
  let cells = "";
  BADGE_MATRIX.forEach((row, j) =>
    [...row].forEach((bit, i) => {
      if (bit !== "1") return;
      const corner = (i < 5 || i > 5) && (j < 5 || j > 5) && !(i > 5 && j > 5);
      cells += `<polygon points="${quad(i / n, j / n, (i + 1) / n, (j + 1) / n)}" fill="${corner ? finder : ink}"/>`;
    }),
  );
  const sides =
    thick === 0
      ? ""
      : `<polygon points="${cx - w},${top + h} ${cx},${top + 2 * h} ${cx},${top + 2 * h + thick} ${cx - w},${top + h + thick}" fill="${rgb(pal[4]!, 0.55)}"/>` +
        `<polygon points="${cx},${top + 2 * h} ${cx + w},${top + h} ${cx + w},${top + h + thick} ${cx},${top + 2 * h + thick}" fill="${rgb(pal[4]!, 0.4)}"/>`;
  const tree =
    `<g class="b-tree"><rect x="${cx - 1.2}" y="${top + h - 7}" width="2.4" height="8" rx="1" fill="${rgb(pal[3]!, 0.7)}"/>` +
    `<circle cx="${cx}" cy="${top + h - 11}" r="7.5" fill="${finder}"/><circle cx="${cx - 4}" cy="${top + h - 7}" r="5" fill="${rgb(pal[0]!, 0.7)}"/><circle cx="${cx + 4.5}" cy="${top + h - 8}" r="5" fill="${rgb(pal[1]!, 0.8)}"/></g>`;
  badge.innerHTML =
    `<svg viewBox="0 0 48 ${BADGE === "cube" ? 42 : 40}" aria-hidden="true">` +
    (BADGE === "flat"
      ? ""
      : `<ellipse cx="${cx + 2}" cy="${top + 2 * h + thick - 1}" rx="${w * 0.8}" ry="3" fill="rgb(0 0 0 / .35)"/>`) +
    sides +
    `<polygon points="${quad(0, 0, 1, 1)}" fill="${paper}"/><g class="b-code">${cells}</g>${tree}</svg>`;
  badge.dataset["kind"] = BADGE;
}
drawBadge();
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
  svg.classList.remove("veil", "shown");
  scene.disabled = true;
  badge.hidden = true;
  scene.ariaLabel = text("掃描 QR 碼開啟這一頁", "Scan the QR code to open this page");
  hint.textContent = text("掃描 QR 碼開啟這一頁", "Scan to open this page");
}
function updateHint(): void {
  hint.textContent = flat
    ? text("點一下顯示樹", "Show tree")
    : text("點一下顯示 QR 碼", "Show QR code");
  scene.ariaLabel = flat
    ? text("點一下顯示樹", "Show tree")
    : text("點一下顯示 QR 碼", "Show QR code");
  scene.setAttribute("aria-pressed", String(flat));
  badge.ariaLabel = flat ? text("顯示樹", "Show tree") : text("顯示 QR 碼", "Show QR code");
  badge.setAttribute("aria-pressed", String(flat));
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
    // 慢才給暗示：250 毫秒內就好的話直接淡入樹；超過就先顯示蓋著毛玻璃的 QR，告訴人這裡是一個 QR 碼
    const veil = setTimeout(() => {
      if (version !== revision || ready) return;
      svg.classList.add("veil");
      svg.removeAttribute("hidden");
      requestAnimationFrame(() => svg.classList.add("shown"));
    }, 250);
    // 比較頁用：模擬慢速載入，看毛玻璃暗示
    const delay = Number(params.get("delay")) || 0;
    if (delay) await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5000)));
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
        clearTimeout(veil);
        // 從毛玻璃當下的濃淡開始退：只出現一下的話，幾乎看不到它
        if (svg.classList.contains("veil")) {
          svg.classList.remove("shown");
          setTimeout(() => {
            if (version === revision) svg.setAttribute("hidden", "");
            svg.classList.remove("veil");
          }, 450);
        } else svg.setAttribute("hidden", "");
        canvas.hidden = false;
        canvas.classList.add("appear");
        badge.hidden = false;
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
      loading.hidden = false;
      loading.textContent = text("這個網址無法產生 QR 碼", "This URL cannot be encoded");
    }
  }
}
function toggle(): void {
  if (!ready) return;
  flat = !flat;
  renderer?.setFlat(flat);
  updateHint();
}
scene.addEventListener("click", toggle);
badge.addEventListener("click", toggle);
// 網站在天氣查到後才送來；樹不等天氣，先長出來再換
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.data?.type !== "tree-qr:weather") return;
  const effect = EFFECTS.find((name) => name === event.data.effect);
  if (!effect || effect === config.effect) return;
  config = { ...config, effect };
  renderer?.setScene(config);
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
    drawBadge();
    document
      .querySelectorAll("[data-palette]")
      .forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  }),
);
document.querySelectorAll<HTMLButtonElement>("[data-effect]").forEach((button) =>
  button.addEventListener("click", () => {
    config = {
      ...config,
      effect: EFFECTS.find((name) => name === button.dataset["effect"]) ?? "calm",
    };
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
