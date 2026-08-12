import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Sem isto, qualquer excecao no render derruba a arvore inteira e o usuario fica
// olhando uma tela branca, sem mensagem e sem rastro no console de producao.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro nao tratado na interface:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Algo quebrou nesta tela</h1>
              <p className="text-xs text-muted-foreground">O restante do sistema continua funcionando.</p>
            </div>
          </div>

          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
            {error.message}
          </pre>

          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => this.setState({ error: null })}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Tentar de novo
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => (window.location.href = "/")}>
              Ir para o inicio
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
