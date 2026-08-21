"use client";

interface NotasLogoProps {
  size?: number;
  className?: string;
}

// Notas is a first-party feature, not an embedded service, so it doesn't
// have a ServiceDefinition/brand color of its own — this gives it the same
// visual treatment (colored badge + glyph) as ServiceIcon does for the
// embedded services, so it doesn't read as a bare unstyled icon next to them.
export function NotasLogo({ size = 20, className }: NotasLogoProps) {
  const boxSize = size + 8;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md ${className ?? ""}`}
      style={{ width: boxSize, height: boxSize, backgroundColor: "#f2b705" }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M6 3h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#713f12" />
        <path d="M15 3v4a1 1 0 0 0 1 1h4" fill="#fef9c3" />
        <path d="M7.5 12h6M7.5 15h4.5" stroke="#fef9c3" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
