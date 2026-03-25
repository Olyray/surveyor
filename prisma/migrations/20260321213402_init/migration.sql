-- CreateTable
CREATE TABLE "SubmissionRun" (
    "id" TEXT NOT NULL,
    "formUrl" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "formSchema" JSONB NOT NULL,
    "personas" JSONB NOT NULL,
    "totalResponses" INTEGER NOT NULL,
    "windowMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "googleAccessToken" TEXT,

    CONSTRAINT "SubmissionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseJob" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "personaIndex" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "ResponseJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionRun_status_idx" ON "SubmissionRun"("status");

-- CreateIndex
CREATE INDEX "ResponseJob_runId_status_idx" ON "ResponseJob"("runId", "status");

-- AddForeignKey
ALTER TABLE "ResponseJob" ADD CONSTRAINT "ResponseJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SubmissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
