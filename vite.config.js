import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 從 GitHub Actions 帶入 repo name 作為 base path
// 本機 dev 時 base 為 '/'，部署時為 '/<REPO_NAME>/'
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base,
})
