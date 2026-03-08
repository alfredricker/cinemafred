import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [vinext()],
  ssr: {
    external: ["cloudflare:workers"],
  },
  build: {
    rollupOptions: {
      external: ["cloudflare:workers"],
    },
  },
});
