import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** When this changes (e.g. the route), a caught error is cleared and the children render again. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Last line of defence for the routed content: a page that throws while rendering, or a lazy chunk
 * that can't be fetched (offline, or replaced by a new deploy), shows a way out instead of a blank app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid min-h-[70dvh] place-items-center p-6 text-center">
        <div className="paper-raised max-w-sm rounded-[16px] p-8">
          <h1 className="font-display text-2xl font-bold">Algo se ha torcido</h1>
          <p className="mt-2 text-washi-muted">
            No pudimos mostrar esta pantalla. Puede que haya una versión nueva o que se cortara la conexión.
          </p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </div>
      </div>
    );
  }
}
