import { notFound } from "next/navigation";
import { getDemo } from "@/lib/demos";
import { DemoArtifact } from "@/components/demo-artifact";

export const dynamic = "force-dynamic";

/** Internal preview of a sample deliverable, as the client will see it. */
export default async function DemoPreviewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const demo = await getDemo(key);
  if (!demo) notFound();

  return (
    <div className="mx-auto max-w-[860px]">
      <div className="micro-label mb-4">Demo preview — as the client sees it</div>
      <DemoArtifact demo={demo} />
    </div>
  );
}
