/// <reference types="vitest" />
import path from "node:path"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

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
        target: "http://localhost",
        changeOrigin: true,
        secure: false,
        headers: {
          Host: "api.staging.rsc-xchange.app",
        },
      },
      "/docs": {
        target: "http://localhost",
        changeOrigin: true,
        secure: false,
        headers: {
          Host: "api.staging.rsc-xchange.app",
        },
      },
      "/openapi.json": {
        target: "http://localhost",
        changeOrigin: true,
        secure: false,
        headers: {
          Host: "api.staging.rsc-xchange.app",
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
