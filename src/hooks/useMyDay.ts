import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfDay, endOfDay, addDays, format } from "date-fns";
import { toast } from "sonner";

export interface MyDayBlock {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  project_id: string | null;
  job_id: string | null;
  location: string | null;
  description: string | null;
  outlook_subject: string | null;
  outlook_weblink: string | null;
  source: string;
  // Joined project data
  project_title: string | null;
  customer: string | null;
  address: string | null;
  project_status: string | null;
  project_description: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  // Work package data
  project_type: string | null;
  work_package_type: string | null;
}

export function useMyDay() {
  const { user } = useAuth();
  const [todayBlocks, setTodayBlocks] = useState<MyDayBlock[]>([]);
  const [upcomingBlocks, setUpcomingBlocks] = useState<MyDayBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBlocks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const sb = supabase as any;
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = endOfDay(now).toISOString();
    const weekEnd = endOfDay(addDays(now, 7)).toISOString();

    try {
      // Get person_id for this user
      const { data: account, error: accountError } = await sb
        .from("user_accounts")
        .select("person_id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (accountError) throw new Error("Kunne ikke hente brukerprofil");

      const personId = account?.person_id;
      if (!personId) {
        setLoading(false);
        setError("no_profile");
        return;
      }

      // Today's blocks
      const { data: today, error: todayError } = await sb
        .from("schedule_blocks")
        .select("id, title, start_at, end_at, project_id, job_id, location, description, outlook_subject, outlook_weblink, source")
        .eq("technician_id", personId)
        .is("deleted_at", null)
        .gte("start_at", todayStart)
        .lte("start_at", todayEnd)
        .order("start_at", { ascending: true });

      if (todayError) throw todayError;

      // Upcoming blocks (next 7 days, excluding today)
      const tomorrowStart = startOfDay(addDays(now, 1)).toISOString();
      const { data: upcoming, error: upcomingError } = await sb
        .from("schedule_blocks")
        .select("id, title, start_at, end_at, project_id, job_id, location, description, outlook_subject, outlook_weblink, source")
        .eq("technician_id", personId)
        .is("deleted_at", null)
        .gte("start_at", tomorrowStart)
        .lte("start_at", weekEnd)
        .order("start_at", { ascending: true });

      if (upcomingError) throw upcomingError;

      // Get project details for blocks that have project_id
      const allBlocks = [...(today || []), ...(upcoming || [])];
      const projectIds = [...new Set(allBlocks.filter((b: any) => b.project_id).map((b: any) => b.project_id))];

      let projectMap: Record<string, any> = {};
      if (projectIds.length > 0) {
        const { data: projects, error: projectError } = await sb
          .from("events")
          .select("id, title, customer, address, status, description, project_type, work_package_type")
          .in("id", projectIds);
        if (projectError) throw projectError;
        for (const p of projects || []) {
          projectMap[p.id] = p;
        }
      }

      const mapBlock = (b: any): MyDayBlock => {
        const proj = b.project_id ? projectMap[b.project_id] : null;
        return {
          ...b,
          project_title: proj?.title || null,
          customer: proj?.customer || null,
          address: proj?.address || b.location || null,
          project_status: proj?.status || null,
          project_description: proj?.description || null,
          contact_person: null,
          contact_phone: null,
          project_type: proj?.project_type || null,
          work_package_type: proj?.work_package_type || null,
        };
      };

      setTodayBlocks((today || []).map(mapBlock));
      setUpcomingBlocks((upcoming || []).map(mapBlock));
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("[MyDay]", err);
      setError(err?.message || "Kunne ikke laste oppdrag. Sjekk nettverksforbindelsen.");
      toast.error("Kunne ikke laste oppdrag", {
        description: "Prøv å laste på nytt",
        action: { label: "Prøv igjen", onClick: () => fetchBlocks() },
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  return { todayBlocks, upcomingBlocks, loading, error, lastUpdated, refetch: fetchBlocks };
}
