import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "User data deletion | Gentle Stream",
  description: "How to request deletion of your Gentle Stream account and data.",
};

const cardStyle = {
  fontSize: "0.95rem" as const,
  lineHeight: 1.65,
  background: "#faf8f3",
  borderTop: "2px solid #1a1a1a",
  padding: "1.5rem 1.25rem",
  boxShadow: "0 0 24px rgba(0,0,0,0.06)",
};

/**
 * Public URL for Meta “User data deletion” / similar: https://&lt;your-domain&gt;/data-deletion
 * Set NEXT_PUBLIC_SUPPORT_EMAIL in env for a mailto link; edit copy to match your data practices.
 */
export default function DataDeletionPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ede9e1",
        padding: "2rem 1.25rem 3rem",
        fontFamily: "Georgia, serif",
        color: "#1a1a1a",
      }}
    >
      <div style={{ maxWidth: "40rem", margin: "0 auto" }}>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.75rem",
            marginBottom: "0.5rem",
          }}
        >
          User data deletion
        </h1>
        <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "1.5rem" }}>
          How to ask us to delete data associated with your account.
        </p>

        <div style={cardStyle}>
          <p style={{ marginTop: 0 }}>
            If you signed in to Gentle Stream (including with Google or other providers), you
            can request deletion of your account and associated data we store (for example:
            profile preferences, saved articles, and game progress tied to your user id).
          </p>
          <p>
            <strong>To request deletion:</strong>
          </p>
          <ol style={{ paddingLeft: "1.25rem", margin: "0 0 1rem" }}>
            <li style={{ marginBottom: "0.35rem" }}>
              Send an email from the address you use with your account so we can verify
              ownership.
            </li>
            <li style={{ marginBottom: "0.35rem" }}>
              Use the subject line:{" "}
              <strong style={{ fontFamily: "monospace", fontSize: "0.88em" }}>
                Data deletion request
              </strong>
              .
            </li>
            <li>We will confirm and process your request within a reasonable time (e.g. 30 days).</li>
          </ol>
          {supportEmail ? (
            <p style={{ marginBottom: 0 }}>
              Contact:{" "}
              <a href={`mailto:${supportEmail}?subject=Data%20deletion%20request`} style={{ color: "#5c4a32" }}>
                {supportEmail}
              </a>
            </p>
          ) : (
            <p style={{ marginBottom: 0, color: "#666" }}>
              Add <code style={{ fontSize: "0.85em" }}>NEXT_PUBLIC_SUPPORT_EMAIL</code> to your
              deployment environment so a contact link appears here. Until then, use the
              contact method you publish on your site or app store listing.
            </p>
          )}
        </div>

        <div style={{ ...cardStyle, marginTop: "1.25rem" }}>
          <p style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            <strong>Third-party sign-in (e.g. Google, Facebook)</strong>
          </p>
          <p style={{ marginBottom: 0 }}>
            Removing our copy of your data does not delete your Google or Meta account. You can
            manage those accounts in their respective settings. Authentication is processed by{" "}
            <a
              href="https://supabase.com/privacy"
              style={{ color: "#5c4a32" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Supabase
            </a>
            ; you may also review their policies for data they process as a processor.
          </p>
        </div>

        <p style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
          <a href="/privacy" style={{ color: "#5c4a32" }}>
            Privacy policy
          </a>
          {" · "}
          <a href="/login" style={{ color: "#5c4a32" }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
