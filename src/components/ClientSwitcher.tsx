import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FileText, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface ClientOption {
  id: string;
  name: string;
}

const SUB_ROUTES = ["/audit", "/reports", "/creatives", "/audiences"] as const;

function currentSuffix(pathname: string, clientId: string): string {
  const afterId = pathname.split(clientId)[1] ?? "";
  return SUB_ROUTES.find((suffix) => afterId.startsWith(suffix)) ?? "";
}

// Fica visivel so quando ha um cliente no contexto (/clients/:id/...), pra
// trocar de cliente sem precisar voltar pra lista e pra pular direto pra
// Relatorios/Campanhas — reduz o caminho de "3-4 cliques" que tinha antes.
export function ClientSwitcher() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientOption[]>([]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("clients")
      .select("id, name")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setClients((data as ClientOption[]) ?? []));
  }, [id]);

  if (!id) return null;

  const suffix = currentSuffix(location.pathname, id);

  function handleSwitch(newClientId: string) {
    if (newClientId === id) return;
    navigate(`/clients/${newClientId}${suffix}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={id} onValueChange={handleSwitch}>
        <SelectTrigger className="h-8 w-[180px] rounded-xl border-white/[0.06] bg-white/[0.03] text-xs">
          <SelectValue placeholder="Trocar cliente..." />
        </SelectTrigger>
        <SelectContent>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-xl text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        title="Relatórios deste cliente"
        onClick={() => navigate(`/clients/${id}/reports`)}
      >
        <FileText className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-xl text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        title="Campanhas deste cliente"
        onClick={() => navigate(`/campaigns?client=${id}`)}
      >
        <Megaphone className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
