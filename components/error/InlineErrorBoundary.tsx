"use client";

import type { ReactNode } from "react";
import { Component } from "react";
import { captureException } from "@/lib/observability";

interface InlineErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle: string;
  fallbackMessage: string;
}

interface InlineErrorBoundaryState {
  hasError: boolean;
}

export class InlineErrorBoundary extends Component<
  InlineErrorBoundaryProps,
  InlineErrorBoundaryState
> {
  state: InlineErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): InlineErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    captureException(error, {
      surface: "inline_error_boundary",
      fallbackTitle: this.props.fallbackTitle,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            border: "1px solid #d9ccb4",
            background: "#fcfaf5",
            padding: "0.8rem",
            color: "#5f4b2f",
          }}
        >
          <strong style={{ display: "block", marginBottom: "0.35rem" }}>
            {this.props.fallbackTitle}
          </strong>
          <span>{this.props.fallbackMessage}</span>
        </div>
      );
    }
    return this.props.children;
  }
}
