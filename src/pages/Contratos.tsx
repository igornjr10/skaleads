import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSignature, Loader2, RefreshCw, Search, Download, Link2, AlertCircle, Settings2, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Signatario {
  nome: string | null;
  email: string | null;
  visto_em: string | null;
  assinado_em: string | null;
  recusado_em: string | null;
}

interface Contrato {
  id: string;
  autentique_id: string;
  client_id: string | null;
  vinculo_manual: boolean;
  nome: string;
  status: "pendente" | "assinado" | "recusado";
  criado_em: string | null;
  assinado_em: string | null;
  arquivo_original: string | null;
  arquivo_assinado: string | null;
  signatarios: Signatario[];
}

interface Cliente {
  id: string;
  name: string;
}

interface Situacao {
  empresa: string | null;
  token_configurado: boolean;
  webhook_configurado: boolean;
}

// A tabela `contratos` e nova e os tipos gerados do Supabase estao atrasados em
// relacao ao banco. O cast fica num lugar so, em vez de espalhado pela tela.
const tabelaContratos = () =>
  (supabase.from as unknown as (t: string) => ReturnType<typeof supabase.from>)("contratos");
const rpcSolta = supabase.rpc as unknown as (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

const TOM: Record<Contrato["status"], { rotulo: string; classe: string; peso: number }> = {
  recusado: { rotulo: "Recusado", classe: "border-rose-200 bg-rose-50 text-rose-700", peso: 0 },
  pendente: { rotulo: "Pendente", classe: "border-amber-200 bg-amber-50 text-amber-700", peso: 1 },
  assinado: { rotulo: "Assinado", classe: "border-emerald-200 bg-emerald-50 text-emerald-700", peso: 2 },
};

function data(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Onde cada signatario parou: e o que responde "por que ainda nao assinou". */
function situacao(s: Signatario): string {
  if (s.recusado_em) return `recusou em ${data(s.recusado_em)}`;
  if (s.assinado_em) return `assinou em ${data(s.assinado_em)}`;
  if (s.visto_em) return `abriu em ${data(s.visto_em)}, sem assinar`;
  return "ainda não abriu";
}

export default function Contratos() {
  const { role } = useAuth();
  const ehAdm = role === "admin" || role === "owner";
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [configurando, setConfigurando] = useState(false);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Contrato["status"] | "sem_cliente">("todos");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    const [c, cl, sit] = await Promise.all([
      tabelaContratos().select("*").order("criado_em", { ascending: false }),
      supabase.from("clients").select("id, name").order("name"),
      rpcSolta("autentique_situacao"),
    ]);
    setSituacao(((sit.data as Situacao[] | null) ?? [])[0] ?? null);
    setContratos((c.data as unknown as Contrato[]) ?? []);
    setClientes((cl.data as Cliente[]) ?? []);
    setCarregando(false);
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      const { data: resposta, error } = await supabase.functions.invoke("sync-autentique");
      if (error) throw new Error(error.message);
      if (resposta?.ok === false) throw new Error(resposta.error);
      toast.success(`${resposta?.gravados ?? 0} contrato(s) sincronizados`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sincronizar");
    } finally {
      setSincronizando(false);
    }
  }

  async function vincular(contratoId: string, clientId: string) {
    // `vinculo_manual` marca que a escolha foi de uma pessoa: a sincronizacao
    // seguinte nao pode desfazer por causa do palpite pelo nome.
    const { error } = await tabelaContratos()
      .update({ client_id: clientId, vinculo_manual: true } as never)
      .eq("id", contratoId);
    if (error) { toast.error(error.message); return; }
    setContratos(prev => prev.map(c => (c.id === contratoId ? { ...c, client_id: clientId, vinculo_manual: true } : c)));
    toast.success("Contrato vinculado");
  }

  const nomeDoCliente = useMemo(() => new Map(clientes.map(c => [c.id, c.name])), [clientes]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contratos
      .filter(c => {
        if (filtro === "sem_cliente") return !c.client_id;
        if (filtro !== "todos") return c.status === filtro;
        return true;
      })
      .filter(c => {
        if (!termo) return true;
        const cliente = c.client_id ? (nomeDoCliente.get(c.client_id) ?? "") : "";
        return c.nome.toLowerCase().includes(termo) || cliente.toLowerCase().includes(termo);
      })
      .sort((a, b) => TOM[a.status].peso - TOM[b.status].peso);
  }, [contratos, filtro, busca, nomeDoCliente]);

  const semCliente = contratos.filter(c => !c.client_id).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileSignature className="h-6 w-6 text-primary" />
            Contratos
          </h1>
          <p className="text-sm text-muted-foreground">
            Espelho da Autentique. Criar e enviar continua sendo lá.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ehAdm && (
            <Button onClick={() => setConfigurando(true)} variant="ghost">
              <Settings2 className="mr-2 h-4 w-4" />
              Configurar Autentique
            </Button>
          )}
          <Button onClick={sincronizar} disabled={sincronizando || situacao?.token_configurado === false} variant="outline">
            {sincronizando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sincronizar
          </Button>
        </div>
      </div>

      {situacao && (!situacao.token_configurado || !situacao.webhook_configurado) && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                {!situacao.token_configurado
                  ? "A Autentique ainda não está conectada: sem o token da API nada é espelhado."
                  : "Sem o webhook, os contratos só atualizam na varredura de 6 em 6 horas."}
                {!ehAdm && " Peça para um ADM configurar."}
              </span>
            </div>
            {ehAdm && (
              <Button size="sm" onClick={() => setConfigurando(true)}>
                {situacao.token_configurado ? "Configurar webhook" : "Conectar Autentique"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por contrato ou cliente"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtro} onValueChange={v => setFiltro(v as typeof filtro)}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="assinado">Assinados</SelectItem>
            <SelectItem value="recusado">Recusados</SelectItem>
            <SelectItem value="sem_cliente">Sem cliente {semCliente > 0 ? `(${semCliente})` : ""}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : visiveis.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            {contratos.length === 0
              ? situacao?.token_configurado === false
                ? "Conecte a Autentique para trazer os contratos."
                : "Nenhum contrato ainda. Clique em Sincronizar para trazer o que já existe na Autentique."
              : "Nenhum contrato com esse filtro."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visiveis.map(contrato => (
            <Card key={contrato.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{contrato.nome}</span>
                      <Badge variant="outline" className={TOM[contrato.status].classe}>
                        {TOM[contrato.status].rotulo}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Criado em {data(contrato.criado_em)}
                      {contrato.assinado_em ? ` · fechado em ${data(contrato.assinado_em)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {contrato.arquivo_assinado && (
                      <Button asChild size="sm" variant="outline">
                        <a href={contrato.arquivo_assinado} target="_blank" rel="noreferrer">
                          <Download className="mr-2 h-4 w-4" /> Assinado
                        </a>
                      </Button>
                    )}
                    {contrato.arquivo_original && !contrato.arquivo_assinado && (
                      <Button asChild size="sm" variant="ghost">
                        <a href={contrato.arquivo_original} target="_blank" rel="noreferrer">
                          <Download className="mr-2 h-4 w-4" /> Original
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  {contrato.client_id ? (
                    <span>
                      {nomeDoCliente.get(contrato.client_id) ?? "(cliente removido)"}
                      {contrato.vinculo_manual && (
                        <span className="ml-2 text-xs text-muted-foreground">vinculado à mão</span>
                      )}
                    </span>
                  ) : (
                    <Select onValueChange={v => vincular(contrato.id, v)}>
                      <SelectTrigger className="h-8 w-[240px]">
                        <SelectValue placeholder="Vincular a um cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientes.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {contrato.signatarios.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    {contrato.signatarios.map((s, i) => (
                      <div key={`${contrato.id}-${i}`} className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{s.nome || s.email || "(sem nome)"}</span>
                        <span>{situacao(s)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {ehAdm && situacao?.empresa && (
        <ConfigurarAutentique
          aberto={configurando}
          aoFechar={() => setConfigurando(false)}
          situacao={situacao}
          aoSalvar={async (tokenNovo) => {
            setConfigurando(false);
            await carregar();
            if (tokenNovo) await sincronizar();
          }}
        />
      )}
    </div>
  );
}

function ConfigurarAutentique({
  aberto,
  aoFechar,
  situacao,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  situacao: Situacao;
  aoSalvar: (tokenNovo: boolean) => void;
}) {
  const [token, setToken] = useState("");
  const [segredo, setSegredo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const urlWebhook = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/autentique-webhook?empresa=${situacao.empresa}`;

  async function salvar() {
    setSalvando(true);
    const { error } = await rpcSolta("configurar_autentique", {
      _token: token.trim() || null,
      _webhook_secret: segredo.trim() || null,
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Autentique configurada");
    const tokenNovo = Boolean(token.trim());
    setToken("");
    setSegredo("");
    aoSalvar(tokenNovo);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(urlWebhook);
      toast.success("URL copiada");
    } catch {
      toast.error("Não deu para copiar. Selecione e copie à mão.");
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={v => !v && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar Autentique</DialogTitle>
          <DialogDescription>
            O token fica guardado no servidor e não volta para a tela. Deixe um campo vazio para manter o que já está salvo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="autentique-token">
              1. Token da API {situacao.token_configurado && <span className="text-xs text-emerald-600">(salvo)</span>}
            </Label>
            <Input
              id="autentique-token"
              type="password"
              autoComplete="off"
              placeholder={situacao.token_configurado ? "•••••••• (deixe vazio para manter)" : "Cole o token"}
              value={token}
              onChange={e => setToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Gerado na área de API / desenvolvedor do painel da Autentique.</p>
          </div>

          <div className="space-y-2">
            <Label>2. URL do webhook</Label>
            <div className="flex gap-2">
              <Input readOnly value={urlWebhook} className="font-mono text-xs" onFocus={e => e.target.select()} />
              <Button type="button" size="icon" variant="outline" onClick={copiar} aria-label="Copiar URL">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              No painel de desenvolvedor da Autentique, cadastre um webhook com esta URL e marque os eventos de documento
              e de assinatura (document.* e signature.*).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="autentique-segredo">
              3. Segredo do webhook {situacao.webhook_configurado && <span className="text-xs text-emerald-600">(salvo)</span>}
            </Label>
            <Input
              id="autentique-segredo"
              type="password"
              autoComplete="off"
              placeholder={situacao.webhook_configurado ? "•••••••• (deixe vazio para manter)" : "Cole o segredo que a Autentique mostrar"}
              value={segredo}
              onChange={e => setSegredo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || (!token.trim() && !segredo.trim())}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
