import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buscarTudo } from "@/lib/buscar-tudo";
import { CANAIS_LEAD } from "@/lib/comercial";
import { formatarTelefone } from "@/lib/whatsapp";

export interface LeadParaEnvio {
  id: string;
  contato_nome: string;
  empresa: string | null;
  cidade: string | null;
  segmento: string | null;
  canal: string;
  funil_id: string;
  etapa_id: string;
  responsavel_id: string | null;
  whatsapp: string | null;
  telefone: string | null;
  wa_chave: string | null;
  ganho_em: string | null;
  perdido_em: string | null;
}

const TODOS = "todos";

/**
 * Lista de leads com WhatsApp para disparo e sequencia. So aparecem os leads
 * que a pessoa enxerga (RLS) e que tem telefone; encerrados ficam de fora por
 * padrao, porque mandar cadencia para quem ja fechou ou recusou queima o numero.
 */
export function SeletorDeLeads({ selecionados, onChange, meuId }: {
  selecionados: string[];
  onChange: (ids: string[], leads: LeadParaEnvio[]) => void;
  meuId: string | undefined;
}) {
  const [leads, setLeads] = useState<LeadParaEnvio[]>([]);
  const [funis, setFunis] = useState<{ id: string; nome: string }[]>([]);
  const [etapas, setEtapas] = useState<{ id: string; funil_id: string; nome: string; posicao: number }[]>([]);
  const [busca, setBusca] = useState("");
  const [funil, setFunil] = useState(TODOS);
  const [etapa, setEtapa] = useState(TODOS);
  const [canal, setCanal] = useState(TODOS);
  const [dono, setDono] = useState(TODOS);
  const [incluirEncerrados, setIncluirEncerrados] = useState(false);

  useEffect(() => {
    Promise.all([
      buscarTudo<LeadParaEnvio>((de, ate) =>
        supabase.from("crm_leads")
          .select("id, contato_nome, empresa, cidade, segmento, canal, funil_id, etapa_id, responsavel_id, whatsapp, telefone, wa_chave, ganho_em, perdido_em")
          .not("wa_chave", "is", null).order("contato_nome").range(de, ate)
      ),
      supabase.from("crm_funis").select("id, nome").order("created_at"),
      supabase.from("crm_etapas").select("id, funil_id, nome, posicao").order("posicao"),
    ]).then(([l, f, e]) => {
      setLeads(l);
      setFunis((f.data ?? []) as { id: string; nome: string }[]);
      setEtapas((e.data ?? []) as { id: string; funil_id: string; nome: string; posicao: number }[]);
    });
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return leads.filter(l => {
      if (!incluirEncerrados && (l.ganho_em || l.perdido_em)) return false;
      if (funil !== TODOS && l.funil_id !== funil) return false;
      if (etapa !== TODOS && l.etapa_id !== etapa) return false;
      if (canal !== TODOS && l.canal !== canal) return false;
      if (dono === "meus" && l.responsavel_id !== meuId) return false;
      if (!termo) return true;
      return [l.contato_nome, l.empresa, l.cidade, l.segmento].some(v => v?.toLowerCase().includes(termo));
    });
  }, [leads, busca, funil, etapa, canal, dono, incluirEncerrados, meuId]);

  const marcados = new Set(selecionados);
  const todosMarcados = filtrados.length > 0 && filtrados.every(l => marcados.has(l.id));

  function aplicar(ids: Set<string>) {
    onChange([...ids], leads.filter(l => ids.has(l.id)));
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, empresa, cidade, segmento..." className="pl-9" />
        </div>
        <Select value={funil} onValueChange={v => { setFunil(v); setEtapa(TODOS); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os funis</SelectItem>
            {funis.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={etapa} onValueChange={setEtapa} disabled={funil === TODOS}>
          <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as etapas</SelectItem>
            {etapas.filter(e => e.funil_id === funil).map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os canais</SelectItem>
            {CANAIS_LEAD.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dono} onValueChange={setDono}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Leads que eu vejo</SelectItem>
            <SelectItem value="meus">Só os meus</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={todosMarcados}
            onCheckedChange={v => {
              const ids = new Set(marcados);
              for (const l of filtrados) (v ? ids.add(l.id) : ids.delete(l.id));
              aplicar(ids);
            }}
          />
          Marcar os {filtrados.length} filtrados
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={incluirEncerrados} onCheckedChange={v => setIncluirEncerrados(!!v)} />
          Incluir ganhos e perdidos
        </label>
      </div>

      <ScrollArea className="h-56 rounded-lg border border-border">
        <div className="p-1">
          {filtrados.map(l => (
            <label key={l.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40">
              <Checkbox
                checked={marcados.has(l.id)}
                onCheckedChange={v => {
                  const ids = new Set(marcados);
                  if (v) ids.add(l.id); else ids.delete(l.id);
                  aplicar(ids);
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {l.empresa ? `${l.empresa} · ` : ""}{l.contato_nome}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatarTelefone(l.whatsapp || l.telefone)}</span>
            </label>
          ))}
          {filtrados.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lead com WhatsApp nesse filtro.</p>}
        </div>
      </ScrollArea>
      <p className="px-1 text-xs text-muted-foreground">{selecionados.length} selecionado{selecionados.length === 1 ? "" : "s"}</p>
    </div>
  );
}
