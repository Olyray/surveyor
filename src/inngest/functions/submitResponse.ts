import { inngest } from "@/inngest/client";
import { submitToGoogleForm } from "@/lib/googleFormsSubmitter";
import { generateResponseForPersona, buildEmailForJob } from "@/lib/responseGenerator";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { FormSchema } from "@/types/form";
import type { Persona } from "@/types/persona";

/**
 * Inngest function that generates and submits a single response to a Google Form.
 * Response generation happens here (not at run-start time) so the HTTP handler
 * returns in seconds regardless of how many total responses are scheduled.
 */
export const submitResponse = inngest.createFunction(
  {
    id: "submit-response",
    retries: 3,
    triggers: [{ event: "surveyor/submit.response" }],
  },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };

    // 1. Load everything needed from the DB in one round-trip
    const { formSchema, persona, accessToken } = await step.run("load-job-data", async () => {
      const job = await prisma.responseJob.findUniqueOrThrow({
        where: { id: jobId },
        select: { personaIndex: true, runId: true },
      });
      const run = await prisma.submissionRun.findUniqueOrThrow({
        where: { id: job.runId },
        select: { formSchema: true, personas: true, googleAccessToken: true },
      });
      const personas = run.personas as unknown as Persona[];
      return {
        formSchema: run.formSchema as unknown as FormSchema,
        persona: personas[job.personaIndex],
        accessToken: run.googleAccessToken ?? undefined,
      };
    });

    // 2. Generate the response payload for this persona
    const answers = await step.run("generate-response", async () => {
      return generateResponseForPersona(formSchema, persona, {
        uniqueEmail: buildEmailForJob(persona, jobId),
      });
    });

    // 3. Persist the generated answers so they're visible in the dashboard
    await step.run("save-answers", async () => {
      await prisma.responseJob.update({
        where: { id: jobId },
        data: { answers: answers as unknown as Prisma.InputJsonValue },
      });
    });

    // 4. Submit to Google Forms
    const result = await step.run("submit-to-google-form", async () => {
      return submitToGoogleForm(formSchema.formId, answers, accessToken, formSchema.pageCount);
    });

    // 5. Mark the job done
    await step.run("update-job-status", async () => {
      if (result.success) {
        await prisma.responseJob.update({
          where: { id: jobId },
          data: { status: "submitted", submittedAt: new Date() },
        });
      } else {
        await prisma.responseJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
            errorMessage: result.error ?? `HTTP ${result.statusCode}`,
          },
        });
      }
    });

    // 6. Check if this was the last pending job in the run
    await step.run("check-run-completion", async () => {
      const job = await prisma.responseJob.findUnique({
        where: { id: jobId },
        select: { runId: true },
      });
      if (!job) return;

      const pendingCount = await prisma.responseJob.count({
        where: { runId: job.runId, status: "pending" },
      });

      if (pendingCount === 0) {
        await prisma.submissionRun.update({
          where: { id: job.runId },
          data: { status: "completed", completedAt: new Date() },
        });
      }
    });

    return { success: result.success, statusCode: result.statusCode };
  }
);
