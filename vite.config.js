/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/piano/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["**/*"],
      manifest: {
        name: "3D Piano",
        short_name: "Piano",
        description: "A 3D piano you can play in your browser.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "fullscreen",
        orientation: "landscape",
        scope: "/piano/",
        start_url: "/piano/",
        icons: [
          {
            src: "icons/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
  },
});
