import { AbsoluteFill, staticFile, useCurrentFrame, interpolate, spring, Img } from "remotion";
import { spaceGrotesk, inter } from "../components/Logo";

export const Scene3 = () => {
  const frame = useCurrentFrame();
  const imageScale = spring({ frame: frame - 5, fps: 30, config: { damping: 14, stiffness: 100 } });
  const imageOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: inter,
      }}
    >
      <div
        style={{
          opacity: imageOpacity,
          transform: `scale(${imageScale})`,
          width: 1400,
          borderRadius: 24,
          background: "linear-gradient(180deg, rgba(17,24,39,0.95) 0%, rgba(11,18,32,0.95) 100%)",
          border: "1px solid rgba(59,130,246,0.25)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.5), 0 0 40px rgba(59,130,246,0.15)",
          overflow: "hidden",
          padding: 24,
        }}
      >
        {/* Header inside the panel */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 8px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <p style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", margin: "0 0 4px 0" }}>
              Uke 32 · 4.–10. august 2026
            </p>
            <h2 style={{ fontFamily: spaceGrotesk, fontSize: 24, fontWeight: 700, margin: 0 }}>Ressursplan</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
            Sanntid
          </div>
        </div>

        {/* Screenshot */}
        <Img
          src={staticFile("resource-planner-screenshot.png")}
          style={{
            width: "100%",
            height: "auto",
            borderRadius: 16,
            marginTop: 16,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 60,
          opacity: interpolate(frame, [60, 80], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [60, 80], [20, 0], { extrapolateRight: "clamp" })}px)`,
          fontSize: 18,
          color: "rgba(255,255,255,0.7)",
        }}
      >
        Én oversikt. Alle montører. Ingen Excel.
      </div>
    </AbsoluteFill>
  );
};
