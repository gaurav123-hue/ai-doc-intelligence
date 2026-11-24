
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Configure Vite development server and backend communication.
export default defineConfig({
  plugins: [react()],

  server: {
    // Forward frontend API requests to the FastAPI backend.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,

        // Remove /api before forwarding the request.
        // Example: /api/sessions/start -> /sessions/start
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
