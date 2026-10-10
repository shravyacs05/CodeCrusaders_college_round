import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: proxy API calls to the FastAPI backend. Prod: FastAPI serves dist/.
const api = 'http://localhost:8000'
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/projects': api, '/experiments': api, '/health': api } },
})
