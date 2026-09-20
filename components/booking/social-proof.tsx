import type { BrochureContent } from "@/lib/brochure";

/** Compact social-proof panel shown in the booking flow (event page +
 * confirmation) so prospects see our results before the call. Presentational —
 * pass a brochure loaded server-side. */
export function SocialProof({ brochure }: { brochure: BrochureContent }) {
  const stats = brochure.stats.slice(0, 4);
  const cases = brochure.caseStudies.slice(0, 2);
  const testimonial = brochure.testimonials[0];

  return (
    <div className="border-t-2 border-divider pt-6">
      {brochure.isPlaceholder && (
        <p className="mb-3 text-[11px] text-muted">Sample content — replace with real firm proof before going live.</p>
      )}
      <div className="micro-label">Why teams work with {brochure.headline.includes("Edler") ? "us" : "Edler Zain"}</div>

      {stats.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-3 max-sm:grid-cols-2">
          {stats.map((s) => (
            <div key={s.label} className="border-l-2 border-accent pl-3">
              <div className="font-heading text-[22px] font-extrabold leading-none">{s.value}</div>
              <div className="mt-1 text-[11px] text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {cases.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          {cases.map((c) => (
            <div key={c.title} className="border-t border-divider pt-3">
              <div className="micro-label text-neutral-500">{c.service}</div>
              <div className="mt-1 font-heading text-[14px] font-extrabold">{c.result}</div>
              <p className="mb-0 mt-1 text-[12px] text-muted">{c.title}</p>
            </div>
          ))}
        </div>
      )}

      {testimonial && (
        <blockquote className="mt-5 border-l-2 border-ink pl-4 text-[13px] italic text-neutral-700">
          “{testimonial.quote}”
          <footer className="mt-1 text-[11px] not-italic text-muted">
            — {testimonial.author}, {testimonial.role}
          </footer>
        </blockquote>
      )}
    </div>
  );
}
