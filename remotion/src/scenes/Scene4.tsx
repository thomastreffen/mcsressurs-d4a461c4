import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";
import { spaceGrotesk, inter } from "../components/Logo";

const MODULES = [
  { title: "Henvendelser", desc: "Innboks, leads og kundemeldinger" },
  { title: "Kunder", desc: "Kartotek, avtaler og historikk" },
  { title: "Tilbud & salg", desc: "Kalkyle, tilbud og oppfølging" },
  { title: "Ressursplan", desc: "Ukevis planlegging av teknikere" },
  { title: "Oppdrag", desc: "Jobber, oppgaver og arbeidsflyt" },
  { title: "Materialliste", desc: "Innkjøp, plukk og levering" },
  { title: "Dokumentasjon", desc: "Bilder, FDV og prosjektdokumenter" },
  { title: "Skjema", desc: "Sjekklister og servicerapporter" },
  { title: "HMS", desc: "SJA, avvik og sikker jobb-analyse" },
  { title: "Fravær", desc: "Ferie, sykdom og fraværsplanlegging" },
  { title: "Kundeportal", desc: "Status og deling med kunde" },
  { title: "Fakturagrunnlag", desc: "Timer, materiell og reise" },
];

export const Scene4 = () => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: inter,
      }}
    >
      <div style={{ opacity: titleOpacity, textAlign: "center", marginBottom: 40 }}>
        <p style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase", color: "#3B82F6", marginBottom: 12 }}>
          Alle moduler
        </p>
        <h2 style={{ fontFamily: spaceGrotesk, fontSize: 52, fontWeight: 700, margin: 0 }}>
          Hele driften i én plattform
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, maxWidth: 1420 }}>
        {MODULES.map((m, i) => {
          const delay = 10 + i * 4;
          const scale = spring({ frame: frame - delay, fps: 30, config: { damping: 12, stiffness: 140 } });
          const opacity = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={m.title}
              style={{
                opacity,
                transform: `scale(${scale})`,
                padding: "18px 20px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                minHeight: 96,
              }}
            >
              <h3 style={{ fontFamily: spaceGrotesk, fontSize: 19, fontWeight: 600, margin: "0 0 8px 0" }}>{m.title}</h3>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.4 }}>{m.desc}</p>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 36,
          opacity: interpolate(frame, [80, 95], [0, 1], { extrapolateRight: "clamp" }),
          fontSize: 18,
          color: "rgba(255,255,255,0.7)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span>Henvendelser</span>
        <span style={{ color: "#3B82F6" }}>→</span>
        <span>Planlegging</span>
        <span style={{ color: "#3B82F6" }}>→</span>
        <span>Utførelse</span>
        <span style={{ color: "#3B82F6" }}>→</span>
        <span>Faktura</span>
      </div>
    </AbsoluteFill>
  );
};
