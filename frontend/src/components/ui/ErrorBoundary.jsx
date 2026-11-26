import React from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import Button from './Button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        });
      }

      return (
        <div className="glass mx-auto my-12 max-w-xl rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
            <AlertTriangle className="size-7" />
          </div>
          <h2 className="display-xl text-2xl text-bone">Something went wrong</h2>
          <p className="mt-2 text-sm text-neutral-400">
            {this.state.error?.message || 'An unexpected rendering error occurred while loading this view.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => window.location.assign('/app')}>
              <ArrowLeft className="size-4" /> All stations
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" /> Reload page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
