# 個人網站分享整合

此 fork 以 AlbertAZ1992/every-qrcode 的 `ed404c6` 為起點，保留上游生成器、樹形、材質與動態。分享入口在 `apps/web/share.html`，上游展示入口不變。

## 建置與預覽

先執行 `pnpm install --frozen-lockfile`、`pnpm build:packages`，再執行 `pnpm --filter @every-qrcode/demo exec vite build --config share.vite.config.ts`。輸出位於 `apps/web/dist-share/`。

本機預覽使用 `pnpm --filter @every-qrcode/demo exec vite --host 127.0.0.1 --port 4403`，開啟 `/share.html`。`url` 指定 HTTP 或 HTTPS 分享網址，`lang=en` 使用英文，`embed=1` 隱藏外層標題、網址與比較控制。

網站自行提供網址列與複製按鈕，將輸出完整複製到網站的 `public/every-qr/`，嵌入 `/every-qr/share.html?embed=1&url=...`。iframe 與網站同源；Escape 以 `tree-qr:close` 訊息交回外層，外層驗證來源及 iframe 身分後關閉。

## 維護邊界

- 分享介面獨立於上游展示網站。保留原作粉花為預設，只降低背景亮度；其他色盤是比較候選。
- 網址身分使用 `url` 範圍，生成器固定為 `1`。掃碼目的地包含原始路徑、查詢參數與 fragment，視覺身分依上游正規化規則決定。
- Renderer 增加可選的 `reducedMotion`：顯示靜止樹，切換 QR 時直接到位。一般模式保留上游動態；QR 對齊後停止繪製，操作或尺寸變更時重新繪製。
- iframe 移除時由瀏覽器釋放；頁面隱藏時 dispose，恢復可見時重建。初始化失敗或超過 15 秒，改用同一份 QR matrix 的暖灰 SVG。
- 保留 MIT 授權與上游署名。更新上游時逐檔檢視衝突，以這份 fork 的分享入口為準，生成器與美術優先採上游；合併前建立分支，可回到合併前 commit。

## 驗收

執行上游測試、型別檢查與分享入口建置。瀏覽器需驗證樹與 QR 來回切換、不同網址、配色、窄畫面、減少動態、初始化失敗備援及離開分享後的釋放。實際 QR 畫面另以獨立解碼器確認目的地；手機相機掃描仍需實機驗收。

## 分享入口的參數與行為

| 參數 | 作用 |
|---|---|
| `tree` | 指定樹種（`round`、`windswept`、`umbrella`、`conifer`、`cloud`、`willow`、`multi-trunk`、`banana`）；網站依區塊決定 |
| `season` | `spring`、`summer`、`autumn`、`winter` 四組色盤；新增色盤要實際解碼 QR，冬季的定位方塊因此加深 |
| `weather` | `calm`、`wind`、`rain`、`snow`；網站也可在載入後以 `tree-qr:weather` 訊息送入，樹不等天氣 |
| `delay` | 只給比較頁模擬慢速載入，最多 5 秒 |

- 嵌入模式由 `share.html` 開頭的一段程式與內嵌樣式決定，整頁版的標題不會在 iframe 裡閃出。
- 畫面上不寫提示；右下角的等角 QR 小地磚是切換鈕，切成 QR 後換成方塊小樹。
- 初始化超過 250 毫秒時，小地磚放大在中間拼完一輪格子（約 1.3 秒）才縮回角落，樹同時淡入；減少動態時直接出現。

## 驗證結果

130 項測試、型別檢查與分享入口建置通過；正式站以 Chrome、Safari 與手機相機掃描驗證，四季色盤的 QR 都以 macOS Vision 解碼正確。
