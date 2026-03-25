export type RunStatus = "pending" | "running" | "completed" | "failed";
export type JobStatus = "pending" | "submitted" | "failed";

export type SubmissionRunConfig = {
  formUrl: string;
  totalResponses: number;
  windowMinutes: number;
  googleAccessToken?: string;
};
