import { useCurrentFrame, useVideoConfig } from "remotion";

export const PersistentBackground = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const gridSpacing = 60;
  const offset = (frame * 0.5) % gridSpacing;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(135deg, #0B1220 0%, #111827 50%, #0B1220 100%)",
        overflow: "hidden",
      }}
    >
      {/* Subtle grid */}
      <svg width={width} height={height} style={{ opacity: 0.12 }}>
        <defs>
          <pattern id="grid" width={gridSpacing} height={gridSpacing} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSpacing} 0 L 0 0 0 ${gridSpacing}`} fill="none" stroke="#3B82F6" strokeWidth={1} />
          </pattern>
        </defs>
        <rect width={width + gridSpacing} height={height + gridSpacing} fill="url(#grid)" x={-offset} y={-offset} />
      </svg>

      {/* Glow orbs */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.25) 0%, rgba(59,130,246,0) 70%)",
          top: -200,
          right: -100,
          transform: `translateY(${Math.sin(frame / 80) * 30}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.15) 0%, rgba(34,211,238,0) 70%)",
          bottom: -150,
          left: -100,
          transform: `translateY(${Math.cos(frame / 90) * 20}px)`,
        }}
      />
    </div>
  );
};
