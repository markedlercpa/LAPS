import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "End-User License Agreement — Edler Zain",
  description: "The end-user license agreement governing use of Edler Zain's Pulse application.",
};

const UPDATED = "August 7, 2026";
const COMPANY = "Edler Zain";
const APP = "Pulse";
const CONTACT = "privacy@edlerzain.com";

export default function EulaPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12">
      <p className="micro-label mb-2">{COMPANY}</p>
      <h1 className="mb-1">End-User License Agreement</h1>
      <p className="mb-8 text-muted">Last updated: {UPDATED}</p>

      <Section title="1. Agreement">
        <p>
          This End-User License Agreement (&ldquo;Agreement&rdquo;) governs access to and use of {APP}, an internal
          enterprise application provided by {COMPANY} (&ldquo;{COMPANY},&rdquo; &ldquo;we,&rdquo; or &ldquo;us&rdquo;). By
          accessing or using {APP}, you (&ldquo;you&rdquo; or the &ldquo;user&rdquo;) agree to be bound by this Agreement. If
          you do not agree, do not use {APP}.
        </p>
      </Section>

      <Section title="2. License">
        <p>
          {COMPANY} grants authorized users a limited, non-exclusive, non-transferable, revocable license to use {APP}
          solely for {COMPANY}&rsquo;s internal business purposes and for the authorized administration of connected
          client engagements. {APP} is licensed, not sold, and all rights not expressly granted are reserved.
        </p>
      </Section>

      <Section title="3. Acceptable Use">
        <p>You agree not to:</p>
        <ul>
          <li>access {APP} without authorization, or share credentials;</li>
          <li>use {APP} for any unlawful purpose or in violation of applicable professional standards;</li>
          <li>attempt to reverse engineer, disrupt, or compromise the security of the application; or</li>
          <li>use connected-system data (including QuickBooks data) for any purpose other than the authorized administration and analysis of the relevant company&rsquo;s financials.</li>
        </ul>
      </Section>

      <Section title="4. Connected Services">
        <p>
          {APP} integrates with third-party services, including Intuit QuickBooks Online and Microsoft 365, at your
          direction and under authorizations you grant. Your use of those services remains subject to their respective
          terms. {COMPANY} accesses connected-service data only as described in our{" "}
          <a className="text-accent-700" href="/legal/privacy">Privacy Policy</a>, and does not modify records in
          connected accounting ledgers.
        </p>
      </Section>

      <Section title="5. Data &amp; Confidentiality">
        <p>
          Financial and client information handled through {APP} is confidential. Users must handle it in accordance
          with {COMPANY}&rsquo;s confidentiality obligations, applicable law, and the Privacy Policy. Our collection and
          use of information is described in the <a className="text-accent-700" href="/legal/privacy">Privacy Policy</a>,
          which is incorporated into this Agreement by reference.
        </p>
      </Section>

      <Section title="6. Intellectual Property">
        <p>{APP}, including its software, design, and content, is owned by {COMPANY} and protected by applicable intellectual-property laws.</p>
      </Section>

      <Section title="7. Disclaimers">
        <p>
          {APP} is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied. Financial figures,
          forecasts, and analytics presented in {APP} are for internal management purposes, may be derived from
          unaudited or in-period data, and do not constitute audited financial statements, tax advice, or a guarantee of
          results.
        </p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, {COMPANY} will not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or any loss of data or profits, arising out of or related to your use of
          {" "}{APP}.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>We may suspend or terminate access to {APP} at any time, including for violation of this Agreement. Upon termination, the license granted here ends and you must stop using {APP}.</p>
      </Section>

      <Section title="10. Changes &amp; Contact">
        <p>
          We may update this Agreement from time to time; material changes are reflected by the &ldquo;Last updated&rdquo;
          date above. Questions can be sent to{" "}
          <a className="text-accent-700" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </Section>

      <p className="mt-10 border-t-2 border-divider pt-4 text-[12px] text-muted">
        © {COMPANY}. See also our <a className="text-accent-700" href="/legal/privacy">Privacy Policy</a>.
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
