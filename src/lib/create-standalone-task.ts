import type { Attachment } from "@/lib/mock-data";

type TaskResult = { event_id: string; status: "created" | "existing" };
type Dependencies = {
  create: () => Promise<TaskResult>;
  upload: (id: string) => Promise<Attachment[]>;
  saveAttachments: (id: string, attachments: Attachment[]) => Promise<void>;
  notify: (id: string) => Promise<void>;
  calendar: (id: string) => void;
};

/** Persistence first, files second, outbound intent last. Retry never replays completed creation. */
export async function finishStandaloneTask(deps: Dependencies, notify: boolean, hasRecipients: boolean) {
  const result = await deps.create();
  const attachments = await deps.upload(result.event_id);
  if (attachments.length) await deps.saveAttachments(result.event_id, attachments);
  if (result.status === "created" && hasRecipients) {
    if (notify) await deps.notify(result.event_id);
    deps.calendar(result.event_id);
  }
  return result;
}