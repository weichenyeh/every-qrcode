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
const loader = document.querySelector<HTMLSpanElement>("#loader")!;
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

// QR 小地磚：跟場景同一個等角視角，顏色取自當季色盤。載入時它放大在中間、格子一塊塊拼起來；
// 樹好了它縮回右下角，變成切換 QR 的按鈕。切成 QR 後，地磚上立一棵方塊小樹，代表「點這裡回到樹」
const TILE_MATRIX = [
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
function tileSvg(): string {
  const pal = config.palette ?? DEFAULT_PALETTE;
  // 跟真正的 QR 一樣淺底深格：底取地面色，格子壓深，定位角帶一點季節色
  const ink = rgb(pal[3]!, 0.55),
    finder = rgb(pal[0]!, 0.5),
    paper = rgb(pal[4]!, 0.95);
  const n = 11,
    cx = 24,
    top = 24,
    w = 18,
    h = 9,
    thick = 4,
    lift = 15;
  // 等角投影：u、v 是地磚上的座標（0–1），z 是高度
  const at = (u: number, v: number, z = 0): string =>
    `${(cx + (u - v) * w).toFixed(2)},${(top + (u + v) * h - z * lift).toFixed(2)}`;
  const face = (...pts: [number, number, number][]): string =>
    pts.map(([u, v, z]) => at(u, v, z)).join(" ");
  const quad = (u0: number, v0: number, u1: number, v1: number): string =>
    face([u0, v0, 0], [u1, v0, 0], [u1, v1, 0], [u0, v1, 0]);
  // 方塊：看得到頂面、左前面（v = v1）、右前面（u = u1），亮、中、暗三階
  const cube = (
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    z0: number,
    z1: number,
    c: readonly number[],
  ): string =>
    `<polygon points="${face([u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1])}" fill="${rgb(c, 0.78)}"/>` +
    `<polygon points="${face([u1, v0, z0], [u1, v1, z0], [u1, v1, z1], [u1, v0, z1])}" fill="${rgb(c, 0.6)}"/>` +
    `<polygon points="${face([u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1])}" fill="${rgb(c, 1)}"/>`;
  let cells = "";
  let order = 0;
  TILE_MATRIX.forEach((row, j) =>
    [...row].forEach((bit, i) => {
      if (bit !== "1") return;
      const corner = (i < 5 || i > 5) && (j < 5 || j > 5) && !(i > 5 && j > 5);
      // 定位角一開始就在，資料格照固定的亂序拼上去
      const style = corner ? "" : ` style="--i:${(order++ * 7) % 23}"`;
      cells += `<polygon class="${corner ? "f" : "c"}"${style} points="${quad(i / n, j / n, (i + 1) / n, (j + 1) / n)}" fill="${corner ? finder : ink}"/>`;
    }),
  );
  const trunk: readonly number[] = [0.5, 0.36, 0.24];
  const tree =
    `<g class="b-tree">` +
    cube(0.44, 0.44, 0.56, 0.56, 0, 0.75, trunk) +
    cube(0.24, 0.24, 0.76, 0.76, 0.6, 1.25, pal[0]!) +
    cube(0.34, 0.34, 0.66, 0.66, 1.25, 1.6, pal[1]!) +
    `</g>`;
  return (
    `<svg viewBox="0 0 48 52" aria-hidden="true">` +
    `<ellipse cx="${cx + 2}" cy="${top + 2 * h + thick - 1}" rx="${w * 0.8}" ry="3" fill="rgb(0 0 0 / .35)"/>` +
    `<polygon points="${cx - w},${top + h} ${cx},${top + 2 * h} ${cx},${top + 2 * h + thick} ${cx - w},${top + h + thick}" fill="${rgb(pal[4]!, 0.55)}"/>` +
    `<polygon points="${cx},${top + 2 * h} ${cx + w},${top + h} ${cx + w},${top + h + thick} ${cx},${top + 2 * h + thick}" fill="${rgb(pal[4]!, 0.4)}"/>` +
    `<polygon points="${quad(0, 0, 1, 1)}" fill="${paper}"/><g class="b-code">${cells}</g>${tree}</svg>`
  );
}
function drawTiles(): void {
  const markup = tileSvg();
  badge.innerHTML = markup;
  loader.innerHTML = markup;
}
drawTiles();
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
  loader.hidden = true;
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
// 樹好了：中間的大地磚拼完、縮回右下角，最後由角落那顆按鈕接手。沒出現過就直接讓按鈕淡入
function settleLoader(): void {
  if (loader.hidden) {
    badge.hidden = false;
    return;
  }
  badge.hidden = false;
  badge.style.visibility = "hidden";
  loader.classList.add("settle");
  const from = loader.getBoundingClientRect(),
    to = badge.getBoundingClientRect();
  const done = (): void => {
    loader.hidden = true;
    loader.classList.remove("settle");
    badge.style.visibility = "";
  };
  if (motion.matches || !from.width) return done();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2),
    dy = to.top + to.height / 2 - (from.top + from.height / 2);
  loader
    .animate(
      [
        { transform: "none" },
        { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})` },
      ],
      {
        duration: 650,
        delay: 120,
        easing: "cubic-bezier(.5, 0, .2, 1)",
        fill: "forwards",
      },
    )
    .finished.then(() => {
      done();
      loader.getAnimations().forEach((animation) => animation.cancel());
    });
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
    // 慢才給暗示：250 毫秒內就好的話直接淡入樹；超過就先在中間放大小地磚，格子一塊塊拼起來
    const hintTimer = setTimeout(() => {
      if (version === revision && !ready) loader.hidden = false;
    }, 250);
    // 比較頁用：模擬慢速載入，看載入暗示
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
        clearTimeout(hintTimer);
        canvas.hidden = false;
        canvas.classList.add("appear");
        settleLoader();
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
    drawTiles();
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
