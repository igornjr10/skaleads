import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendChatMessage, type ChatMessage } from "@/lib/ai-service";

interface Client {
  id: string;
  name: string;
  status: string;
}

const SUGGESTIONS = [
  "Como estão as campanhas ativas?",
  "Qual campanha está gastando mais?",
  "Tem algum problema crítico para resolver?",
  "Me dá um resumo do desempenho geral",
];

export default function Chat() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("all");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, status")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setClients(data ?? []));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);

    try {
      const { reply } = await sendChatMessage(next, clientId === "all" ? undefined : clientId);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao chamar assistente");
      setMessages(next);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="flex h-[calc(100svh-5rem)] flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-none text-foreground">Assistente IA</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {clientId === "all" ? "Visão geral de todos os clientes" : `Contexto: ${selectedClient?.name}`}
            </p>
          </div>
        </div>

        <Select value={clientId} onValueChange={(v) => { setClientId(v); setMessages([]); }}>
          <SelectTrigger className="h-8 w-52 rounded-xl border-border/60 bg-card/80 text-sm">
            <SelectValue placeholder="Selecionar cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <Bot className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">Como posso ajudar?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pergunte sobre campanhas, métricas, alertas ou clientes.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-tr-sm bg-emerald-500/15 text-foreground ring-1 ring-emerald-500/20"
                      : "rounded-tl-sm bg-card/80 text-foreground ring-1 ring-border/60"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 list-decimal pl-4">{children}</ol>,
                        li: ({ children }) => <li className="mb-0.5">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-emerald-300">{children}</strong>,
                        h2: ({ children }) => <h2 className="mb-1 mt-3 text-base font-semibold first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>,
                        code: ({ children }) => <code className="rounded bg-white/5 px-1 py-0.5 text-xs font-mono">{children}</code>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-border/60">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-card/80 px-4 py-3 ring-1 ring-border/60">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border/60 bg-card/60 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta... (Enter para enviar)"
            rows={1}
            className="min-h-[40px] max-h-32 resize-none rounded-xl border-border/60 bg-background/60 text-sm focus-visible:ring-emerald-500/40"
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted-foreground/50">
          Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}
