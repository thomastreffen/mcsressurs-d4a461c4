import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileUp, FolderKanban, FileText, History } from "lucide-react";
import { TripletexProjectImport } from "@/components/tripletex/TripletexProjectImport";
import { TripletexOfferImport } from "@/components/tripletex/TripletexOfferImport";
import { TripletexHistory } from "@/components/tripletex/TripletexHistory";

export default function TripletexImportPage() {
  const [tab, setTab] = useState("projects");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tripletex import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last opp eksportfiler fra Tripletex for å importere prosjekter og tilbud til MCS.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="projects" className="gap-1.5">
            <FolderKanban className="h-4 w-4" />
            Prosjekter
          </TabsTrigger>
          <TabsTrigger value="offers" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Tilbud
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            Importhistorikk
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-4">
          <TripletexProjectImport />
        </TabsContent>

        <TabsContent value="offers" className="mt-4">
          <TripletexOfferImport />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <TripletexHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
