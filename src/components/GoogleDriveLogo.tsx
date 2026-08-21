"use client";

interface GoogleDriveLogoProps {
  size?: number;
  className?: string;
}

// The real tricolor Drive triangle, not a monochrome brand glyph — Font
// Awesome's own faGoogleDrive path data (free-brands-svg-icons) already
// splits into these exact 3 facets, just rendered as one flat-colored path;
// this reuses that geometry but paints each facet its real Drive color
// (yellow apex, green base, blue left) instead of a single fill.
export function GoogleDriveLogo({ size = 18, className }: GoogleDriveLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className}>
      <path d="M339 314.9L175.4 32 336.6 32 500.2 314.9 339 314.9z" fill="#FFBA00" />
      <path d="M201.5 338.5l-80.6 141.5 310.5 0 80.6-141.5-310.5 0z" fill="#00AC47" />
      <path d="M154.1 67.4L0 338.5 80.6 480 237 208.8 154.1 67.4z" fill="#2684FC" />
    </svg>
  );
}
