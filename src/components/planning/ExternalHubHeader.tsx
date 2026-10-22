import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function ExternalHubHeader({ onLogout }: { onLogout?: () => void }) {
  return <header className="border-b border-border bg-background"><div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
    <Link to="/ekstern" className="flex min-h-11 items-center gap-3"><img src="/favicon.png" alt="" className="h-10 w-10 object-contain" /><span className="text-xl font-semibold text-primary">MCS Hub</span></Link>
    {onLogout && <Button variant="ghost" className="min-h-11 shrink-0" onClick={onLogout}><LogOut className="h-4 w-4" />Logg ut</Button>}
  </div></header>;
}