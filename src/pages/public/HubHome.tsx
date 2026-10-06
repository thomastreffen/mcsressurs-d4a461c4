import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Loader2, CalendarRange, FolderKanban, Users, Handshake, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable";
import hubLogo from "@/assets/mcs/mcs-hub-logo.webp.asset.json";

const UNITS = ["Mjøndalen", "Biri", "Jaren", "Tromsø", "Service"];

const AREAS = [
  { icon: CalendarRange, title: "Planlegging", desc: "Se kommende jobber og fordel ansvar." },
  { icon: FolderKanban, title: "Prosjekter", desc: "Samle dialog, filer, oppgaver og arbeidspakker." },
  { icon: Users, title: "Ressurser", desc: "Planlegg kapasitet og bemanning." },
  { icon: Handshake, title: "Samarbeid", desc: "Del informasjon mellom avdelinger, partnere og kunder." },
];

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" className="h-5 w-5" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="hsl(var(--destructive))" />
      <rect x="11" y="1" width="9" height="9" fill="hsl(var(--status-accepted))" />
      <rect x="1" y="11" width="9" height="9" fill="hsl(var(--hub-blue))" />
      <rect x="11" y="11" width="9" height="9" fill="hsl(var(--status-pending))" />
    </svg>
  );
}

/** Offentlig inngang til MCS Hub – portal for ansatte, partnere og kunder. */
export default function HubHome() {
  const { session, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    document.title = "MCS Hub — Felles portal for planlegging, prosjekter og samarbeid";
  }, []);

  // Innloggede brukere kan se forsiden. Vi sender dem bare videre rett etter
  // Microsoft-innlogging, eller når de åpner /login direkte.
  const { pathname } = useLocation();
  const POST_LOGIN_KEY = "mcs:hub-post-login";
  if (!loading && session) {
    const justSignedIn = sessionStorage.getItem(POST_LOGIN_KEY) === "1";
    if (justSignedIn || pathname === "/login") {
      sessionStorage.removeItem(POST_LOGIN_KEY);
      return <Navigate to="/overview" replace />;
    }
  }

  const login = async () => {
    if (signingIn) return;
    setSigningIn(true);
    sessionStorage.setItem("mcs:hub-post-login", "1");
    try {
      const result = await lovable.auth.signInWithOAuth("microsoft", { redirect_uri: window.location.origin });
      if (result.error) {
        toast.error("Innlogging feilet", { description: result.error.message || "Kunne ikke koble til Microsoft." });
        setSigningIn(false);
      }
    } catch (e) {
      toast.error("Innlogging feilet", { description: e instanceof Error ? e.message : "Kunne ikke koble til Microsoft." });
      setSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/60 bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <img src={hubLogo.url} alt="MCS Hub" className="h-8 w-auto" />
          <nav className="flex items-center gap-5 text-sm text-muted-foreground" aria-label="Hovedmeny">
            <a href="#om" className="hover:text-foreground">Om MCS Hub</a>
            <a href="/portal/login" className="hover:text-foreground">Kundeportal</a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              maskImage: "radial-gradient(ellipse at 70% 40%, black 20%, transparent 70%)",
            }}
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:py-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hub-blue">Hub &amp; Partner Portal</p>
              <h1 className="mt-3 text-4xl font-bold leading-tight text-hub-ink lg:text-5xl">
                Ett felles sted for hele MCS.
              </h1>
              <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                Planlegging, prosjekter, samarbeid og drift på tvers av MCS, partnere og kunder.
              </p>
              <div className="mt-8">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Samler enhetene</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {UNITS.map((u) => (
                    <li key={u} className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-hub-ink">
                      MCS {u}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-hub-blue" />
                <h2 className="text-lg font-semibold text-hub-ink">{session ? "Velkommen tilbake" : "Logg inn på MCS Hub"}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">For ansatte, samarbeidspartnere og kunder med tilgang.</p>
              {session ? (
                <>
                  <Link
                    to="/overview"
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-hub-ink px-4 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                  >
                    Gå til arbeidsflaten <ArrowRight className="h-4 w-4" />
                  </Link>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Du er logget inn{session.user?.email ? ` som ${session.user.email}` : ""}.
                  </p>
                </>
              ) : (
                <>
              <button
                type="button"
                onClick={login}
                disabled={signingIn || loading}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-hub-ink px-4 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {signingIn || loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MicrosoftMark />}
                {signingIn ? "Åpner Microsoft …" : "Logg inn med Microsoft"}
              </button>
              <p className="mt-3 text-xs text-muted-foreground">Bruk jobbkontoen din. Du sendes rett til din arbeidsflate.</p>
                </>
              )}
              <div className="mt-6 border-t border-border pt-4">
                <a href="/portal/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-hub-blue hover:underline">
                  Kunde eller partner uten Microsoft-konto? Logg inn her <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="om" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Hva MCS Hub brukes til</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AREAS.map((a) => (
              <div key={a.title} className="rounded-xl border border-border bg-card p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-hub-blue/10 text-hub-blue">
                  <a.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold text-hub-ink">{a.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{a.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} MCS · En del av Ernströmgruppen</span>
          <span>Trenger du tilgang? Kontakt din nærmeste leder i MCS.</span>
        </div>
      </footer>
    </div>
  );
}
