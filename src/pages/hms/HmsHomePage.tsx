import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import HmsMobilePage from "./HmsMobilePage";
import HmsOverviewPage from "./HmsOverviewPage";

/**
 * /hms-inngangen: telefon (<768px) får den operative HMS-arbeidsflaten,
 * nettbrett/desktop beholder den administrative oversikten.
 * `?vis=oversikt` tvinger den administrative oversikten også på telefon
 * (brukes fra «HMS-oversikt» under Mer HMS for ledere/admin).
 * Samme data og RLS — kun presentasjonsvalg.
 */
export default function HmsHomePage() {
  const isMobile = useIsMobile();
  const [params] = useSearchParams();
  if (params.get("vis") === "oversikt") return <HmsOverviewPage />;
  return isMobile ? <HmsMobilePage /> : <HmsOverviewPage />;
}
