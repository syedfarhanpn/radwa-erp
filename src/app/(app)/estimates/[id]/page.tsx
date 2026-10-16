"use client";

/** BOQ and estimate workspace for one estimate revision. */

import { useParams } from "next/navigation";

import { BoqWorkspace } from "@/components/workflow/BoqWorkspace";

export default function EstimateWorkspacePage() {
  const params = useParams<{ id: string }>();
  return <BoqWorkspace estimateId={params.id} />;
}
