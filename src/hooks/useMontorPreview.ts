import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePreviewMode } from "@/hooks/usePreviewMode";

/** One-tap «Montørvisning» on top of the existing read-only preview engine. */
export function useMontorPreview() {
  const { activate, deactivate, active, target, realIsSuperAdmin } = usePreviewMode();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const { data } = await supabase.from("roles").select("id,name").ilike("name", "montør").limit(1).maybeSingle();
      if (!data) { toast.error("Fant ikke rollen Montør"); return; }
      await activate({ type: "role", id: (data as any).id, label: (data as any).name, appRole: "montør" });
      navigate("/my-day", { replace: true });
    } finally {
      setStarting(false);
    }
  }, [activate, navigate]);

  const stop = useCallback(() => {
    deactivate();
    navigate("/overview", { replace: true });
  }, [deactivate, navigate]);

  return { canUse: realIsSuperAdmin, active, target, start, stop, starting };
}
