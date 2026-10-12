import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface OpcaoMultipla {
  value: string;
  label: string;
  detalhe?: string;
}

/**
 * Escolha de varios itens com busca. `todos` liga o atalho "Selecionar
 * todos" com o rotulo e a lista que ele marca (ex.: so os clientes ativos).
 */
export function SeletorMultiplo({
  opcoes, valor, onChange, placeholder = "Selecionar...", busca = "Buscar...", vazio = "Nada encontrado",
  todos, disabled, className,
}: {
  opcoes: OpcaoMultipla[];
  valor: string[];
  onChange: (valor: string[]) => void;
  placeholder?: string;
  busca?: string;
  vazio?: string;
  todos?: { label: string; valores: string[] };
  disabled?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const marcados = useMemo(() => new Set(valor), [valor]);
  const rotulo = (v: string) => opcoes.find(o => o.value === v)?.label ?? "—";

  const resumo = valor.length === 0
    ? placeholder
    : valor.length <= 2
      ? valor.map(rotulo).join(", ")
      : `${rotulo(valor[0])} e mais ${valor.length - 1}`;

  function alternar(v: string) {
    onChange(marcados.has(v) ? valor.filter(x => x !== v) : [...valor, v]);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", valor.length === 0 && "text-muted-foreground")}
          >
            <span className="min-w-0 truncate text-left">{resumo}</span>
            <span className="ml-2 flex shrink-0 items-center gap-1.5">
              {valor.length > 2 && (
                <span className="rounded-md bg-primary/15 px-1.5 text-[11px] font-semibold tabular-nums text-primary">{valor.length}</span>
              )}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,var(--radix-popover-trigger-width))] min-w-[260px] p-0" align="start">
          <Command
            filter={(v, termo) => {
              const o = opcoes.find(x => x.value === v);
              const texto = `${o?.label ?? ""} ${o?.detalhe ?? ""}`.toLowerCase();
              return texto.includes(termo.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder={busca} />
            <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
              {todos ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([...new Set([...valor, ...todos.valores])])}>
                  {todos.label} ({todos.valores.length})
                </Button>
              ) : <span />}
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onChange([])} disabled={valor.length === 0}>
                Limpar
              </Button>
            </div>
            <CommandList className="max-h-64">
              <CommandEmpty>{vazio}</CommandEmpty>
              <CommandGroup>
                {opcoes.map(o => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => alternar(o.value)} className="gap-2">
                    <span className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      marcados.has(o.value) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}>
                      {marcados.has(o.value) && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.detalhe && <span className="shrink-0 text-[11px] text-muted-foreground">{o.detalhe}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {valor.length > 0 && valor.length <= 12 && (
        <div className="flex flex-wrap gap-1">
          {valor.map(v => (
            <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border/60 bg-muted/40 py-0.5 pl-2 pr-1 text-[11px]">
              <span className="truncate">{rotulo(v)}</span>
              {!disabled && (
                <button type="button" aria-label={`Tirar ${rotulo(v)}`} className="rounded text-muted-foreground hover:text-foreground" onClick={() => alternar(v)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
