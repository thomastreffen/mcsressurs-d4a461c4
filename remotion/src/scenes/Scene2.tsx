import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";
import { spaceGrotesk, inter } from "../components/Logo";

const ITEMS = [
  { no: "01", title: "E-post blir arbeidsordre", desc: "Henvendelser kommer på e-post, telefon og skjema, men må manuelt følges opp." },
  { no: "02", title: "Ressursplanen lever i Excel", desc: "Folk, oppdrag, ferie og sykdom er vanskelig å holde samlet." },
  { no: "03", title: "Dokumentasjon kommer for sent", desc: "Bilder, sjekklister, FDV og rapporter ligger spredt." },
  { no: "04", title: "HMS blir en egen øy", desc: "SJA, avvik og sikker jobb-analyse kobles ikke naturlig til oppdraget." },
  { no: "05", title: "Fravær meldes uten system", desc: "Ferie, fri og sykdom påvirker ressursplanen, men ligger ofte utenfor planleggingen." },
  { no: "06", title: "Fakturagrunnlag må jages", desc: "Timer, materiell, reise og tillegg kommer ikke inn samlet." },
];

export const Scene2 = () => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 20], [20, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 140px",
        color: "white",
        fontFamily: inter,
      }}
    >
      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)`, marginBottom: 48 }}>
        <p style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase", color: "#3B82F6", marginBottom: 12 }}>
          Driftslogg
        </p>
        <h2
          style={{
            fontFamily: spaceGrotesk,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.1,
            maxWidth: 600,
            margin: 0,
          }}
        >
          Det som ofte glipper når driften styres fra innboksen
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 48px" }}>
        {ITEMS.map((item, i) => {
          const delay = 15 + i * 8;
          const itemOpacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: "clamp" });
          const itemX = interpolate(frame, [delay, delay + 15], [40, 0], { extrapolateRight: "clamp" });
          const itemScale = spring({ frame: frame - delay, fps: 30, config: { damping: 15, stiffness: 120 } });
          return (
            <div
              key={item.no}
              style={{
                opacity: itemOpacity,
                transform: `translateX(${itemX}px) scale(${itemScale})`,
                display: "flex",
                gap: 18,
                alignItems: "flex-start",
                padding: "18px 20px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span
                style={{
                  fontFamily: spaceGrotesk,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#3B82F6",
                  minWidth: 28,
                }}
              >
                {item.no}
              </span>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px 0" }}>{item.title}</h3>
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.4 }}>{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
