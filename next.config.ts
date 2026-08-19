import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "out",
  // The packaged app loads out/index.html directly off disk via file:// —
  // Next's default asset paths are root-absolute ("/_next/..."), which
  // resolve to the filesystem root under file:// instead of the app's own
  // folder, so every JS/CSS chunk 404s silently and the window is just a
  // blank white page. Relative paths fix that; harmless for `next dev`.
  assetPrefix: "./",
  images: {
    unoptimized: true,
  },
  devIndicators: false,
};

export default nextConfig;
