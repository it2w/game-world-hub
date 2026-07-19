import React from "react";

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "60px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20
            }}>🎮</div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Game World Hub</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>
            Privacy Policy
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
            Last updated: July 19, 2026
          </p>
        </div>

        <div style={{ lineHeight: 1.8, fontSize: 15 }}>

          <Section title="1. Introduction">
            Game World Hub ("we", "our", or "us") is a gaming community platform that connects
            players, supports party formation, tournaments, leaderboards, and social features.
            This Privacy Policy explains what information we collect, how we use it, and your
            rights regarding your data.
          </Section>

          <Section title="2. Information We Collect">
            <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
              <li><strong>Account information</strong> — username, email address, and password (hashed).</li>
              <li><strong>Profile information</strong> — display name, avatar, bio, and linked gaming handles you choose to share.</li>
              <li><strong>Game activity</strong> — games you add to your library, session presence, and Steam-linked owned games (only if you connect your Steam account).</li>
              <li><strong>Communications</strong> — messages sent in direct chats, group chats, and party rooms.</li>
              <li><strong>Usage data</strong> — pages visited, features used, and timestamps for core interactions.</li>
              <li><strong>Device information</strong> — on the desktop app, OS version and app version for crash reporting purposes.</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
              <li>Provide and operate the platform (matchmaking, parties, tournaments, leaderboards).</li>
              <li>Authenticate your account and keep it secure.</li>
              <li>Send transactional emails (e.g. email verification, password reset).</li>
              <li>Show your public profile to other users according to your privacy settings.</li>
              <li>Improve the service through aggregated, anonymised analytics.</li>
              <li>Enforce our Terms of Service and community guidelines.</li>
            </ul>
          </Section>

          <Section title="4. Information Sharing">
            We do <strong>not</strong> sell your personal information. We share data only in these limited cases:
            <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
              <li><strong>With other users</strong> — your public profile, status, and activity visible to the community based on your privacy settings.</li>
              <li><strong>Service providers</strong> — hosting, email delivery (Resend), and voice infrastructure (LiveKit) under strict data-processing agreements.</li>
              <li><strong>Legal requirements</strong> — when required by law or to protect the rights and safety of our users.</li>
            </ul>
          </Section>

          <Section title="5. Data Retention">
            We retain your account data for as long as your account is active. You may delete your
            account at any time from Settings → Account. Upon deletion, your personal data is
            removed within 30 days, except where retention is required by law.
          </Section>

          <Section title="6. Security">
            We protect your data using industry-standard measures: HTTPS in transit, hashed
            passwords (bcrypt), and access controls on our servers. No system is perfectly secure;
            if you suspect unauthorised access please contact us immediately.
          </Section>

          <Section title="7. Children's Privacy">
            Game World Hub is not directed to children under 13. We do not knowingly collect
            personal information from children under 13. If we become aware that a child has
            provided us with personal data, we will delete it promptly.
          </Section>

          <Section title="8. Your Rights">
            Depending on your location you may have the right to:
            <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your data.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Data portability (receive your data in a machine-readable format).</li>
            </ul>
            To exercise any right, email us at <a href="mailto:privacy@gameworldhub.com" style={{ color: "#6366f1" }}>privacy@gameworldhub.com</a>.
          </Section>

          <Section title="9. Cookies & Local Storage">
            We use session cookies for authentication and local storage to remember your
            preferences (language, theme). We do not use third-party advertising cookies.
          </Section>

          <Section title="10. Changes to This Policy">
            We may update this policy from time to time. We will notify you of significant changes
            by posting a notice in the app or by email. Continued use of the service after changes
            constitutes acceptance of the updated policy.
          </Section>

          <Section title="11. Contact Us">
            If you have questions about this Privacy Policy, contact us at:<br />
            <a href="mailto:privacy@gameworldhub.com" style={{ color: "#6366f1" }}>
              privacy@gameworldhub.com
            </a>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>
        {title}
      </h2>
      <div style={{ color: "#d1d5db" }}>{children}</div>
    </div>
  );
}
