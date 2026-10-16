import { Link } from "react-router-dom";
import { AlertTriangle, Building2, CheckCircle2, ImageOff, Loader2, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type Assessoria, type ClienteDoRelatorio, type ResolucaoAssessoria,
  localDoCliente, nomeNoRelatorio, paletaDe, pendenciasDoCliente,
} from "@/lib/identidade-relatorio";
import { segmentLabel } from "@/lib/local-business";

const ORIGEM: Record<ResolucaoAssessoria["origem"], string> = {
  escolhida: "escolhida para este relatório",
  cliente: "padrão do cliente",
  texto: "reconhecida no texto",
  unica: "única cadastrada",
  pendente: "",
};

function Logo({ src, nome, redonda }: { src: string | null; nome: string; redonda?: boolean }) {
  return src ? (
    <img src={src} alt={`Logo ${nome}`} className={`h-10 w-10 shrink-0 border bg-white object-contain ${redonda ? "rounded-full" : "rounded-lg"}`} />
  ) : (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center border border-dashed text-muted-foreground ${redonda ? "rounded-full" : "rounded-lg"}`} title="Sem logo cadastrada">
      <ImageOff className="h-4 w-4" />
    </span>
  );
}

/**
 * Quem e o cliente e por qual assessoria o relatorio sai. Trocar a assessoria
 * aqui vale so para este relatorio; gravar como padrao do cliente e acao
 * separada e explicita.
 */
export function IdentidadeCard({
  cliente, assessorias, resolucao, selecionadaId, onEscolher, onIgnorarConflito, onSalvarPadrao, salvandoPadrao,
}: {
  cliente: ClienteDoRelatorio;
  assessorias: Assessoria[];
  resolucao: ResolucaoAssessoria;
  /** A assessoria que pinta o relatorio agora (a do relatorio aberto ou a resolvida). */
  selecionadaId: string | null;
  onEscolher: (id: string) => void;
  onIgnorarConflito: () => void;
  onSalvarPadrao: () => void;
  salvandoPadrao: boolean;
}) {
  const atual = assessorias.find((a) => a.id === selecionadaId) ?? null;
  const pendencias = pendenciasDoCliente(cliente, atual);
  const local = localDoCliente(cliente);
  const diferenteDoPadrao = !!atual && atual.id !== cliente.assessoria_id;
  const paleta = atual ? paletaDe(atual) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Identidade do relatório</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Logo src={cliente.logo_url} nome={cliente.name} redonda />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{nomeNoRelatorio(cliente)}</div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{local || "Cidade não cadastrada"}</span>
              {cliente.business_segment && <span>{segmentLabel(cliente.business_segment)}</span>}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Assessoria deste relatório</Label>
          <Select value={selecionadaId ?? ""} onValueChange={onEscolher}>
            <SelectTrigger><SelectValue placeholder="Escolha a assessoria" /></SelectTrigger>
            <SelectContent>
              {assessorias.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border" style={{ background: paletaDe(a).primaria }} />
                    {a.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {atual && paleta && (
            <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2">
              <Logo src={atual.logo_url} nome={atual.nome} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{atual.nome}</div>
                <div className="text-[11px] text-muted-foreground">
                  {resolucao.assessoria?.id === atual.id && ORIGEM[resolucao.origem] ? ORIGEM[resolucao.origem] : "escolhida para este relatório"}
                </div>
              </div>
              <div className="flex shrink-0 gap-1" aria-label="Cores da assessoria">
                {[paleta.primaria, paleta.secundaria, paleta.destaque, paleta.fundo].map((c, i) => (
                  <span key={i} className="h-4 w-4 rounded border" style={{ background: c }} />
                ))}
              </div>
            </div>
          )}
          {!atual && resolucao.candidatas.length > 1 && (
            <p className="text-xs text-amber-500">
              O texto cita {resolucao.candidatas.map((a) => a.nome).join(" e ")}. Escolha qual vale para este relatório.
            </p>
          )}
          {!atual && resolucao.candidatas.length <= 1 && (
            <p className="text-xs text-amber-500">Nenhuma assessoria identificada com segurança. Escolha uma para gerar.</p>
          )}
          {diferenteDoPadrao && (
            <Button variant="outline" size="sm" className="w-full" onClick={onSalvarPadrao} disabled={salvandoPadrao}>
              {salvandoPadrao ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Salvar {atual!.nome} como padrão do cliente
            </Button>
          )}
        </div>

        {resolucao.conflito && (
          <div role="alert" className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              O texto fala em <strong>{resolucao.conflito.nome}</strong>, mas o relatório está como <strong>{atual?.nome ?? "outra assessoria"}</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => onEscolher(resolucao.conflito!.id)}>Usar {resolucao.conflito.nome}</Button>
              <Button size="sm" variant="ghost" onClick={onIgnorarConflito}>Manter {atual?.nome ?? "a atual"}</Button>
            </div>
          </div>
        )}

        {pendencias.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-dashed p-2.5 text-xs">
            <p className="font-medium">Falta no cadastro:</p>
            <ul className="list-inside list-disc text-muted-foreground">
              {pendencias.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link to={`/clients?editar=${cliente.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                <Building2 className="h-3 w-3" /> Corrigir no cadastro do cliente
              </Link>
              {atual && !atual.logo_url && (
                <Link to="/settings" className="text-primary hover:underline">Logo da assessoria em Configurações</Link>
              )}
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Cadastro completo: logo, cidade e assessoria vêm sozinhos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
