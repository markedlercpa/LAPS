import { notFound } from "next/navigation";
import { getDemo } from "@/lib/demos";
import { DemoArtifact } from "@/components/demo-artifact";
import { PrintControls } from "./print-controls";

export const dynamic = "force-dynamic";

/**
 * Public, printable view of a sample deliverable — the client opens this in a new
 * tab from the proposal and can Save as PDF. (Real PDF uploads come later.)
 */
export default async function PublicDemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { key } = await params;
  const { print } = await searchParams;
  const demo = await getDemo(key);
  if (!demo) notFound();

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto w-full max-w-[820px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between border-b-2 border-ink pb-4">
          <div>
            <div className="font-heading text-[22px] font-extrabold tracking-[-0.03em]">
              Edler Zain
            </div>
            <div className="micro-label mt-1">Sample deliverable</div>
          </div>
          <PrintControls auto={print === "1"} />
        </div>
        <DemoArtifact demo={demo} />
      </div>
    </div>
  );
}
