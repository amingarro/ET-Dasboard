"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ServiceDefinition } from "@/lib/services";

interface ServiceIconProps {
  service: ServiceDefinition;
  size: number;
  className?: string;
}

// Very dark brand colors (e.g. GitHub's near-black) disappear against a dark
// dock background, so invert those specifically: a light badge with the
// glyph in the brand color, instead of a same-color-on-dark badge that
// blends into the surroundings regardless of app theme.
function isNearBlack(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.25;
}

export function ServiceIcon({ service, size, className }: ServiceIconProps) {
  const boxSize = size + 4;
  const glyphSize = Math.round(size * 0.75);
  const inverted = !service.iconBackground && isNearBlack(service.color);
  const bg = service.iconBackground ?? (inverted ? "#f3f4f6" : service.color);
  const glyphColor = inverted ? service.color : "#fff";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md ${
        inverted ? "ring-1 ring-black/10" : ""
      } ${className ?? ""}`}
      style={{ width: boxSize, height: boxSize, background: bg }}
    >
      <FontAwesomeIcon icon={service.icon} style={{ width: glyphSize, height: glyphSize, color: glyphColor }} />
    </span>
  );
}
