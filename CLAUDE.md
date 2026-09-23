# Travel Journal — 專案資訊

> ⚠️ **這是公開 repo**：本檔與任何 commit 都不可寫入密碼、金鑰、token、資料庫連線資訊（URL／帳密／IP）或個人 email。

## ⛔ 本機測試規則：只能讀、不能寫正式資料

前端直接連**正式的 Supabase 資料表**（沒有另外的測試環境），本機 `npm run dev` 開起來的網頁讀寫的就是線上資料。
- 本機測試**只做讀取／瀏覽**；**禁止**在本機網頁上新增、編輯、刪除旅程或按任何會存檔的按鈕。
- 不要從本機直接對 Supabase 發 POST / PATCH / DELETE。
- 要驗證寫入邏輯：部署後由使用者在線上操作，或先建一個測試用的 Supabase 專案並把本機指過去（不要把它的連線資訊 commit 進來）。

---

## 專案概述

個人 2026 年度旅遊日誌：互動式月曆 + 世界地圖 + 年度回顧。
- 技術：React 18 + Vite + Tailwind CSS，主要程式都在 `src/App.jsx`（單檔）。
- 資料：存在 Supabase（README 寫的「localStorage」已過時）。
- 地點 geocoding：OpenStreetMap Nominatim API。

## 開發

```bash
npm ci         # 依 package-lock.json 安裝
npm run dev    # 本機開發（注意上方只讀規則）
npm run build  # 產出 dist/
```

## 部署

push 到 `main` → GitHub Actions（`.github/workflows/deploy.yml`）自動 build 並部署到 GitHub Pages。
- 部署時 `VITE_BASE_PATH=/<repo 名稱>/`，本機 dev 時 base 為 `/`（見 `vite.config.js`）。
- 線上網址：https://linf821.github.io/traveljournal/
