import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { captureError } from "../lib/observability";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Catches render errors so one bad page does not leave the SPA as a
// permanent blank screen until a full reload.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, {
      kind: "react_render",
      fields: { componentStack: info.componentStack },
    });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            {this.state.error.message}
          </p>
          <div className="flex flex-wrap gap-3 justify-center text-sm">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <Link to="/" className="px-3 py-1.5 rounded-md border border-border hover:bg-accent/50">
              Home
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
