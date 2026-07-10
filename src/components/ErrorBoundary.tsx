// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/ErrorBoundary.tsx
// Description: Top-level React error boundary extracted verbatim from App.tsx. Catches render
//   errors and shows a calm reload screen (dev builds also show the error text).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { logger } from '../lib/logger';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: unknown }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.critical('uncaught_render_error', 'Uncaught error reached the top-level error boundary', {
      category: 'SYSTEM_HEALTH',
      error,
      details: { componentStack: errorInfo?.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-ios-bg p-6 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-ios-black mb-2">Something went wrong</h1>
          <p className="text-ios-gray mb-8 max-w-md">
            We've encountered an unexpected error. Don't worry, your progress is safe.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg shadow-ios-blue/20 active:scale-95 transition-transform"
          >
            Reload Application
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-black/5 rounded-xl text-left text-xs overflow-auto max-w-full text-red-600">
              {this.state.error == null ? null : String(this.state.error)}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
