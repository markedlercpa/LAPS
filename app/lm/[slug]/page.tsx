import { notFound } from "next/navigation";
import { getPublishedMagnetBySlug } from "@/lib/leadmagnets/magnets";
import { isDownloadKind } from "@/lib/leadmagnets/taxonomy";
import { MagnetCapture } from "@/components/leadmagnets/magnet-capture";

export const dynamic = "force-dynamic";

/** Public lead-magnet landing page. `?src=` tags the traffic source and
 * `?c=<contentItemId>` attributes it to the content that drove the click. */
export default async function LeadMagnetPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ src?: string; c?: string; utm_source?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const magnet = await getPublishedMagnetBySlug(slug);
  if (!magnet) notFound();

  const source = sp.src ?? sp.utm_source ?? null;
  const contentItemId = sp.c ?? null;
  const isDownload = isDownloadKind(magnet.kind);
  const ctaLabel = magnet.ctaLabel || (isDownload ? "Get the download" : "Get access");

  return (
    <main className="mx-auto max-w-2xl px-5 py-14">
      <div className="mb-8">
        <p className="micro-label mb-2">Free resource</p>
        <h1 className="mb-2">{magnet.headline || magnet.title}</h1>
        {magnet.subhead && <p className="text-[16px] text-muted">{magnet.subhead}</p>}
      </div>

      {magnet.body && (
        <div className="mb-8 whitespace-pre-wrap text-[15px] leading-relaxed">{magnet.body}</div>
      )}

      <MagnetCapture
        slug={magnet.slug}
        kind={magnet.kind}
        ctaLabel={ctaLabel}
        source={source}
        contentItemId={contentItemId}
        isDownload={isDownload}
      />
    </main>
  );
}
