/// <reference types="vitest" />
import path from "node:path"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

// When running inside Docker the backend is reachable via its service name.
// When running locally, override with BACKEND_PROXY_URL=http://localhost in .env
const backendProxyTarget = process.env.BACKEND_PROXY_URL ?? "http://backend:8000"

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react(), TanStackRouterVite()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: backendProxyTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
        headers: {
          Host: "localhost",
        },
      },
      "/docs": {
        target: backendProxyTarget,
        changeOrigin: true,
        secure: false,
        headers: {
          Host: "localhost",
        },
      },
      "/openapi.json": {
        target: backendProxyTarget,
        changeOrigin: true,
        secure: false,
        headers: {
          Host: "localhost",
        },
      },
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
  },
})
