"use client";

import SoftAurora from "@/app/components/SoftAurora";

export function AmbientBackdrop({
  variant,
}: {
  variant: "landing" | "studio";
}) {
  return (
    <div
      className={`ambient-backdrop is-${variant}`}
      aria-hidden="true"
      data-testid={`${variant}-ambient-backdrop`}
    >
      <SoftAurora
        speed={variant === "landing" ? 0.34 : 0.2}
        scale={variant === "landing" ? 1.42 : 1.68}
        brightness={variant === "landing" ? 0.82 : 0.54}
        color1="#d8ff5e"
        color2="#a9dd58"
        noiseFrequency={2.1}
        noiseAmplitude={0.82}
        bandHeight={variant === "landing" ? 0.48 : 0.38}
        bandSpread={1.16}
        octaveDecay={0.16}
        layerOffset={0.62}
        colorSpeed={0.34}
        enableMouseInteraction={false}
      />
      <span className="ambient-halo is-primary" />
      <span className="ambient-halo is-secondary" />
      <span className="ambient-noise" />
    </div>
  );
}
