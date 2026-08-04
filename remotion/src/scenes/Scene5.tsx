import { AbsoluteFill, useCurrentFrame, spring, interpolate } from "remotion";
import { MicroflowLogo, spaceGrotesk, inter } from "../components/Logo";

export const Scene5 = () => {
  const frame = useCurrentFrame();
  const scale = spring({ frame: frame - 5, fps: 30, config: { damping: 12, stiffness: 100 } });
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: inter,
        textAlign: "center",
      }}
    >
      <div style={{ opacity, transform: `scale(${scale})` }}>
        <MicroflowLogo size={80} />
      </div>

      <h2
        style={{
          opacity,
          fontFamily: spaceGrotesk,
          fontSize: 72,
          fontWeight: 700,
          margin: "28px 0 20px 0",
          transform: `translateY(${interpolate(frame, [10, 30], [20, 0], { extrapolateRight: "clamp" })}px)`,
        }}
      >
        Klar for å samle driften?
      </h2>

      <div
        style={{
          opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [25, 45], [20, 0], { extrapolateRight: "clamp" })}px)`,
          display: "flex",
          gap: 20,
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <span
          style={{
            background: "#3B82F6",
            color: "white",
            padding: "16px 32px",
            borderRadius: 10,
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          Book demo
        </span>
        <span style={{ fontSize: 20, color: "rgba(255,255,255,0.7)" }}>microflow.no</span>
      </div>
    </AbsoluteFill>
  );
};
