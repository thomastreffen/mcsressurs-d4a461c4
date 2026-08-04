import { AbsoluteFill, useCurrentFrame, spring, interpolate } from "remotion";
import { MicroflowLogo, spaceGrotesk, inter } from "../components/Logo";

export const Scene1 = () => {
  const frame = useCurrentFrame();

  const logoScale = spring({ frame: frame - 10, fps: 30, config: { damping: 12, stiffness: 150 } });
  const titleOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [20, 40], [30, 0], { extrapolateRight: "clamp" });
  const subtitleOpacity = interpolate(frame, [45, 65], [0, 1], { extrapolateRight: "clamp" });
  const pillsOpacity = interpolate(frame, [70, 85], [0, 1], { extrapolateRight: "clamp" });

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
      <div style={{ transform: `scale(${logoScale})`, marginBottom: 24 }}>
        <MicroflowLogo size={72} />
      </div>

      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
        <h1
          style={{
            fontFamily: spaceGrotesk,
            fontSize: 84,
            fontWeight: 700,
            lineHeight: 1.05,
            margin: 0,
            maxWidth: 1100,
          }}
        >
          Kontrollrommet for
          <br />
          <span style={{ background: "linear-gradient(90deg, #22D3EE, #3B82F6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            tekniske servicebedrifter
          </span>
        </h1>
      </div>

      <p
        style={{
          opacity: subtitleOpacity,
          fontSize: 24,
          lineHeight: 1.5,
          maxWidth: 800,
          marginTop: 28,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        Microflow samler henvendelser, kunder, oppdrag, ressursplan, dokumentasjon, HMS, fravær og fakturagrunnlag i én bransjetilpasset flyt.
      </p>

      <div
        style={{
          opacity: pillsOpacity,
          display: "flex",
          gap: 14,
          marginTop: 36,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {["Bygget for tekniske bedrifter", "Fra innboks til faktura", "Tilpasses elektro, VVS, varmepumpe og tavle"].map((t) => (
          <span
            key={t}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid rgba(59,130,246,0.4)",
              background: "rgba(59,130,246,0.1)",
              fontSize: 15,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
