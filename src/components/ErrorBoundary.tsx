import React, { type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("UI error:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-8 font-sans">
          <div className="max-w-lg space-y-4 border border-red-500/30 rounded-lg p-6 bg-[#111]">
            <h1 className="text-lg font-bold text-red-400">Something went wrong</h1>
            <p className="text-sm text-white/70">
              The dashboard hit a rendering error. If you use Firefox, check the developer console (F12) and
              try a hard refresh. Details:
            </p>
            <pre className="text-xs font-mono text-white/90 whitespace-pre-wrap break-words bg-black/50 p-3 rounded border border-white/10">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
