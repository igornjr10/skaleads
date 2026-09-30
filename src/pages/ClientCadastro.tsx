import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ClientAvatar } from "@/components/ClientAvatar";

interface ClientRow {
  id: string;
  name: string;
  logo_url: string | null;
  cnpj: string | null;
  cpf: string | null;
  email: string | null;
  site: string | null;
  responsavel_nome: string | null;
  whatsapp_comercial: string | null;
  whatsapp_pessoal: string | null;
  metodo_pagamento: string | null;
}

interface Acesso {
  id: string;
  plataforma: string;
  login: string | null;
  tem_senha: boolean;
  observacao: string | null;
  atualizado_em: string;
}

interface Revelacao {
  id: string;
  plataforma: string;
  revelado_em: string;
  user_id: string | null;
}

const PLATAFORMAS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google",
  tiktok: "TikTok",
};

// Plataformas sugeridas no seletor. Escrever outra no campo livre continua
// valendo: a coluna `plataforma` e texto solto.
const SUGESTOES = ["facebook", "instagram", "google", "tiktok"];

function rotulo(plataforma: string) {
  return PLATAFORMAS[plataforma] ?? plataforma.charAt(0).toUpperCase() + plataforma.slice(1);
}

function digitos(v: string) {
  return v.replace(/\D/g, "");
}

function fmtCNPJ(v: string | null) {
  const d = digitos(v ?? "");
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtCPF(v: string | null) {
  const d = digitos(v ?? "");
  if (d.length !== 11) return v ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fmtFone(v: string | null) {
  const d = digitos(v ?? "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length < 10 || local.length > 11) return v ?? "";
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function copiar(valor: string, oque: string) {
  try {
    await navigator.clipboard.writeText(valor);
    toast.success(`${oque} copiado`);
  } catch {
    toast.error("Nao consegui copiar. Copie manualmente.");
  }
}

export default function ClientCadastro() {
  const { id: clientId } = useParams<{ id: string }>();
  const { role } = useAuth();
  const podeGerenciar = role === "owner" || role === "admin";

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [revelacoes, setRevelacoes] = useState<Revelacao[]>([]);

  const [form, setForm] = useState({
    responsavel_nome: "",
    cnpj: "",
    cpf: "",
    email: "",
    site: "",
    whatsapp_comercial: "",
    whatsapp_pessoal: "",
    metodo_pagamento: "",
  });
  const [salvando, setSalvando] = useState(false);

  const [editando, setEditando] = useState<Acesso | null>(null);
  const [novoAcesso, setNovoAcesso] = useState(false);
  const [acessoForm, setAcessoForm] = useState({ plataforma: "", login: "", senha: "", observacao: "" });
  const [salvandoAcesso, setSalvandoAcesso] = useState(false);

  // Senha revelada fica so na memoria desta tela, indexada por acesso, e some
  // ao sair da pagina. Nao vai para estado global nem para storage.
  const [reveladas, setReveladas] = useState<Record<string, string>>({});

  useEffect(() => {
    if (clientId) carregar(clientId);
  }, [clientId]);

  async function carregar(id: string) {
    setLoading(true);

    const { data: c, error } = await supabase
      .from("clients")
      .select("id, name, logo_url, cnpj, cpf, email, site, responsavel_nome, whatsapp_comercial, whatsapp_pessoal, metodo_pagamento")
      .eq("id", id)
      .maybeSingle();

    if (error) toast.error(error.message);

    const cliente = (c as ClientRow | null) ?? null;
    setClient(cliente);
    if (cliente) {
      setForm({
        responsavel_nome: cliente.responsavel_nome ?? "",
        cnpj: cliente.cnpj ?? "",
        cpf: cliente.cpf ?? "",
        email: cliente.email ?? "",
        site: cliente.site ?? "",
        whatsapp_comercial: cliente.whatsapp_comercial ?? "",
        whatsapp_pessoal: cliente.whatsapp_pessoal ?? "",
        metodo_pagamento: cliente.metodo_pagamento ?? "",
      });
    }

    await carregarAcessos(id);
    setLoading(false);
  }

  async function carregarAcessos(id: string) {
    // Para analyst/viewer a RLS devolve zero linhas — a tela mostra o aviso de
    // restrito em vez de uma lista vazia que pareceria "cliente sem acesso".
    const [acc, rev] = await Promise.all([
      supabase
        .from("client_acessos")
        .select("id, plataforma, login, tem_senha, observacao, atualizado_em")
        .eq("client_id", id)
        .order("plataforma"),
      supabase
        .from("client_acesso_revelacoes")
        .select("id, plataforma, revelado_em, user_id")
        .eq("client_id", id)
        .order("revelado_em", { ascending: false })
        .limit(10),
    ]);

    setAcessos((acc.data as Acesso[] | null) ?? []);
    setRevelacoes((rev.data as Revelacao[] | null) ?? []);
  }

  async function salvarCadastro() {
    if (!clientId) return;
    setSalvando(true);

    const { error } = await supabase
      .from("clients")
      .update({
        responsavel_nome: form.responsavel_nome.trim() || null,
        cnpj: digitos(form.cnpj) || null,
        cpf: digitos(form.cpf) || null,
        email: form.email.trim() || null,
        site: form.site.trim() || null,
        whatsapp_comercial: digitos(form.whatsapp_comercial) || null,
        whatsapp_pessoal: digitos(form.whatsapp_pessoal) || null,
        metodo_pagamento: form.metodo_pagamento.trim() || null,
      })
      .eq("id", clientId);

    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cadastro salvo");
    carregar(clientId);
  }

  function abrirNovoAcesso() {
    setAcessoForm({ plataforma: "", login: "", senha: "", observacao: "" });
    setEditando(null);
    setNovoAcesso(true);
  }

  function abrirEdicao(a: Acesso) {
    setAcessoForm({ plataforma: a.plataforma, login: a.login ?? "", senha: "", observacao: a.observacao ?? "" });
    setEditando(a);
    setNovoAcesso(true);
  }

  async function salvarAcesso() {
    if (!clientId) return;
    if (!acessoForm.plataforma.trim()) {
      toast.error("Informe a plataforma");
      return;
    }
    setSalvandoAcesso(true);

    // Senha vazia numa edicao significa "nao mexi nesse campo": mandar null faz
    // a funcao preservar a senha que ja esta gravada. Para apagar de fato, o
    // botao e outro.
    const manterSenha = editando !== null && acessoForm.senha === "";

    const { error } = await supabase.rpc("salvar_acesso_cliente", {
      p_client_id: clientId,
      p_plataforma: acessoForm.plataforma.trim(),
      p_login: acessoForm.login.trim() || null,
      p_senha: manterSenha ? null : acessoForm.senha,
      p_observacao: acessoForm.observacao.trim() || null,
    });

    setSalvandoAcesso(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(editando ? "Acesso atualizado" : "Acesso adicionado");
    setNovoAcesso(false);
    setEditando(null);
    if (editando) setReveladas(prev => ({ ...prev, [editando.id]: "" }));
    carregarAcessos(clientId);
  }

  async function apagarAcesso(a: Acesso) {
    if (!clientId) return;
    if (!confirm(`Apagar o acesso de ${rotulo(a.plataforma)}?`)) return;

    const { error } = await supabase.rpc("apagar_acesso_cliente", { p_acesso_id: a.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Acesso apagado");
    carregarAcessos(clientId);
  }

  async function revelar(a: Acesso) {
    if (reveladas[a.id]) {
      setReveladas(prev => ({ ...prev, [a.id]: "" }));
      return;
    }

    const { data, error } = await supabase.rpc("revelar_senha_acesso", { p_acesso_id: a.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.info("Esse acesso nao tem senha guardada");
      return;
    }

    setReveladas(prev => ({ ...prev, [a.id]: data as string }));
    if (clientId) carregarAcessos(clientId);
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Cliente nao encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/clients/${clientId}`}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <ClientAvatar name={client.name} logoUrl={client.logo_url} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{client.name}</h1>
          <p className="text-sm text-muted-foreground">Cadastro e acessos</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados cadastrais</CardTitle>
          <CardDescription>
            Documento, contato e forma de pagamento. Visivel para todo o time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="responsavel">Nome do responsavel</Label>
              <Input
                id="responsavel"
                value={form.responsavel_nome}
                onChange={e => setForm({ ...form, responsavel_nome: e.target.value })}
                placeholder="Quem decide do lado do cliente"
                disabled={!podeGerenciar}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="contato@cliente.com.br"
                disabled={!podeGerenciar}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={form.cnpj}
                onChange={e => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
                disabled={!podeGerenciar}
              />
              {client.cnpj && (
                <p className="text-xs text-muted-foreground">Salvo: {fmtCNPJ(client.cnpj)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={form.cpf}
                onChange={e => setForm({ ...form, cpf: e.target.value })}
                placeholder="000.000.000-00"
                disabled={!podeGerenciar}
              />
              {client.cpf && (
                <p className="text-xs text-muted-foreground">Salvo: {fmtCPF(client.cpf)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-com">WhatsApp comercial</Label>
              <Input
                id="wa-com"
                value={form.whatsapp_comercial}
                onChange={e => setForm({ ...form, whatsapp_comercial: e.target.value })}
                placeholder="(11) 90000-0000"
                disabled={!podeGerenciar}
              />
              {client.whatsapp_comercial && (
                <p className="text-xs text-muted-foreground">Salvo: {fmtFone(client.whatsapp_comercial)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-pes">WhatsApp pessoal</Label>
              <Input
                id="wa-pes"
                value={form.whatsapp_pessoal}
                onChange={e => setForm({ ...form, whatsapp_pessoal: e.target.value })}
                placeholder="(11) 90000-0000"
                disabled={!podeGerenciar}
              />
              {client.whatsapp_pessoal && (
                <p className="text-xs text-muted-foreground">Salvo: {fmtFone(client.whatsapp_pessoal)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="site">Site</Label>
              <Input
                id="site"
                value={form.site}
                onChange={e => setForm({ ...form, site: e.target.value })}
                placeholder="https://cliente.com.br"
                disabled={!podeGerenciar}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pagamento">Metodo de pagamento</Label>
              <Input
                id="pagamento"
                value={form.metodo_pagamento}
                onChange={e => setForm({ ...form, metodo_pagamento: e.target.value })}
                placeholder="Pix, boleto, cartao..."
                disabled={!podeGerenciar}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Os WhatsApps acima sao cadastro. O numero que recebe relatorio e alerta continua
            sendo o configurado na tela de Clientes.
          </p>

          {podeGerenciar && (
            <Button onClick={salvarCadastro} disabled={salvando}>
              <Save className="mr-2 h-4 w-4" />
              {salvando ? "Salvando..." : "Salvar cadastro"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Acessos
            </CardTitle>
            <CardDescription>
              Login e senha das contas do cliente. Senha cifrada no banco, restrita a admin e
              owner, e cada revelacao fica registrada.
            </CardDescription>
          </div>
          {podeGerenciar && (
            <Button size="sm" variant="outline" onClick={abrirNovoAcesso}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!podeGerenciar ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              Acessos sao visiveis apenas para admin e owner.
            </div>
          ) : acessos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum acesso cadastrado ainda.</p>
          ) : (
            acessos.map(a => (
              <div key={a.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{rotulo(a.plataforma)}</span>
                    <Badge
                      variant="outline"
                      className={
                        a.tem_senha
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }
                    >
                      {a.tem_senha ? "com senha" : "sem senha"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => abrirEdicao(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => apagarAcesso(a)}>
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground w-12 shrink-0">Login</span>
                    <span className="text-sm truncate">{a.login || "—"}</span>
                    {a.login && (
                      <Button size="sm" variant="ghost" onClick={() => copiar(a.login as string, "Login")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground w-12 shrink-0">Senha</span>
                    <span className="text-sm font-mono truncate">
                      {reveladas[a.id] ? reveladas[a.id] : a.tem_senha ? "••••••••" : "—"}
                    </span>
                    {a.tem_senha && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => revelar(a)}>
                          {reveladas[a.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        {reveladas[a.id] && (
                          <Button size="sm" variant="ghost" onClick={() => copiar(reveladas[a.id], "Senha")}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {a.observacao && (
                  <p className="text-xs text-muted-foreground">{a.observacao}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Atualizado em {fmtDataHora(a.atualizado_em)}
                </p>
              </div>
            ))
          )}

          {podeGerenciar && revelacoes.length > 0 && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Ultimas revelacoes de senha</p>
                {revelacoes.map(r => (
                  <p key={r.id} className="text-xs text-muted-foreground">
                    {rotulo(r.plataforma)} · {fmtDataHora(r.revelado_em)}
                  </p>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={novoAcesso} onOpenChange={setNovoAcesso}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? `Editar acesso: ${rotulo(editando.plataforma)}` : "Novo acesso"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "Deixe a senha em branco para manter a que ja esta guardada."
                : "A senha e cifrada antes de ir para o banco."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plataforma">Plataforma</Label>
              <Input
                id="plataforma"
                value={acessoForm.plataforma}
                onChange={e => setAcessoForm({ ...acessoForm, plataforma: e.target.value })}
                placeholder="facebook"
                disabled={editando !== null}
                list="plataformas-sugeridas"
              />
              <datalist id="plataformas-sugeridas">
                {SUGESTOES.map(p => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label htmlFor="login">Login</Label>
              <Input
                id="login"
                value={acessoForm.login}
                onChange={e => setAcessoForm({ ...acessoForm, login: e.target.value })}
                placeholder="e-mail ou usuario"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                value={acessoForm.senha}
                onChange={e => setAcessoForm({ ...acessoForm, senha: e.target.value })}
                placeholder={editando ? "manter a atual" : "senha da conta"}
                autoComplete="new-password"
              />
              {editando?.tem_senha && (
                <p className="text-xs text-muted-foreground">
                  Para remover a senha guardada, apague o acesso inteiro e cadastre de novo.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="obs">Observacao</Label>
              <Textarea
                id="obs"
                value={acessoForm.observacao}
                onChange={e => setAcessoForm({ ...acessoForm, observacao: e.target.value })}
                placeholder="2FA no celular do responsavel, conta dona do BM, etc."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoAcesso(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarAcesso} disabled={salvandoAcesso}>
              {salvandoAcesso ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
