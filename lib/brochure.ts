import { prisma } from "@/lib/prisma";

/**
 * Firm brochure / social proof shown on the client proposal page. Seeded lazily
 * with clearly-marked EXAMPLE content — replace via the agent API (PUT
 * /api/agent/brochure) before sending proposals to real prospects. While
 * `isPlaceholder` is true the client page shows a "sample content" banner so
 * example numbers are never mistaken for real claims.
 */

export type BrochureStat = { value: string; label: string };
export type BrochureCaseStudy = { service: string; title: string; result: string; detail: string };
export type BrochureTestimonial = { quote: string; author: string; role: string };
export type BrochureLinkedinPost = { excerpt: string; url: string };

export type BrochureContent = {
  headline: string;
  intro: string;
  stats: BrochureStat[];
  caseStudies: BrochureCaseStudy[];
  testimonials: BrochureTestimonial[];
  linkedinPosts: BrochureLinkedinPost[];
  isPlaceholder: boolean;
};

const PLACEHOLDER: Omit<BrochureContent, "isPlaceholder"> = {
  headline: "Trusted by growing businesses",
  intro:
    "A quick look at the results and relationships behind Edler Zain. (Example content — replace with your real stats, case studies, and testimonials.)",
  stats: [
    { value: "150+", label: "Businesses served" },
    { value: "$500M+", label: "Transactions supported" },
    { value: "98%", label: "Client retention" },
    { value: "20+ yrs", label: "Combined experience" },
  ],
  caseStudies: [
    {
      service: "Client Accounting Services",
      title: "[Example] SaaS company, monthly close cut from 20 to 5 days",
      result: "5-day close",
      detail:
        "Example case study — replace with a real CAS engagement outcome (the situation, what you did, and the measurable result).",
    },
    {
      service: "Tax Preparation & Planning",
      title: "[Example] Manufacturer saved $180k with proactive planning",
      result: "$180k saved",
      detail:
        "Example case study — replace with a real tax-planning win and the strategy behind it.",
    },
    {
      service: "Quality of Earnings",
      title: "[Example] QoE surfaced a $1.2M working-capital adjustment",
      result: "$1.2M adjustment",
      detail:
        "Example case study — replace with a real QoE engagement and the finding that changed the deal.",
    },
    {
      service: "Fractional CFO / Advisory",
      title: "[Example] Extended runway 8 months ahead of a raise",
      result: "+8 months runway",
      detail:
        "Example case study — replace with a real advisory outcome and the decisions that drove it.",
    },
  ],
  testimonials: [
    {
      quote:
        "[Example testimonial] Edler Zain feels like part of our team — replace this with a real client quote.",
      author: "Sample Client",
      role: "CEO, Example Co",
    },
    {
      quote:
        "[Example testimonial] The clearest financial picture we've ever had — replace with a real quote.",
      author: "Sample Client",
      role: "Founder, Example Co",
    },
  ],
  linkedinPosts: [
    {
      excerpt:
        "[Example] A featured LinkedIn post excerpt from Mark goes here — replace with a real post and link.",
      url: "https://www.linkedin.com/in/markedler/",
    },
  ],
};

let seeded = false;

export async function ensureBrochureSeeded() {
  if (seeded) return;
  const existing = await prisma.brochure.findUnique({ where: { id: "default" } });
  if (!existing) {
    await prisma.brochure.create({ data: { id: "default", ...PLACEHOLDER, isPlaceholder: true } });
  }
  seeded = true;
}

export async function getBrochure(): Promise<BrochureContent> {
  await ensureBrochureSeeded();
  const b = await prisma.brochure.findUnique({ where: { id: "default" } });
  if (!b) return { ...PLACEHOLDER, isPlaceholder: true };
  return {
    headline: b.headline ?? PLACEHOLDER.headline,
    intro: b.intro ?? PLACEHOLDER.intro,
    stats: (b.stats as unknown as BrochureStat[]) ?? [],
    caseStudies: (b.caseStudies as unknown as BrochureCaseStudy[]) ?? [],
    testimonials: (b.testimonials as unknown as BrochureTestimonial[]) ?? [],
    linkedinPosts: (b.linkedinPosts as unknown as BrochureLinkedinPost[]) ?? [],
    isPlaceholder: b.isPlaceholder,
  };
}
