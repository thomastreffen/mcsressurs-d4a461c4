import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isStandalone } from "@/pwa/registerSW";
import { InstallAppDialog } from "./InstallAppDialog";
import { Smartphone } from "lucide-react";
export function HomeScreenHelp() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("mcs.homescreen.help.seen") === "1"; } catch { return false; }
  });
  if (isStandalone()) return null;
  return <section className="border-t border-border pt-4">
    <Button variant="ghost" className="min-h-11 h-auto whitespace-normal text-left justify-start" onClick={() => setOpen(true)}><Smartphone className="h-4 w-4 mr-2 shrink-0" />Legg MCS Hub på hjemskjermen</Button>
    {!dismissed && <div className="text-sm text-muted-foreground mt-2"><p>iPhone: Safari → Del → Legg til på Hjem-skjerm. Android: Chrome → ⋮ → Legg til på startskjerm.</p><Button variant="ghost" size="sm" className="min-h-11" onClick={() => { try { localStorage.setItem("mcs.homescreen.help.seen", "1"); } catch { /* optional preference */ } setDismissed(true); }}>Skjul veiledning</Button></div>}
    <InstallAppDialog open={open} onOpenChange={setOpen} />
  </section>;
}