import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, AlertCircle, Building, ArrowRight } from "lucide-react";
import { toast } from "sonner";

type Step = "loading" | "error" | "set-password" | "select-company" | "welcome";

interface CompanyMembership {
  company_id: string;
  company_name: string;
}

export default function ActivatePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  // Password step
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  // Company step
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  useEffect(() => {
    const activate = async () => {
      try {
        // Check for hash tokens (from invite link)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        if (accessToken && refreshToken) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setErr) throw setErr;
        }

        // Wait briefly for session
        await new Promise((r) => setTimeout(r, 500));
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          throw new Error("Kunne ikke validere invitasjonslenken. Den kan ha utløpt.");
        }

        const user = session.user;
        setUserId(user.id);
        setUserName(user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "");

        // Check if user needs to set password (invited users or recovery)
        const isInvite = type === "invite" || type === "magiclink" || type === "recovery";
        
        if (isInvite) {
          setStep("set-password");
        } else {
          // Already has password, check companies
          await loadCompanies(user.id);
        }
      } catch (err: any) {
        console.error("Activation error:", err);
        setErrorMsg(err.message || "En feil oppstod under aktivering.");
        setStep("error");
      }
    };

    activate();
  }, []);

  const loadCompanies = async (uid: string) => {
    const { data: memberships } = await supabase
      .from("user_memberships")
      .select("company_id")
      .eq("user_id", uid)
      .eq("is_active", true);

    if (!memberships || memberships.length === 0) {
      setStep("welcome");
      return;
    }

    if (memberships.length === 1) {
      localStorage.setItem("mcs_active_company", memberships[0].company_id);
      setStep("welcome");
      return;
    }

    // Multiple companies - fetch names
    const companyIds = memberships.map((m: any) => m.company_id);
    const { data: comps } = await supabase
      .from("internal_companies")
      .select("id, name")
      .in("id", companyIds);

    setCompanies(
      (comps || []).map((c: any) => ({ company_id: c.id, company_name: c.name }))
    );
    setStep("select-company");
  };

  const validatePassword = (pw: string): string[] => {
    const errors: string[] = [];
    if (pw.length < 10) errors.push("Minst 10 tegn");
    if (!/\d/.test(pw)) errors.push("Minst ett tall");
    if (!/[^a-zA-Z0-9]/.test(pw)) errors.push("Minst ett spesialtegn");
    return errors;
  };

  const handleSetPassword = async () => {
    const errors = validatePassword(password);
    setPasswordErrors(errors);
    if (errors.length > 0) return;
    if (password !== confirmPassword) {
      setPasswordErrors(["Passordene er ikke like"]);
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      toast.error("Kunne ikke sette passord", { description: error.message });
      return;
    }

    toast.success("Passord satt!");
    if (userId) {
      await loadCompanies(userId);
    } else {
      setStep("welcome");
    }
  };

  const handleSelectCompany = (companyId: string) => {
    setSelectedCompany(companyId);
    localStorage.setItem("mcs_active_company", companyId);
    setStep("welcome");
  };

  const handleGoToDashboard = () => {
    navigate("/app", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Loading */}
        {step === "loading" && (
          <div className="flex flex-col items-center gap-6 rounded-xl border bg-card p-8 shadow-sm text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">Aktiverer tilgang...</h2>
              <p className="mt-1 text-sm text-muted-foreground">Vennligst vent.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="flex flex-col items-center gap-6 rounded-xl border bg-card p-8 shadow-sm text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">Noe gikk galt</h2>
              <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>
            </div>
            <Button onClick={() => navigate("/login")} className="mt-2">
              Tilbake til innlogging
            </Button>
          </div>
        )}

        {/* Set Password */}
        {step === "set-password" && (
          <div className="flex flex-col gap-6 rounded-xl border bg-card p-8 shadow-sm">
            <div className="text-center">
              <h2 className="text-xl font-bold text-card-foreground">Opprett passord</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Velg et sikkert passord for kontoen din.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="password" className="text-xs">Nytt passord</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordErrors([]);
                  }}
                  placeholder="Minst 10 tegn"
                />
              </div>
              <div>
                <Label htmlFor="confirm" className="text-xs">Bekreft passord</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordErrors([]);
                  }}
                  placeholder="Gjenta passord"
                />
              </div>

              {passwordErrors.length > 0 && (
                <div className="rounded-md bg-destructive/10 p-3 space-y-1">
                  {passwordErrors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive">• {e}</p>
                  ))}
                </div>
              )}

              <div className="rounded-md bg-muted p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Passordkrav:</p>
                <p className={`text-xs ${password.length >= 10 ? "text-green-600" : "text-muted-foreground"}`}>
                  {password.length >= 10 ? "✓" : "○"} Minst 10 tegn
                </p>
                <p className={`text-xs ${/\d/.test(password) ? "text-green-600" : "text-muted-foreground"}`}>
                  {/\d/.test(password) ? "✓" : "○"} Minst ett tall
                </p>
                <p className={`text-xs ${/[^a-zA-Z0-9]/.test(password) ? "text-green-600" : "text-muted-foreground"}`}>
                  {/[^a-zA-Z0-9]/.test(password) ? "✓" : "○"} Minst ett spesialtegn
                </p>
              </div>
            </div>

            <Button onClick={handleSetPassword} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Fortsett
            </Button>
          </div>
        )}

        {/* Select Company */}
        {step === "select-company" && (
          <div className="flex flex-col gap-6 rounded-xl border bg-card p-8 shadow-sm">
            <div className="text-center">
              <h2 className="text-xl font-bold text-card-foreground">Velg selskap</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Du har tilgang til flere selskaper. Velg hvilket du vil jobbe i nå.
              </p>
            </div>

            <div className="space-y-2">
              {companies.map((c) => (
                <button
                  key={c.company_id}
                  onClick={() => handleSelectCompany(c.company_id)}
                  className="flex items-center gap-3 w-full rounded-lg border border-border p-4 text-left hover:bg-muted/50 hover:border-primary/30 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{c.company_name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Welcome */}
        {step === "welcome" && (
          <div className="flex flex-col items-center gap-6 rounded-xl border bg-card p-8 shadow-sm text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle className="h-9 w-9 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-card-foreground">
                Velkommen, {userName}!
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Du er nå klar til å bruke systemet. Alt er satt opp for deg.
              </p>
            </div>
            <Button onClick={handleGoToDashboard} size="lg" className="w-full gap-2 mt-2">
              <ArrowRight className="h-4 w-4" />
              Gå til dashbord
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
