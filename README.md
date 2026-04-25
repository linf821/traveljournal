# travel-journal-2026

我的 2026 年度旅遊日誌 — 互動式月曆 + 世界地圖 + 年度回顧。

## 開發

```bash
npm install
npm run dev
```

## 部署

push 到 main branch 會自動透過 GitHub Actions 部署到 GitHub Pages。

## 技術

React + Vite + Tailwind CSS，資料存在瀏覽器 localStorage。
地點 geocoding 透過 OpenStreetMap Nominatim API。
