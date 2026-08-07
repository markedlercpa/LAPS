import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Edler Zain",
  description: "How Edler Zain's LAPS application collects, uses, stores, and protects data, including data accessed from Intuit QuickBooks Online.",
};

const UPDATED = "August 7, 2026";
const COMPANY = "Edler Zain";
const APP = "LAPS";
const CONTACT = "privacy@edlerzain.com";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12">
      <p className="micro-label mb-2">{COMPANY}</p>
      <h1 className="mb-1">Privacy Policy</h1>
      <p className="mb-8 text-muted">Last updated: {UPDATED}</p>

      <Section title="1. Overview">
        <p>
          This Privacy Policy explains how {COMPANY} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses,
          stores, and protects information in connection with {APP}, our internal enterprise resource planning
          application used to operate our accounting and advisory practice. {APP} is used by {COMPANY} personnel; it is
          not a consumer product and is not offered to the general public.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <p>We collect and process the following categories of information:</p>
        <ul>
          <li><strong>Account &amp; authentication data</strong> — names, work email addresses, and role, provided through Microsoft 365 single sign-on, used to authenticate authorized users.</li>
          <li><strong>Business &amp; client relationship data</strong> — records we create in the ordinary course of our practice (leads, appointments, proposals, engagements, tasks, and related notes).</li>
          <li><strong>Financial &amp; accounting data from connected systems</strong> — see Section 3.</li>
          <li><strong>Usage data</strong> — standard application and server logs used to operate and secure the service.</li>
        </ul>
      </Section>

      <Section title="3. Intuit QuickBooks Online Data">
        <p>
          When an authorized user connects a company&rsquo;s QuickBooks Online (&ldquo;QBO&rdquo;) file to {APP}, we access
          accounting data through the Intuit QuickBooks Online API under the authorization granted during the OAuth
          connection. The data we access may include the chart of accounts, trial balances, general ledger transaction
          detail, financial reports (such as profit &amp; loss and balance sheet), and accounts-receivable and
          accounts-payable information.
        </p>
        <ul>
          <li><strong>Purpose.</strong> This data is used solely to display and analyze the connected company&rsquo;s own financial information within {APP} — producing statements, budgets, cash forecasts, and key-performance dashboards for {COMPANY} and, where applicable, that company&rsquo;s authorized representatives.</li>
          <li><strong>Read-only.</strong> {APP} reads accounting data from QuickBooks. It does not write, modify, or delete records in the QuickBooks ledger.</li>
          <li><strong>No sale of data.</strong> We do not sell QuickBooks data or use it for advertising.</li>
          <li><strong>Tokens.</strong> OAuth access and refresh tokens are stored securely and used only to retrieve the authorized data on the connected company&rsquo;s behalf.</li>
        </ul>
      </Section>

      <Section title="4. How We Use Information">
        <p>We use information to operate, maintain, and secure {APP}; to provide financial reporting, analytics, and delivery workflows; to communicate with authorized users; and to comply with our legal and professional obligations as a CPA and advisory firm.</p>
      </Section>

      <Section title="5. How We Store &amp; Protect Information">
        <p>
          Data is stored in a private, access-controlled PostgreSQL database and application hosted on Render, a cloud
          platform provider, in the United States. Access is restricted to authorized {COMPANY} personnel. Data is
          transmitted over encrypted connections (HTTPS/TLS). We apply reasonable administrative, technical, and
          physical safeguards appropriate to the sensitivity of the information.
        </p>
      </Section>

      <Section title="6. How We Share Information">
        <p>
          We do not sell personal or financial information. We share information only with service providers that host
          or support the application (for example, our cloud hosting and database provider), and with connected
          platforms strictly as needed to provide the service you authorized (for example, Intuit and Microsoft). We
          may disclose information if required by law or to protect our legal rights.
        </p>
      </Section>

      <Section title="7. Data Retention &amp; Disconnection">
        <p>
          We retain QuickBooks-sourced data for as long as the connection remains active and as needed for our
          reporting and record-keeping obligations. You may disconnect a QuickBooks company at any time — from within
          QuickBooks or within {APP} — which revokes {APP}&rsquo;s access and causes stored access tokens for that
          connection to be cleared. You may request deletion of connected-company data as described below, subject to
          any records we are required to retain by law or professional standards.
        </p>
      </Section>

      <Section title="8. Your Choices">
        <p>Authorized users and connected companies may request access to, correction of, or deletion of their information, and may revoke a system connection at any time. To make a request, contact us at the address below.</p>
      </Section>

      <Section title="9. Changes to This Policy">
        <p>We may update this Privacy Policy from time to time. Material changes will be reflected by updating the &ldquo;Last updated&rdquo; date above.</p>
      </Section>

      <Section title="10. Contact Us">
        <p>
          Questions about this Privacy Policy or our data practices can be sent to{" "}
          <a className="text-accent-700" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </Section>

      <p className="mt-10 border-t-2 border-divider pt-4 text-[12px] text-muted">
        © {COMPANY}. See also our <a className="text-accent-700" href="/legal/eula">End-User License Agreement</a>.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[18px]">{title}</h2>
      <div className="space-y-2 text-[14px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
    </section>
  );
}
