import { Component, type ErrorInfo, type ReactNode } from 'react';
import { diagnostic } from '../renderer/diagnostics.ts';
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error): { error: Error } { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    diagnostic('REACT_ERROR_BOUNDARY', { error: error.stack ?? error.message, componentStack: info.componentStack ?? '' });
  }
  render(): ReactNode {
    if (this.state.error) return <main role="alert" style={{ padding: 24, height: '100dvh', overflow: 'auto' }}><h1>Erro no renderer da ClickIT</h1><pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.stack ?? this.state.error.message}</pre></main>;
    return this.props.children;
  }
}
