import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // If the error is from third party extensions, ignore it
    const msg = error.message || '';
    if (msg.includes('MetaMask') || msg.includes('ethereum') || msg.includes('wallet')) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-neutral-950 text-neutral-200 p-6 text-center">
          <h2 className="text-lg font-bold text-rose-400 mb-2">Khimea Studio Encountered an Issue</h2>
          <p className="text-xs text-neutral-400 max-w-md mb-4">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
          >
            Reload Studio
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
