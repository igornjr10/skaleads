// Chat no formato da OpenAI. Com OPENAI_API_KEY vai para a OpenAI; sem ela,
// para a Groq, que fala o mesmo formato. O modelo vem de secret: trocar nao
// exige redeploy.

export interface ProvedorLLM {
  nome: "OpenAI" | "Groq";
  url: string;
  key: string;
  model: string;
}

export function provedorLLM(): ProvedorLLM {
  const openai = Deno.env.get("OPENAI_API_KEY");
  if (openai) {
    return {
      nome: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      key: openai,
      model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini",
    };
  }
  const groq = Deno.env.get("GROQ_API_KEY");
  if (groq) {
    return {
      nome: "Groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: groq,
      model: Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b",
    };
  }
  throw new Error("Nenhuma chave de IA configurada (OPENAI_API_KEY ou GROQ_API_KEY)");
}

// Os modelos novos da OpenAI recusam `max_tokens`; a Groq so conhece ele.
export function limiteDeTokens(p: ProvedorLLM, n: number) {
  return p.nome === "OpenAI" ? { max_completion_tokens: n } : { max_tokens: n };
}

const SECRET_DA_CHAVE: Record<ProvedorLLM["nome"], string> = { OpenAI: "OPENAI_API_KEY", Groq: "GROQ_API_KEY" };

/**
 * Erro do provedor que a tela consegue mostrar. A resposta crua da OpenAI num
 * 401 traz pedaco da chave e fala com quem programa; quem ve o toast e o gestor,
 * que precisa saber o que fazer.
 */
export async function erroDoProvedor(p: ProvedorLLM, res: Response): Promise<Error> {
  const corpo = await res.text().catch(() => "");
  let mensagem = corpo;
  try {
    mensagem = JSON.parse(corpo)?.error?.message ?? corpo;
  } catch { /* corpo nao era JSON */ }
  console.error(`${p.nome} respondeu ${res.status}: ${mensagem.slice(0, 500)}`);

  if (res.status === 401 || res.status === 403) {
    return new Error(`A chave da ${p.nome} foi recusada (invalida ou revogada). Um ADM precisa trocar o secret ${SECRET_DA_CHAVE[p.nome]} nas Edge Functions do Supabase.`);
  }
  if (res.status === 429) {
    return /quota|billing|insufficient/i.test(mensagem)
      ? new Error(`A conta da ${p.nome} esta sem credito. Recarregue em platform.openai.com/settings/organization/billing.`)
      : new Error(`A ${p.nome} esta limitando as chamadas agora. Tente de novo em um minuto.`);
  }
  if (res.status >= 500) return new Error(`A ${p.nome} esta instavel (${res.status}). Tente de novo em instantes.`);
  return new Error(`${p.nome} respondeu ${res.status}: ${mensagem.slice(0, 200)}`);
}
