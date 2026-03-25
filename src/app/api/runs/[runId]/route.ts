import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  const run = await prisma.submissionRun.findUnique({
    where: { id: runId },
    include: {
      responseJobs: {
        orderBy: { scheduledFor: "asc" },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const submitted = run.responseJobs.filter(
    (j) => j.status === "submitted"
  ).length;
  const failed = run.responseJobs.filter((j) => j.status === "failed").length;
  const pending = run.responseJobs.filter((j) => j.status === "pending").length;

  return NextResponse.json({
    run: {
      id: run.id,
      formUrl: run.formUrl,
      status: run.status,
      totalResponses: run.totalResponses,
      windowMinutes: run.windowMinutes,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    },
    progress: { submitted, failed, pending, total: run.totalResponses },
    jobs: run.responseJobs.map((j) => ({
      id: j.id,
      personaIndex: j.personaIndex,
      status: j.status,
      scheduledFor: j.scheduledFor,
      submittedAt: j.submittedAt,
      errorMessage: j.errorMessage,
    })),
  });
}
