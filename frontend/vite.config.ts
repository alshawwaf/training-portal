import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");

  const frontendPort = parseInt(env.FRONTEND_PORT || "9090");
  const backendPort = env.BACKEND_PORT || "8000";
  const backendUrl = env.VITE_API_URL || `http://127.0.0.1:${backendPort}`;

  return {
    plugins: [react()],
    envDir: "..", // Point to parent directory for .env
    server: {
      port: frontendPort,
      host: "0.0.0.0", // Allow external connections (needed for Docker)
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/auth": {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
