import { createRoot } from "react-dom/client";
import "./index.css";
import { renderFatal } from "./lib/fatal-screen";

// O import do App e dinamico de proposito. Num import estatico, um erro na
// avaliacao dos modulos (ex.: variavel de ambiente ausente no build) estoura
// antes de qualquer linha daqui rodar: a pagina fica branca, sem mensagem e
// sem nada no DOM. Com import dinamico o erro vira uma promise rejeitada e da
// para mostrar o motivo na tela.
async function boot() {
  const root = document.getElementById("root");
  if (!root) return;

  try {
    const { default: App } = await import("./App.tsx");
    createRoot(root).render(<App />);
  } catch (error) {
    console.error("Falha ao iniciar o app:", error);
    renderFatal(root, error);
  }
}

void boot();
