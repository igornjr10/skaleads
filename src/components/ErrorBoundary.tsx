import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Falha ao renderizar a página:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Não foi possível mostrar esta página</h1>
        <p className="text-sm text-muted-foreground">
          Ocorreu um erro ao exibir o conteúdo. Tente abrir a página novamente.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => this.setState({ failed: false })}
          >
            Tentar novamente
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-4 py-2 text-sm"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}
