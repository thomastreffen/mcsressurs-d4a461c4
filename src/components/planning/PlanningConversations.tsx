import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanningChannelConversation } from "./PlanningChannelConversation";
import { PlanningThread } from "./PlanningThread";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { CHANNEL_LABELS, PLANNING_CHANNELS, type PlanningChannel } from "@/lib/planning-external";
import type { PlanningMessage } from "@/hooks/usePlanning";

export function PlanningConversations({ projectId, messages }: { projectId: string; messages: PlanningMessage[] }) {
  const [channel, setChannel] = useState<PlanningChannel>("internal");
  const { active: readOnly } = usePreviewMode();
  const legacy = messages.filter(m => (!m.channel || m.channel === "internal") && !m.client_request_id);
  return <div className="min-w-0 space-y-4">
    <Tabs value={channel} onValueChange={v => setChannel(v as PlanningChannel)}><TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">{PLANNING_CHANNELS.map(c => <TabsTrigger key={c} value={c} className="min-h-11">{CHANNEL_LABELS[c]}</TabsTrigger>)}</TabsList></Tabs>
    <PlanningChannelConversation key={channel} projectId={projectId} channel={channel} readOnly={readOnly} />
    {channel === "internal" && legacy.length > 0 && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Tidligere interne meldinger ({legacy.length})</summary><PlanningThread projectId={projectId} messages={legacy} readOnly /></details>}
  </div>;
}