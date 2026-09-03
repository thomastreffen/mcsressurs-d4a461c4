import { useEffect, useState } from "react";
import { Check, X as XIcon, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isStandalone } from "@/pwa/registerSW";
import {
  checkForUpdate,
  clearAppCachesAndUnregister,
  onUpdateState,
  applyUpdateAndReload,
} from "@/pwa/registerSW";
import { APP_VERSION, APP_BUILD_TIME, APP_COMMIT } from "@/pwa/buildVersion";
import { getInstallPrompt, onInstallPromptChange, detectPlatform } from "@/pwa/installPrompt";
import { EnableNotificationsButton } from "./EnableNotificationsButton";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, value }: { label: string; value: string | boolean }) {
  const isBool = typeof value === "boolean";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      {isBool ? (
        value ? (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <Check className="h-4 w-4" /> Ja
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <XIcon className="h-4 w-4" /> Nei
          </span>
        )
      ) : (
        <span className="font-medium text-foreground break-all text-right">{value}</span>
      )}
    </div>
  );
}

export function PwaStatusDialog({ open, onOpenChange }: Props) {
  const [tick, setTick] = useState(0);
  const [checking, setChecking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const { isSuperAdmin } = useAuth();

  useEffect(() => {
    if (!open) return;
    const unsubInstall = onInstallPromptChange(() => setTick((t) => t + 1));
    const unsubUpdate = onUpdateState(({ needRefresh }) => setUpdateAvailable(needRefresh));
    return () => {
      unsubInstall();
      unsubUpdate();
    };
  }, [open]);

  const standalone = isStandalone();
  const swActive =
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    !!navigator.serviceWorker.controller;
  const manifestFound =
    typeof document !== "undefined" && !!document.querySelector('link[rel="manifest"]');
  const pushSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  const permission =
    typeof Notification !== "undefined" ? Notification.permission : "ikke støttet";
  const bipAvailable = !!getInstallPrompt();
  const platform = detectPlatform();
  void tick;

  const buildTimeLabel = APP_BUILD_TIME
    ? new Date(APP_BUILD_TIME).toLocaleString("nb-NO")
    : "ukjent";

  const handleCheck = async () => {
    setChecking(true);
    try {
      const ok = await checkForUpdate();
      if (!ok) {
        toast.info("Fant ingen aktiv service worker å sjekke mot.");
      } else {
        // Give the SW a moment to discover an update.
        setTimeout(() => {
          if (!updateAvailable) {
            toast.success("Du kjører allerede siste versjon.");
          }
        }, 1500);
      }
    } finally {
      setChecking(false);
    }
  };

  const handleClear = async () => {
    if (
      !window.confirm(
        "Dette tømmer app-cache, avregistrerer service worker og laster siden på nytt. Fortsette?",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await clearAppCachesAndUnregister();
      window.location.reload();
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>App-status</DialogTitle>
          <DialogDescription>Teknisk status for MCS som installerbar app.</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-card px-3">
          <Row label="Build-versjon" value={APP_VERSION} />
          <Row label="Commit" value={APP_COMMIT === "not-available" ? "Ikke tilgjengelig" : APP_COMMIT} />
          <Row label="Bygget" value={buildTimeLabel} />
          <Row label="Ny versjon tilgjengelig" value={updateAvailable} />
          <Row label="Standalone" value={standalone} />
          <Row label="Gammel service worker aktiv" value={swActive} />
          <Row label="Manifest funnet" value={manifestFound} />
          <Row label="Push støttet" value={pushSupported} />
          <Row label="Varseltillatelse" value={permission} />
          <Row label="Installprompt tilgjengelig" value={bipAvailable} />
          <Row label="Plattform" value={platform} />
        </div>

        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium">Oppdatering</p>
          {updateAvailable && (
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                void applyUpdateAndReload();
              }}
            >
              Oppdater nå til ny versjon
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleCheck}
            disabled={checking}
          >
            {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Se etter oppdatering
          </Button>
          {isSuperAdmin && (
            <Button
              size="sm"
              variant="destructive"
              className="w-full"
              onClick={handleClear}
              disabled={clearing}
            >
              {clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Tøm app-cache og last på nytt
            </Button>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium">Varsler</p>
          <EnableNotificationsButton />
        </div>
      </DialogContent>
    </Dialog>
  );
}
