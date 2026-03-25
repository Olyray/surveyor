type SubmitResult = {
  success: boolean;
  statusCode: number;
  error?: string;
};

/**
 * Submit a single response to a Google Form via HTTP POST.
 */
export async function submitToGoogleForm(
  formId: string,
  answers: Record<string, string>,
  accessToken?: string,
  pageCount?: number
): Promise<SubmitResult> {
  const url = `https://docs.google.com/forms/d/e/${formId}/formResponse`;

  // Build form-urlencoded body
  const params = new URLSearchParams();

  for (const [entryId, value] of Object.entries(answers)) {
    params.append(entryId, value);
  }

  // Required hidden fields
  params.append("fvv", "1");
  // Multi-page forms need all page numbers in pageHistory,
  // plus one extra for the final submission step
  const totalPages = (pageCount && pageCount > 1) ? pageCount + 1 : 1;
  const pages = Array.from({ length: totalPages }, (_, i) => i).join(",");
  params.append("pageHistory", pages);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: params.toString(),
      redirect: "follow",
    });

    // Google Forms returns 200 on success (with a confirmation page)
    // or 302 redirect to the confirmation page
    const success = response.status === 200 || response.status === 302;

    return {
      success,
      statusCode: response.status,
      error: success ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      statusCode: 0,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
