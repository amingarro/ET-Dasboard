"use client";

import { motion } from "motion/react";

const CIRCLES = [
  { className: "bg-primary", delay: 0 },
  { className: "bg-secondary", delay: 0.35 },
  { className: "bg-accent", delay: 0.7 },
];

const DURATION_S = 1.8;

export function LoadingScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-base-100">
      <div className="relative h-20 w-20">
        {CIRCLES.map((circle, i) => (
          <motion.span
            key={i}
            className={`absolute inset-0 rounded-full mix-blend-screen ${circle.className}`}
            initial={{ scale: 0, opacity: 0.85 }}
            animate={{ scale: [0, 1.6], opacity: [0.85, 0] }}
            transition={{
              duration: DURATION_S,
              delay: circle.delay,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
