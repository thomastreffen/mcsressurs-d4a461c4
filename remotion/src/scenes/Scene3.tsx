import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";
import { spaceGrotesk, inter } from "../components/Logo";

const ROWS = [
  { icon: "✉", label: "Nye henvendelser", sub: "5 ulest", value: "23", dot: "#3B82F6" },
  { icon: "⚡", label: "Dagens oppdrag", sub: "12 pågår", value: "38", dot: "#22D3EE" },
  { icon: "📊", label: "Ressursutnyttelse", sub: "14 montører ute", value: "76%", dot: "#22D3EE" },
  { icon: "⚠", label: "Åpne avvik", sub: "2 krever oppfølging", value: "7", dot: "#F59E0B" },
  { icon: "🗓", label: "Fravær i dag", sub: "1 sykemeldt", value: "3", dot: "#A78BFA" },
  { icon: "🛡", label: "HMS-punkter", sub: "3 forfaller denne uka", value: "11", dot: "#3B82F6" },
  { icon: "💰", label: "Fakturagrunnlag klart", sub: "kr 412 800", value: "18", dot: "#10B981" },
  { icon: "📄", label: "Serviceavtaler — 30 dager", sub: "4 trenger booking", value: "9", dot: "#3B82F6" },
];

export const Scene3 = () => {
  const frame = useCurrentFrame();
  const panelScale = spring({ frame: frame - 5, fps: 30, config: { damping: 14, stiffness: 100 } });
  const panelOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

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
          opacity: panelOpacity,
          transform: `scale(${panelScale})`,
          width: 720,
          borderRadius: 24,
          background: "linear-gradient(180deg, rgba(17,24,39,0.95) 0%, rgba(11,18,32,0.95) 100%)",
          border: "1px solid rgba(59,130,246,0.25)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.5), 0 0 40px rgba(59,130,246,0.15)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "22px 28px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <p style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", margin: "0 0 4px 0" }}>
              I dag · Onsdag
            </p>
            <h2 style={{ fontFamily: spaceGrotesk, fontSize: 24, fontWeight: 700, margin: 0 }}>Operativ oversikt</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
            Sanntid
          </div>
        </div>

        {/* Rows */}
        <div>
          {ROWS.map((row, i) => {
            const delay = 10 + i * 5;
            const rowOpacity = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateRight: "clamp" });
            const rowX = interpolate(frame, [delay, delay + 12], [30, 0], { extrapolateRight: "clamp" });
            return (
              <div
                key={row.label}
                style={{
                  opacity: rowOpacity,
                  transform: `translateX(${rowX}px)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 28px",
                  borderBottom: i < ROWS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{row.icon}</span>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 2px 0" }}>{row.label}</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>{row.sub}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: spaceGrotesk, fontSize: 24, fontWeight: 700 }}>{row.value}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: row.dot }} />
                </div>
              </div>
            );
          })}
        </div>
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
        Én oversikt. Alle avdelinger. Ingen Excel.
      </div>
    </AbsoluteFill>
  );
};
