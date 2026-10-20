import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': { target: `http://127.0.0.1:${process.env.UI_PSY_API_PORT || 8173}`, changeOrigin: false } } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
