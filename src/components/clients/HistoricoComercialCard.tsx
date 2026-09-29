import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Atividade, type Lead, CANAIS_CONTATO, rotuloAtividade } from "@/lib/comercial";

/**
 * O que aconteceu antes de o cliente fechar: o lead de origem e os contatos.
 * Some quando o cliente nao veio da prospeccao ou a pessoa nao enxerga o lead.
 */
export function HistoricoComercialCard({ clientId }: { clientId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const { data: leads } = await supabase.from("crm_leads").select("*").eq("convertido_client_id", clientId).limit(1);
      const origem = (leads?.[0] as Lead | undefined) ?? null;
      setLead(origem);
      if (!origem) return;
      const [{ data: ativ }, { data: perfis }] = await Promise.all([
        supabase.from("crm_atividades").select("id, lead_id, autor_id, tipo, canal, descricao, created_at")
          .eq("lead_id", origem.id).order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      setAtividades((ativ ?? []) as Atividade[]);
      setNomes(new Map(((perfis ?? []) as { id: string; full_name: string | null; email: string | null }[])
        .map(p => [p.id, p.full_name || p.email || "—"])));
    })();
  }, [clientId]);

  if (!lead) return null;

  const contatos = atividades.filter(a => !["etapa", "convertido", "nota"].includes(a.tipo)).length;
  const inicio = format(parseISO(lead.created_at), "dd/MM/yyyy");
  const fechou = lead.ganho_em ? format(parseISO(lead.ganho_em), "dd/MM/yyyy") : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Handshake className="h-4 w-4" /> Histórico comercial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Entrou como lead em {inicio}{lead.origem ? ` (${lead.origem})` : ""}
          {fechou && `, fechou em ${fechou}`} · {contatos} contato{contatos === 1 ? "" : "s"}
          {lead.responsavel_id && ` · prospectado por ${nomes.get(lead.responsavel_id) ?? "—"}`}
          {lead.closer_id && ` · fechado por ${nomes.get(lead.closer_id) ?? "—"}`}
        </p>
        {lead.observacoes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{lead.observacoes}</p>}
        <ol className="max-h-64 space-y-2 overflow-y-auto border-l border-border/60 pl-4">
          {atividades.map(a => (
            <li key={a.id} className="text-sm">
              <span className="font-medium">{rotuloAtividade(a.tipo)}</span>
              {a.canal && <span className="text-xs text-muted-foreground"> via {CANAIS_CONTATO.find(c => c.id === a.canal)?.label ?? a.canal}</span>}
              {a.descricao && <span className="text-muted-foreground"> — {a.descricao}</span>}
              <div className="text-[11px] text-muted-foreground/70">
                {a.autor_id ? nomes.get(a.autor_id) ?? "—" : "Sistema"} · {format(parseISO(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </div>
            </li>
          ))}
        </ol>
        <Link to="/comercial" className="text-xs text-primary hover:underline">Abrir no comercial</Link>
      </CardContent>
    </Card>
  );
}
