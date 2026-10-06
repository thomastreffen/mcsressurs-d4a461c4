import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, CheckCircle } from "lucide-react";
import hubLogo from "@/assets/mcs/mcs-hub-logo.webp.asset.json";

export default function PortalLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if already logged in as customer
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.user_metadata?.app_role === "customer_user") {
        navigate("/portal", { replace: true });
      }
      setChecking(false);
    });
  }, [navigate]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/portal/activate`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      console.error("Magic link error:", err);
      // Don't reveal if email exists or not for security
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-8 rounded-xl border bg-card p-8 shadow-sm">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <a href="/" aria-label="MCS Hub forside">
              <img src={hubLogo.url} alt="MCS Hub" className="h-10 w-auto" />
            </a>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-card-foreground">
                Kundeportal
              </h1>
              <p className="text-sm text-muted-foreground">
                For kunder og samarbeidspartnere
              </p>
            </div>
          </div>

          {sent ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-card-foreground">
                  Sjekk e-posten din
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vi har sendt en innloggingslenke til <strong>{email}</strong>.
                  Klikk på lenken for å logge inn.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSent(false)}
                className="mt-2"
              >
                Prøv med en annen e-post
              </Button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="w-full space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  E-postadresse
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="din@epost.no"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <Button type="submit" className="w-full bg-hub-ink text-background hover:bg-hub-ink/90" size="lg" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Send innloggingslenke
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Du får en sikker lenke på e-post. Ingen passord nødvendig.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
