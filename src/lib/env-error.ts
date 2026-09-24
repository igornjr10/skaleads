// Fica separado do `env.ts` porque aquele modulo lanca durante o import.
// Quem precisa so do tipo do erro (o main.tsx, para montar a tela de falha)
// importa daqui e nao dispara a validacao.
export class MissingEnvError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Variaveis de ambiente ausentes no build: ${missing.join(", ")}. ` +
        `Cadastre no painel do Vercel (Settings > Environment Variables) e refaca o deploy sem cache.`,
    );
    this.name = "MissingEnvError";
    this.missing = missing;
  }
}
