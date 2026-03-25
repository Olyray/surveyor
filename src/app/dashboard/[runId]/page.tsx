"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type Job = {
  id: string;
  personaIndex: number;
  status: string;
  scheduledFor: string;
  submittedAt: string | null;
  errorMessage: string | null;
};

type RunData = {
  run: {
    id: string;
    formUrl: string;
    status: string;
    totalResponses: number;
    windowMinutes: number;
    createdAt: string;
    completedAt: string | null;
  };
  progress: {
    submitted: number;
    failed: number;
    pending: number;
    total: number;
  };
  jobs: Job[];
};

export default function DashboardPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [data, setData] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch run");
    }
  }, [runId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="text-gray-500">Loading...</div>
      </main>
    );
  }

  const { run, progress, jobs } = data;
  const progressPercent =
    progress.total > 0
      ? Math.round(((progress.submitted + progress.failed) / progress.total) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Run Dashboard</h1>
          <p className="text-sm text-gray-500">
            {run.formUrl}
          </p>
        </div>
        <a
          href="/"
          className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          New Run
        </a>
      </div>

      {/* Status and progress */}
      <section className="mb-6 rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              run.status === "completed"
                ? "bg-green-100 text-green-700"
                : run.status === "failed"
                  ? "bg-red-100 text-red-700"
                  : run.status === "running"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-700"
            }`}
          >
            {run.status}
          </span>
          <span className="text-sm text-gray-500">
            {progressPercent}% complete
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-3 overflow-hidden rounded-full bg-gray-200">
          <div className="flex h-full">
            <div
              className="bg-green-500 transition-all duration-500"
              style={{
                width: `${(progress.submitted / progress.total) * 100}%`,
              }}
            />
            <div
              className="bg-red-500 transition-all duration-500"
              style={{
                width: `${(progress.failed / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <div className="text-2xl font-bold text-green-600">
              {progress.submitted}
            </div>
            <div className="text-gray-500">Submitted</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">
              {progress.pending}
            </div>
            <div className="text-gray-500">Pending</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">
              {progress.failed}
            </div>
            <div className="text-gray-500">Failed</div>
          </div>
        </div>
      </section>

      {/* Run info */}
      <section className="mb-6 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Run Details</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-500">Total responses</div>
          <div>{run.totalResponses}</div>
          <div className="text-gray-500">Time window</div>
          <div>{run.windowMinutes} minutes</div>
          <div className="text-gray-500">Started</div>
          <div>{new Date(run.createdAt).toLocaleString()}</div>
          {run.completedAt && (
            <>
              <div className="text-gray-500">Completed</div>
              <div>{new Date(run.completedAt).toLocaleString()}</div>
            </>
          )}
        </div>
      </section>

      {/* Jobs table */}
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Response Jobs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Persona</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Scheduled</th>
                <th className="pb-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => (
                <tr key={job.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-gray-400">{i + 1}</td>
                  <td className="py-2 pr-4">Persona {job.personaIndex + 1}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        job.status === "submitted"
                          ? "bg-green-100 text-green-700"
                          : job.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {job.status}
                    </span>
                    {job.errorMessage && (
                      <span className="ml-2 text-xs text-red-500">
                        {job.errorMessage}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {new Date(job.scheduledFor).toLocaleTimeString()}
                  </td>
                  <td className="py-2 text-gray-500">
                    {job.submittedAt
                      ? new Date(job.submittedAt).toLocaleTimeString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
