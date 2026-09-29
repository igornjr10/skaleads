import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { type DadosDoLead, VARIAVEIS_MODELO, preencherModelo } from "@/lib/whatsapp";

const EXEMPLO: DadosDoLead = { contato_nome: "Maria Souza", empresa: "Padaria Pão Quente", cidade: "Campinas", segmento: "Padaria" };

/** Texto de mensagem com botoes de variavel e previa preenchida. */
export function TextoComVariaveis({ valor, onChange, exemplo, linhas = 5, placeholder }: {
  valor: string;
  onChange: (v: string) => void;
  /** Lead usado na previa; sem ele, um exemplo ficticio. */
  exemplo?: DadosDoLead | null;
  linhas?: number;
  placeholder?: string;
}) {
  const campo = useRef<HTMLTextAreaElement>(null);

  function inserir(chave: string) {
    const el = campo.current;
    const token = `{${chave}}`;
    if (!el) return onChange(valor + token);
    const ini = el.selectionStart ?? valor.length;
    const fim = el.selectionEnd ?? valor.length;
    onChange(valor.slice(0, ini) + token + valor.slice(fim));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + token.length, ini + token.length); });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {VARIAVEIS_MODELO.map(v => (
          <button
            key={v.chave}
            type="button"
            title={v.descricao}
            onClick={() => inserir(v.chave)}
            className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[11px] hover:border-primary/40 hover:text-primary"
          >
            {`{${v.chave}}`}
          </button>
        ))}
      </div>
      <Textarea ref={campo} rows={linhas} value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {valor.includes("{") && (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Prévia{exemplo ? "" : " com um lead de exemplo"}
          </div>
          <p className="whitespace-pre-wrap text-sm">{preencherModelo(valor, exemplo ?? EXEMPLO)}</p>
        </div>
      )}
    </div>
  );
}
