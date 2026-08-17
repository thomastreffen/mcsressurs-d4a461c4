import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Wrench, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  // If already logged in, redirect
  useEffect(() => {
    if (!authLoading && session) {
      navigate("/", { replace: true });
    }
  }, [session, authLoading, navigate]);

  const handleLogin = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);

    try {
      const result = await lovable.auth.signInWithOAuth("microsoft", {
        redirect_uri: window.location.origin,
      });

      if (result.error) {
        toast.error("Innlogging feilet", {
          description: result.error.message || "Kunne ikke koble til Microsoft.",
        });
        setIsSigningIn(false);
        return;
      }

      if (!result.redirected) {
        navigate("/", { replace: true });
      }
    } catch (error) {
      toast.error("Innlogging feilet", {
        description: error instanceof Error ? error.message : "Kunne ikke koble til Microsoft.",
      });
      setIsSigningIn(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Laster...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wrench className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-card-foreground">MCS Service</h1>
            <p className="text-sm text-muted-foreground">Ressursplanlegger</p>
          </div>
        </div>

        <Button onClick={handleLogin} className="w-full gap-2" size="lg" disabled={isSigningIn}>
          {isSigningIn ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
          <svg viewBox="0 0 21 21" className="h-5 w-5" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="hsl(var(--destructive))" />
            <rect x="11" y="1" width="9" height="9" fill="hsl(var(--status-accepted))" />
            <rect x="1" y="11" width="9" height="9" fill="hsl(var(--primary))" />
            <rect x="11" y="11" width="9" height="9" fill="hsl(var(--status-pending))" />
          </svg>
          )}
          {isSigningIn ? "Åpner Microsoft..." : "Logg inn med Microsoft"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Kun tilgjengelig for ansatte i organisasjonen.
        </p>
      </div>
    </div>
  );
}
