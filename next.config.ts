import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "out",
  // The packaged app loads out/index.html directly off disk via file:// —
  // Next's default asset paths are root-absolute ("/_next/..."), which
  // resolve to the filesystem root under file:// instead of the app's own
  // folder, so every JS/CSS chunk 404s silently and the window is just a
  // blank white page. Relative paths fix that. Scoped to production only —
  // `next dev`'s Turbopack streaming/HMR client hangs before hydrating when
  // this is set, specifically inside Electron's webContents (confirmed by
  // bisecting against commit a760919, from before this was added).
  ...(process.env.NODE_ENV === "production" ? { assetPrefix: "./" } : {}),
  images: {
    unoptimized: true,
  },
  devIndicators: false,
};

export default nextConfig;
