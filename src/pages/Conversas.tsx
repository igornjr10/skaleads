import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaixaDeConversas } from "@/components/whatsapp/CaixaDeConversas";
import { ConfigWhatsapp } from "@/components/whatsapp/ConfigWhatsapp";
import { DisparosTab } from "@/components/whatsapp/DisparosTab";
import { ModelosTab } from "@/components/whatsapp/ModelosTab";
import { SequenciasTab } from "@/components/whatsapp/SequenciasTab";
import { useAuth } from "@/hooks/useAuth";
import { useConversas } from "@/hooks/useConversas";
import { veTodosOsClientes } from "@/lib/permissoes";
import { LIMITES_PADRAO, type LimitesWa } from "@/lib/whatsapp-fila";

export default function Conversas() {
  const { user, role, empresa } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const { conversas, loading, marcarLida, recarregar } = useConversas();
  const [limites, setLimites] = useState<LimitesWa>(LIMITES_PADRAO);

  const carregarLimites = useCallback(async () => {
    if (!empresa) return;
    const { data } = await supabase.from("wa_config").select("limite_diario, intervalo_seg, hora_inicio, hora_fim").eq("company_id", empresa.id).maybeSingle();
    setLimites(data ? (data as LimitesWa) : LIMITES_PADRAO);
  }, [empresa]);
  useEffect(() => { carregarLimites(); }, [carregarLimites]);

  const naoLidas = conversas.reduce((s, c) => s + c.naoLidas, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Conversas com os leads, disparos e sequências de follow-up pelo número da agência.</p>
        </div>
      </div>

      <Tabs defaultValue="conversas">
        <TabsList className="flex-wrap">
          <TabsTrigger value="conversas">Conversas{naoLidas > 0 ? ` (${naoLidas})` : ""}</TabsTrigger>
          <TabsTrigger value="disparos">Disparos</TabsTrigger>
          <TabsTrigger value="sequencias">Sequências</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          {isAdmin && <TabsTrigger value="config">Configuração</TabsTrigger>}
        </TabsList>
        <TabsContent value="conversas">
          <CaixaDeConversas conversas={conversas} loading={loading} onLida={marcarLida} onLeadCriado={recarregar} />
        </TabsContent>
        <TabsContent value="disparos">
          <DisparosTab meuId={user?.id} isAdmin={isAdmin} limites={limites} />
        </TabsContent>
        <TabsContent value="sequencias">
          <SequenciasTab meuId={user?.id} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="modelos">
          <ModelosTab meuId={user?.id} isAdmin={isAdmin} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="config">
            <ConfigWhatsapp limites={limites} onSalvo={carregarLimites} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
