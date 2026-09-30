import { MissingEnvError } from "./env-error";

// Ultimo recurso: roda quando o app nem chegou a montar, entao nao pode depender
// de React, do Tailwind nem do index.css - so DOM e estilo inline.
export function renderFatal(root: HTMLElement, error: unknown) {
  const isEnv = error instanceof MissingEnvError;
  const detail = error instanceof Error ? error.message : String(error);

  const shell = document.createElement("div");
  shell.setAttribute(
    "style",
    "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;" +
      "background:#0b0b0f;color:#f4f4f5;font-family:'Plus Jakarta Sans',system-ui,sans-serif;",
  );

  const card = document.createElement("div");
  card.setAttribute(
    "style",
    "max-width:560px;width:100%;border:1px solid #27272a;border-radius:16px;padding:28px;" +
      "background:#141419;box-shadow:0 24px 60px rgba(0,0,0,.45);",
  );

  const title = document.createElement("h1");
  title.setAttribute("style", "margin:0 0 12px;font-size:20px;font-weight:700;color:#34d399;");
  title.textContent = isEnv ? "Configuracao do deploy incompleta" : "Nao foi possivel iniciar o app";
  card.appendChild(title);

  const body = document.createElement("p");
  body.setAttribute("style", "margin:0 0 16px;font-size:14px;line-height:1.6;color:#a1a1aa;");
  body.textContent = isEnv
    ? "O build subiu sem as variaveis de ambiente abaixo. Cadastre no painel do Vercel (Settings > Environment Variables), marque Production/Preview/Development e refaca o deploy sem cache."
    : "O erro completo esta no console do navegador.";
  card.appendChild(body);

  if (isEnv) {
    const list = document.createElement("ul");
    list.setAttribute(
      "style",
      "margin:0 0 16px;padding:12px 16px 12px 32px;border-radius:10px;background:#0b0b0f;" +
        "border:1px solid #27272a;font-family:ui-monospace,monospace;font-size:13px;color:#fbbf24;",
    );
    for (const key of error.missing) {
      const item = document.createElement("li");
      item.textContent = key;
      list.appendChild(item);
    }
    card.appendChild(list);
  }

  const raw = document.createElement("p");
  raw.setAttribute("style", "margin:0;font-size:12px;line-height:1.6;color:#71717a;word-break:break-word;");
  raw.textContent = detail;
  card.appendChild(raw);

  shell.appendChild(card);
  root.replaceChildren(shell);
}
