import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { parseGoogleForm } from "@/lib/formParser";
import { generatePersonas } from "@/lib/personaGenerator";
import { generateAllResponses } from "@/lib/responseGenerator";
import type { Persona } from "@/types/persona";
import type { FormSchema } from "@/types/form";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { formUrl, totalResponses, windowMinutes, personaCount, accessToken } =
    body as {
      formUrl?: string;
      totalResponses?: number;
      windowMinutes?: number;
      personaCount?: number;
      accessToken?: string;
    };

  if (!formUrl || typeof formUrl !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'formUrl'" },
      { status: 400 }
    );
  }

  if (!formUrl.includes("docs.google.com/forms")) {
    return NextResponse.json(
      { error: "URL must be a Google Forms URL" },
      { status: 400 }
    );
  }

  const count = Math.min(Math.max(totalResponses ?? 10, 1), 500);
  const window = Math.min(Math.max(windowMinutes ?? 60, 1), 1440);
  const numPersonas = Math.min(Math.max(personaCount ?? 10, 2), 20);

  try {
    // 1. Parse the form
    const schema: FormSchema = await parseGoogleForm(formUrl);

    // 2. Generate personas
    const personas: Persona[] = await generatePersonas(schema, numPersonas);

    // 3. Generate all response payloads
    const responses = await generateAllResponses(schema, personas, count);

    // 4. Create the run in DB
    const run = await prisma.submissionRun.create({
      data: {
        formUrl,
        formId: schema.formId,
        formSchema: schema as unknown as Prisma.InputJsonValue,
        personas: personas as unknown as Prisma.InputJsonValue,
        totalResponses: count,
        windowMinutes: window,
        status: "running",
        googleAccessToken: accessToken,
      },
    });

    // 5. Calculate scheduled times with jitter
    const now = Date.now();
    const totalWindowMs = window * 60 * 1000;
    const baseInterval = totalWindowMs / count;

    const jobs = responses.map((response, i) => {
      const jitter = (Math.random() - 0.5) * baseInterval * 0.6;
      const scheduledFor = new Date(now + i * baseInterval + jitter);
      return {
        runId: run.id,
        personaIndex: response.personaIndex,
        answers: response.answers as unknown as Prisma.InputJsonValue,
        scheduledFor,
        status: "pending",
      };
    });

    // 6. Persist all jobs
    await prisma.responseJob.createMany({ data: jobs });

    // 7. Retrieve created jobs (need IDs for Inngest events)
    const createdJobs = await prisma.responseJob.findMany({
      where: { runId: run.id },
      orderBy: { scheduledFor: "asc" },
    });

    // 8. Send Inngest events for each job
    const events = createdJobs.map((job) => ({
      name: "surveyor/submit.response" as const,
      data: {
        jobId: job.id,
        formId: schema.formId,
        answers: job.answers as Record<string, string>,
        accessToken,
        pageCount: schema.pageCount,
      },
      ts: job.scheduledFor.getTime(),
    }));

    // Inngest supports sending events in batches
    await inngest.send(events);

    return NextResponse.json({
      runId: run.id,
      totalJobs: createdJobs.length,
      firstScheduledAt: createdJobs[0]?.scheduledFor,
      lastScheduledAt: createdJobs[createdJobs.length - 1]?.scheduledFor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
