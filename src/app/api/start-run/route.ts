import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { parseGoogleForm } from "@/lib/formParser";
import { generatePersonas } from "@/lib/personaGenerator";
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

    if (schema.requiresSignIn && !accessToken) {
      return NextResponse.json(
        {
          error:
            "This Google Form requires sign-in before submission. Surveyor can parse it, but Google will reject anonymous background submissions with HTTP 401.",
        },
        { status: 422 }
      );
    }

    // 2. Generate personas
    const personas: Persona[] = await generatePersonas(schema, numPersonas);

    // 3. Create the run in DB
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

    // 4. Calculate scheduled times with jitter and create job records.
    //    Answers are generated lazily inside the Inngest function so this
    //    request returns in seconds rather than minutes.
    const now = Date.now();
    const totalWindowMs = window * 60 * 1000;
    const baseInterval = totalWindowMs / count;

    const jobs = Array.from({ length: count }, (_, i) => {
      const personaIndex = i % personas.length;
      const jitter = (Math.random() - 0.5) * baseInterval * 0.6;
      const scheduledFor = new Date(now + i * baseInterval + jitter);
      return {
        runId: run.id,
        personaIndex,
        answers: {} as unknown as Prisma.InputJsonValue,
        scheduledFor,
        status: "pending",
      };
    });

    await prisma.responseJob.createMany({ data: jobs });

    // 5. Retrieve created jobs (need IDs for Inngest events)
    const createdJobs = await prisma.responseJob.findMany({
      where: { runId: run.id },
      orderBy: { scheduledFor: "asc" },
    });

    // 6. Send one Inngest event per job — the function will generate the
    //    response payload and submit it at the scheduled time.
    const events = createdJobs.map((job) => ({
      name: "surveyor/submit.response" as const,
      data: { jobId: job.id },
      ts: job.scheduledFor.getTime(),
    }));

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
