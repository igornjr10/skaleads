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
