import { useIsMobile } from "@/hooks/use-mobile";
import HmsMobilePage from "./HmsMobilePage";
import HmsOverviewPage from "./HmsOverviewPage";

/**
 * /hms-inngangen: telefon (<768px) får den operative HMS-arbeidsflaten,
 * nettbrett/desktop beholder den administrative oversikten.
 * Samme data og RLS — kun presentasjonsvalg.
 */
export default function HmsHomePage() {
  const isMobile = useIsMobile();
  return isMobile ? <HmsMobilePage /> : <HmsOverviewPage />;
}
