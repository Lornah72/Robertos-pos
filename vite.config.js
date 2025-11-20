// vite.config.mjs
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Robertos-pos/",   // 👈 ADD THIS LINE
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const BRIDGE = env.VITE_BRIDGE_URL || "http://localhost:5050";

  return {
    plugins: [react()],
    server: {
      proxy: {
        // REST to the bridge
        "/auth": { target: BRIDGE, changeOrigin: true, secure: false },
        "/health": { target: BRIDGE, changeOrigin: true, secure: false },
        "/bc": { target: BRIDGE, changeOrigin: true, secure: false },
        "/pos": { target: BRIDGE, changeOrigin: true, secure: false },

        // ✅ Socket.IO (WS) → bridge
        "/socket.io": {
          target: BRIDGE,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "framer-motion", "lucide-react", "recharts"],
    },
  };
});
