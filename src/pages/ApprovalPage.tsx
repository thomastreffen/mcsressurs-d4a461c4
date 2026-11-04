import { useState, useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { invokeWithSession } from "@/lib/invoke-session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Wrench } from "lucide-react";

type ApprovalAction = "approve" | "reject" | "reschedule";

export default function ApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const actionParam = searchParams.get("action") as ApprovalAction | null;
  const { session, loading: authLoading } = useAuth();
  const [jobPath, setJobPath] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!token || !session || authLoading) return;
    void invokeWithSession<{ path: string }>("job-access", { body: { action: "resolve", token } }).then(({ data }) => {
      if (active && data?.path?.startsWith("/job-info/")) setJobPath(data.path);
    });
    return () => { active = false; };
  }, [token, session?.user.id, authLoading]);
  const returnPath = `/approval/${encodeURIComponent(token ?? "")}`;
  const persistentLink = <Button variant="outline" asChild className="min-h-11 w-full"><Link to={jobPath ?? (session ? "/my-day" : `/login?next=${encodeURIComponent(returnPath)}`)}>Åpne jobbinfo og vedlegg</Link></Button>;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reject form
  const [comment, setComment] = useState("");

  // Reschedule form
  const [proposedStartDate, setProposedStartDate] = useState("");
  const [proposedStartTime, setProposedStartTime] = useState("08:00");
  const [proposedEndDate, setProposedEndDate] = useState("");
  const [proposedEndTime, setProposedEndTime] = useState("16:00");

  const [action, setAction] = useState<ApprovalAction | null>(actionParam);

  const handleSubmit = async () => {
    if (!token || !action) return;
    setLoading(true);
    setError(null);

    try {
      const body: any = { token, action };

      if (action === "reject") {
        if (!comment.trim()) {
          setError("Du må oppgi en begrunnelse for avslaget.");
          setLoading(false);
          return;
        }
        body.comment = comment;
      }

      if (action === "reschedule") {
        if (!proposedStartDate || !proposedStartTime || !proposedEndDate || !proposedEndTime) {
          setError("Du må fylle ut foreslått start og slutt.");
          setLoading(false);
          return;
        }
        body.proposed_start = new Date(`${proposedStartDate}T${proposedStartTime}`).toISOString();
        body.proposed_end = new Date(`${proposedEndDate}T${proposedEndTime}`).toISOString();
        if (comment.trim()) body.comment = comment;
      }

      const { data, error: fnErr } = await supabase.functions.invoke("handle-approval", {
        body,
      });

      if (fnErr) {
        // Parse the error — edge function non-2xx returns contain the response body
        let errorMessage = "Noe gikk galt. Prøv igjen.";
        try {
          const parsed = fnErr.context instanceof Response ? await fnErr.context.json() : JSON.parse(fnErr.message);
          if (parsed?.error) errorMessage = parsed.error;
        } catch { /* keep safe fallback */ }
        setError(errorMessage);
      } else if (data?.error) {
        setError(data.error);
      } else {
        setResult({ success: true, message: data.message });
      }
    } catch (err: any) {
      setError(err.message || "Noe gikk galt.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit approve
  useEffect(() => {
    // Don't auto-submit, let user confirm
  }, []);

  if (result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border bg-card p-8 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-approved/10">
            <CheckCircle2 className="h-8 w-8 text-status-approved" />
          </div>
          <h1 className="text-xl font-bold">{result.message}</h1>
          <p className="text-sm text-muted-foreground">Svaret er registrert. Jobbinfo og vedlegg er fortsatt tilgjengelig i MCS Hub med gjeldende tilgang.</p>
          {persistentLink}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-xl border bg-card shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-primary p-6 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">MCS Service</h1>
              <p className="text-sm opacity-80">Jobbforespørsel</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {persistentLink}
          {/* Action selection if no action in URL */}
          {!action && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Velg hva du vil gjøre:</p>
              <div className="grid gap-2">
                <Button
                  onClick={() => setAction("approve")}
                  className="w-full gap-2 bg-status-approved hover:bg-status-approved/90"
                >
                  <CheckCircle2 className="h-4 w-4" /> Godkjenn
                </Button>
                <Button
                  onClick={() => setAction("reschedule")}
                  className="w-full gap-2 bg-status-time-change-proposed hover:bg-status-time-change-proposed/90"
                >
                  <Clock className="h-4 w-4" /> Foreslå nytt tidspunkt
                </Button>
                <Button
                  onClick={() => setAction("reject")}
                  variant="destructive"
                  className="w-full gap-2"
                >
                  <XCircle className="h-4 w-4" /> Avslå
                </Button>
              </div>
            </div>
          )}

          {/* Approve confirmation */}
          {action === "approve" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-status-approved/10 p-4">
                <CheckCircle2 className="h-6 w-6 text-status-approved shrink-0" />
                <div>
                  <p className="font-medium">Godkjenn jobben</p>
                  <p className="text-sm text-muted-foreground">Bekreft at du kan ta dette oppdraget.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAction(null)} className="flex-1">
                  Tilbake
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 gap-2 bg-status-approved hover:bg-status-approved/90"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Bekreft godkjenning
                </Button>
              </div>
            </div>
          )}

          {/* Reject form */}
          {action === "reject" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-4">
                <XCircle className="h-6 w-6 text-destructive shrink-0" />
                <div>
                  <p className="font-medium">Avslå jobben</p>
                  <p className="text-sm text-muted-foreground">Du må oppgi en begrunnelse.</p>
                </div>
              </div>
              <div>
                <Label htmlFor="reject-comment">Begrunnelse *</Label>
                <Textarea
                  id="reject-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Hvorfor kan du ikke ta denne jobben?"
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAction(null)} className="flex-1">
                  Tilbake
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  variant="destructive"
                  className="flex-1 gap-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Bekreft avslag
                </Button>
              </div>
            </div>
          )}

          {/* Reschedule form */}
          {action === "reschedule" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-status-time-change-proposed/10 p-4">
                <Clock className="h-6 w-6 text-status-time-change-proposed shrink-0" />
                <div>
                  <p className="font-medium">Foreslå nytt tidspunkt</p>
                  <p className="text-sm text-muted-foreground">Velg når du kan ta jobben i stedet.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ny start</Label>
                  <div className="flex gap-1.5 mt-1">
                    <Input
                      type="date"
                      value={proposedStartDate}
                      onChange={(e) => {
                        setProposedStartDate(e.target.value);
                        if (!proposedEndDate) setProposedEndDate(e.target.value);
                      }}
                    />
                    <Input
                      type="time"
                      value={proposedStartTime}
                      onChange={(e) => setProposedStartTime(e.target.value)}
                      className="w-24"
                    />
                  </div>
                </div>
                <div>
                  <Label>Ny slutt</Label>
                  <div className="flex gap-1.5 mt-1">
                    <Input
                      type="date"
                      value={proposedEndDate}
                      onChange={(e) => setProposedEndDate(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={proposedEndTime}
                      onChange={(e) => setProposedEndTime(e.target.value)}
                      className="w-24"
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="reschedule-comment">Kommentar (valgfritt)</Label>
                <Textarea
                  id="reschedule-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Eventuell kommentar..."
                  rows={2}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAction(null)} className="flex-1">
                  Tilbake
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 gap-2 bg-status-time-change-proposed hover:bg-status-time-change-proposed/90"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send forslag
                </Button>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
