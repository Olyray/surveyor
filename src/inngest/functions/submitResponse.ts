import { inngest } from "@/inngest/client";
import { submitToGoogleForm } from "@/lib/googleFormsSubmitter";
import { prisma } from "@/lib/prisma";

/**
 * Inngest function that submits a single response to a Google Form.
 * Each invocation handles one ResponseJob — scheduled with a delay for traffic simulation.
 */
export const submitResponse = inngest.createFunction(
  {
    id: "submit-response",
    retries: 3,
    triggers: [{ event: "surveyor/submit.response" }],
  },
  async ({ event, step }) => {
    const { jobId, formId, answers, accessToken, pageCount } = event.data as {
      jobId: string;
      formId: string;
      answers: Record<string, string>;
      accessToken?: string;
      pageCount?: number;
    };

    const result = await step.run("submit-to-google-form", async () => {
      return submitToGoogleForm(formId, answers, accessToken, pageCount);
    });

    await step.run("update-job-status", async () => {
      if (result.success) {
        await prisma.responseJob.update({
          where: { id: jobId },
          data: {
            status: "submitted",
            submittedAt: new Date(),
          },
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

    // Check if all jobs in this run are done
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
          data: {
            status: "completed",
            completedAt: new Date(),
          },
        });
      }
    });

    return { success: result.success, statusCode: result.statusCode };
  }
);
