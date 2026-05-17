import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/v1": "http://localhost:8000",
      "/a2a": "http://localhost:8000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "mui": ["@mui/material", "@mui/icons-material"],
          "emotion": ["@emotion/react", "@emotion/styled"],
          "recharts": ["recharts"],
        },
      },
    },
  },
});
