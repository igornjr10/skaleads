import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { comprimirImagem } from "@/lib/report-analise";
import type { Bloco, BlocoDo } from "@/lib/relatorio-html";

export const MAX_PRINTS_POR_BLOCO = 12;

const NOME_DO_TIPO: Record<Bloco["tipo"], string> = {
  numeros: "Números do período",
  criativo: "Criativo campeão",
  resumo: "Resumo em destaque",
  texto: "Texto",
  prints: "Prints",
  dados: "Dados complementares",
};

export function lerNumeroBR(v: string): number | null {
  const s = v.trim().replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const n = s.includes(",")
    ? Number(s.replace(/\./g, "").replace(",", "."))
    : /^-?\d+\.\d{1,2}$/.test(s)
      ? Number(s)
      : Number(s.replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}

function mostrarNumero(n: number | null) {
  return n == null ? "" : (Math.round(n * 100) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Texto livre enquanto digita ("1.023,3" no meio nao vira numero); converte ao sair do campo. */
export function CampoNumero({
  valor,
  onChange,
  placeholder = "—",
}: {
  valor: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState(mostrarNumero(valor));
  const focado = useRef(false);
  useEffect(() => {
    if (!focado.current) setTexto(mostrarNumero(valor));
  }, [valor]);
  return (
    <Input
      inputMode="decimal"
      value={texto}
      placeholder={placeholder}
      onFocus={() => (focado.current = true)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        focado.current = false;
        const n = lerNumeroBR(texto);
        setTexto(mostrarNumero(n));
        if (n !== valor) onChange(n);
      }}
    />
  );
}

/** Area que recebe imagem por clique, arrastar ou Ctrl+V (com foco nela). */
export function ZonaDeImagens({
  onArquivos,
  multiplo = true,
  className,
  children,
}: {
  onArquivos: (arquivos: File[]) => void;
  multiplo?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const imagens = (lista: FileList | File[] | null | undefined) =>
    Array.from(lista ?? []).filter((f) => f.type.startsWith("image/"));
  // O input fica fora da area: o click programatico borbulharia de volta para
  // o onClick dela e abriria o seletor de novo.
  return (
    <>
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const lista = imagens(e.dataTransfer.files);
        if (lista.length) onArquivos(lista);
      }}
      onPaste={(e) => {
        const lista = imagens(e.clipboardData.files);
        if (lista.length) {
          e.preventDefault();
          onArquivos(lista);
        }
      }}
      className={cn(
        "cursor-pointer rounded-md border border-dashed text-xs text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiplo}
        hidden
        onChange={(e) => {
          const lista = imagens(e.target.files);
          if (lista.length) onArquivos(lista);
          e.target.value = "";
        }}
      />
    </>
  );
}

interface Props {
  bloco: Bloco;
  aberto: boolean;
  primeiro: boolean;
  ultimo: boolean;
  onAlternar: () => void;
  onMudar: (bloco: Bloco) => void;
  onMover: (direcao: -1 | 1) => void;
  onRemover: () => void;
}

export function BlocoEditor({ bloco, aberto, primeiro, ultimo, onAlternar, onMudar, onMover, onRemover }: Props) {
  const mudar = (parcial: Partial<Bloco>) => onMudar({ ...bloco, ...parcial } as Bloco);
  const resumoDoBloco = bloco.titulo || bloco.olho || NOME_DO_TIPO[bloco.tipo];

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" onClick={onAlternar} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
          {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{NOME_DO_TIPO[bloco.tipo]}</span>
            <span className="block truncate text-sm font-medium">{resumoDoBloco}</span>
          </span>
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={primeiro} onClick={() => onMover(-1)} aria-label="Subir">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={ultimo} onClick={() => onMover(1)} aria-label="Descer">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemover} aria-label="Remover seção">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {aberto && (
        <div className="space-y-3 border-t p-3">
          <div className="grid grid-cols-[2fr_3fr] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Chamada</Label>
              <Input value={bloco.olho} onChange={(e) => mudar({ olho: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Título</Label>
              <Input value={bloco.titulo} onChange={(e) => mudar({ titulo: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{bloco.tipo === "resumo" ? "Texto do resumo" : "Texto"}</Label>
            <Textarea
              rows={bloco.tipo === "texto" || bloco.tipo === "resumo" ? 6 : 3}
              value={bloco.texto}
              onChange={(e) => mudar({ texto: e.target.value })}
              placeholder={
                bloco.tipo === "texto"
                  ? "Um parágrafo por linha. Comece a linha com - para virar lista. **Asteriscos** destacam em azul."
                  : "Opcional. **Asteriscos** destacam em azul."
              }
            />
          </div>

          {bloco.tipo === "numeros" && (
            <p className="text-xs text-muted-foreground">Os números vêm da capa (campos de métricas acima).</p>
          )}
          {bloco.tipo === "criativo" && <EditorCriativo bloco={bloco} onMudar={onMudar} />}
          {bloco.tipo === "prints" && <EditorPrints bloco={bloco} onMudar={onMudar} />}
          {bloco.tipo === "dados" && <EditorDados bloco={bloco} onMudar={onMudar} />}
        </div>
      )}
    </div>
  );
}

function EditorCriativo({ bloco, onMudar }: { bloco: BlocoDo<"criativo">; onMudar: (b: Bloco) => void }) {
  async function trocar([arquivo]: File[]) {
    try {
      onMudar({ ...bloco, imagem: await comprimirImagem(arquivo, 900, 0.82) });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="flex gap-3">
      <ZonaDeImagens onArquivos={trocar} multiplo={false} className="relative flex h-32 w-[72px] shrink-0 items-center justify-center overflow-hidden bg-muted">
        {bloco.imagem ? <img src={bloco.imagem} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4" />}
      </ZonaDeImagens>
      <div className="grid flex-1 grid-cols-1 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Alcance</Label>
          <CampoNumero valor={bloco.alcance} onChange={(alcance) => onMudar({ ...bloco, alcance })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Conversas</Label>
            <CampoNumero valor={bloco.mensagens} onChange={(mensagens) => onMudar({ ...bloco, mensagens })} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Custo/conversa</Label>
            <CampoNumero valor={bloco.custo_por_mensagem} onChange={(custo_por_mensagem) => onMudar({ ...bloco, custo_por_mensagem })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorPrints({ bloco, onMudar }: { bloco: BlocoDo<"prints">; onMudar: (b: Bloco) => void }) {
  async function adicionar(arquivos: File[]) {
    const vagas = MAX_PRINTS_POR_BLOCO - bloco.imagens.length;
    if (arquivos.length > vagas) toast.warning(`Até ${MAX_PRINTS_POR_BLOCO} prints por seção — crie outra seção de prints para mais`);
    try {
      const novas = await Promise.all(arquivos.slice(0, Math.max(vagas, 0)).map((f) => comprimirImagem(f, 1400, 0.82)));
      onMudar({ ...bloco, imagens: [...bloco.imagens, ...novas.map((src) => ({ src, legenda: "" }))] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const mudarImagem = (i: number, legenda: string) =>
    onMudar({ ...bloco, imagens: bloco.imagens.map((img, j) => (j === i ? { ...img, legenda } : img)) });
  const mover = (i: number, d: -1 | 1) => {
    const imagens = [...bloco.imagens];
    [imagens[i], imagens[i + d]] = [imagens[i + d], imagens[i]];
    onMudar({ ...bloco, imagens });
  };

  return (
    <div className="space-y-2">
      {bloco.imagens.map((img, i) => (
        <div key={i} className="flex gap-2 rounded-md border p-2">
          <img src={img.src} alt="" className="h-16 w-24 shrink-0 rounded object-cover object-top" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              className="h-8 text-xs"
              value={img.legenda}
              onChange={(e) => mudarImagem(i, e.target.value)}
              placeholder="Legenda (opcional)"
            />
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir print">
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={i === bloco.imagens.length - 1}
                onClick={() => mover(i, 1)}
                aria-label="Descer print"
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={() => onMudar({ ...bloco, imagens: bloco.imagens.filter((_, j) => j !== i) })}
                aria-label="Tirar print"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      {bloco.imagens.length < MAX_PRINTS_POR_BLOCO && (
        <ZonaDeImagens onArquivos={adicionar} className="flex flex-col items-center gap-1 px-3 py-4 text-center">
          <ImagePlus className="h-5 w-5" />
          Clique, arraste ou clique aqui e cole (Ctrl+V)
        </ZonaDeImagens>
      )}
    </div>
  );
}

function EditorDados({ bloco, onMudar }: { bloco: BlocoDo<"dados">; onMudar: (b: Bloco) => void }) {
  const mudarLinha = (i: number, campo: "rotulo" | "valor", v: string) =>
    onMudar({ ...bloco, linhas: bloco.linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)) });
  return (
    <div className="space-y-2">
      {bloco.linhas.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input className="h-8 text-xs" value={l.rotulo} onChange={(e) => mudarLinha(i, "rotulo", e.target.value)} placeholder="Ex.: Agendamentos" />
          <Input className="h-8 w-32 text-xs" value={l.valor} onChange={(e) => mudarLinha(i, "valor", e.target.value)} placeholder="Ex.: 32" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive"
            onClick={() => onMudar({ ...bloco, linhas: bloco.linhas.filter((_, j) => j !== i) })}
            aria-label="Tirar linha"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onMudar({ ...bloco, linhas: [...bloco.linhas, { rotulo: "", valor: "" }] })}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Linha
      </Button>
    </div>
  );
}
