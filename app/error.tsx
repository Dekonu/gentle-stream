"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/observability/client";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    captureException(error, {
      surface: "app_error_boundary",
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <main
      style={{
        minHeight: "50vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
      }}
    >
      <section
        style={{
          maxWidth: "640px",
          width: "100%",
          border: "1px solid #d9ccb4",
          background: "#fcfaf5",
          padding: "1.25rem",
          color: "#3f2f1c",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: "0.65rem" }}>
          Something went wrong
        </h1>
        <p style={{ marginTop: 0, marginBottom: "1rem" }}>
          We hit an unexpected error while rendering this page.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: "1px solid #3f2f1c",
            background: "transparent",
            color: "#3f2f1c",
            padding: "0.45rem 0.8rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </section>
    </main>
  );
}
