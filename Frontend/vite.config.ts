import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'Backend authentication server (http://127.0.0.1:4000) is offline or unreachable. Please start the backend server.',
                message: 'Backend authentication server (http://127.0.0.1:4000) is offline or unreachable. Please start the backend server.'
              }));
            }
          });
        }
      }
    }
  }
})
