import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCheck, ListPlus, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type AcaoReuniao, type Reuniao, type ResumoDaReuniao,
  acharPessoaPorNome, dataEHora, juntarDecisoes, novoId, normalizarPrazo, paraResumo,
} from "@/lib/reunioes";
import type { PessoaDaReuniao } from "./useReunioes";

async function lerErroDoCorpo(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: unknown } | null)?.context;
  if (!(contexto instanceof Response)) return null;
  try {
    const corpo = await contexto.clone().json();
    return typeof corpo?.error === "string" ? corpo.error : null;
  } catch {
    return null;
  }
}

export function ReuniaoResumo({ reuniao, pessoas, participantes, podeEditar, temAlteracaoNaoSalva, onResumoSalvo, salvarCampos }: {
  reuniao: Reuniao;
  pessoas: PessoaDaReuniao[];
  participantes: string[];
  podeEditar: boolean;
  temAlteracaoNaoSalva: boolean;
  onResumoSalvo: (resumo: string) => void;
  salvarCampos: (patch: { decisoes?: string | null; acoes?: AcaoReuniao[] }) => Promise<boolean>;
}) {
  const [gerando, setGerando] = useState(false);
  const [sugestao, setSugestao] = useState<ResumoDaReuniao | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<number>>(new Set());
  const [decisoesUsadas, setDecisoesUsadas] = useState(false);

  useEffect(() => {
    setSugestao(null);
    setEscolhidas(new Set());
    setDecisoesUsadas(false);
  }, [reuniao.id]);

  const temMaterial = !!(reuniao.transcricao || reuniao.pauta || reuniao.decisoes || reuniao.observacoes || reuniao.acoes.length);

  async function gerar() {
    setGerando(true);
    try {
      const { data, error } = await supabase.functions.invoke("resumir-reuniao", { body: { reuniao_id: reuniao.id } });
      if (error || !data?.success) {
        const doCorpo = await lerErroDoCorpo(error);
        throw new Error(doCorpo || data?.error || error?.message || "Não foi possível gerar o resumo");
      }
      const resumo = paraResumo(data.dados);
      setSugestao(resumo);
      setEscolhidas(new Set(resumo.acoes.map((_, i) => i)));
      setDecisoesUsadas(false);
      if (data.salvo) onResumoSalvo(resumo.resumo);
      else toast.info("Resumo gerado, mas não foi salvo na reunião: só quem participa ou marcou pode gravar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  async function usarDecisoes() {
    if (!sugestao?.decisoes.length) return;
    if (await salvarCampos({ decisoes: juntarDecisoes(reuniao.decisoes, sugestao.decisoes) || null })) {
      setDecisoesUsadas(true);
      toast.success("Decisões adicionadas ao registro");
    }
  }

  async function usarAcoes() {
    if (!sugestao) return;
    // Participantes primeiro: o "Joao" da reuniao e mais provavelmente o Joao que estava la.
    const presentes = pessoas.filter(p => participantes.includes(p.id));
    const existentes = new Set(reuniao.acoes.map(a => a.texto.trim().toLowerCase()));
    const novas: AcaoReuniao[] = sugestao.acoes
      .filter((a, i) => escolhidas.has(i) && !existentes.has(a.texto.toLowerCase()))
      .map(a => ({
        id: novoId(),
        texto: a.texto,
        responsavel_id: acharPessoaPorNome(a.responsavel_sugerido, presentes) ?? acharPessoaPorNome(a.responsavel_sugerido, pessoas),
        prazo: normalizarPrazo(a.prazo_sugerido),
        feito: false,
        task_id: null,
      }));
    if (!novas.length) return toast.info("Essas ações já estão na lista");
    if (await salvarCampos({ acoes: [...reuniao.acoes, ...novas] })) {
      toast.success(`${novas.length} ${novas.length === 1 ? "ação adicionada" : "ações adicionadas"}: confira dono e prazo na aba Ações`);
      setEscolhidas(new Set());
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-muted-foreground">
          {reuniao.resumo_ia_em ? `Último resumo em ${dataEHora(reuniao.resumo_ia_em)}` : "A IA lê o registro e a transcrição e sugere decisões e ações."}
        </p>
        {podeEditar && (
          <Button size="sm" onClick={gerar} disabled={gerando || !temMaterial || temAlteracaoNaoSalva}>
            {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {reuniao.resumo_ia ? "Gerar de novo" : "Gerar resumo"}
          </Button>
        )}
      </div>
      {podeEditar && !temMaterial && (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
          Cole a transcrição (aba Gravação) ou escreva pauta, decisões ou observações para a IA ter o que resumir.
        </p>
      )}
      {podeEditar && temAlteracaoNaoSalva && (
        <p className="text-xs text-amber-400">Salve o registro e a transcrição antes de gerar: a IA lê o que está gravado.</p>
      )}

      {reuniao.resumo_ia ? (
        <div className="prose prose-sm max-w-none break-words rounded-xl border border-border/60 bg-card/40 p-4 prose-headings:mb-2 prose-headings:mt-3 dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{reuniao.resumo_ia}</ReactMarkdown>
        </div>
      ) : (
        !gerando && <p className="text-sm text-muted-foreground">Nenhum resumo gerado ainda.</p>
      )}

      {sugestao && (
        <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Sugestões da IA (revise antes de usar)</p>

          {sugestao.decisoes.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Decisões</h4>
                {podeEditar && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={usarDecisoes} disabled={decisoesUsadas}>
                    <CheckCheck className="mr-1 h-3.5 w-3.5" /> {decisoesUsadas ? "Adicionadas" : "Usar decisões sugeridas"}
                  </Button>
                )}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {sugestao.decisoes.map((d, i) => <li key={i} className="break-words">{d}</li>)}
              </ul>
            </div>
          )}

          {sugestao.acoes.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Ações</h4>
                {podeEditar && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={usarAcoes} disabled={escolhidas.size === 0}>
                    <ListPlus className="mr-1 h-3.5 w-3.5" /> Adicionar selecionadas ({escolhidas.size})
                  </Button>
                )}
              </div>
              <ul className="space-y-1.5">
                {sugestao.acoes.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {podeEditar && (
                      <Checkbox
                        className="mt-0.5"
                        checked={escolhidas.has(i)}
                        onCheckedChange={v => setEscolhidas(s => {
                          const n = new Set(s);
                          if (v === true) n.add(i); else n.delete(i);
                          return n;
                        })}
                        aria-label="Usar esta ação"
                      />
                    )}
                    <span className="min-w-0 break-words">
                      {a.texto}
                      {(a.responsavel_sugerido || a.prazo_sugerido) && (
                        <span className="text-xs text-muted-foreground">
                          {" "}— {[a.responsavel_sugerido, a.prazo_sugerido].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sugestao.pendencias.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Pendências</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {sugestao.pendencias.map((p, i) => <li key={i} className="break-words">{p}</li>)}
              </ul>
            </div>
          )}

          {!sugestao.decisoes.length && !sugestao.acoes.length && !sugestao.pendencias.length && (
            <p className="text-sm text-muted-foreground">A IA não encontrou decisões nem ações novas.</p>
          )}
        </div>
      )}
    </div>
  );
}
