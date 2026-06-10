import { FormSchema, Field, FieldType, FIELD_TYPE_MAP } from "@/types/form";

/**
 * Extract the form ID from a Google Forms URL.
 * Supports both /forms/d/e/{id} (public) and /forms/d/{id} (edit) patterns.
 */
export function extractFormId(url: string): string {
  const publicMatch = url.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (publicMatch) return publicMatch[1];

  const editMatch = url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  if (editMatch) return editMatch[1];

  throw new Error(
    "Invalid Google Forms URL. Expected format: https://docs.google.com/forms/d/e/{formId}/viewform"
  );
}

/**
 * Normalise any Google Forms URL to the public viewform URL.
 */
function toViewformUrl(url: string): string {
  const formId = extractFormId(url);
  // If original URL has /e/, use as-is with /viewform
  if (url.includes("/forms/d/e/")) {
    return `https://docs.google.com/forms/d/e/${formId}/viewform`;
  }
  // Otherwise it's an edit URL — still try to fetch, Google usually redirects
  return `https://docs.google.com/forms/d/${formId}/viewform`;
}

/**
 * Fetch and parse a Google Form's schema by extracting FB_PUBLIC_LOAD_DATA_ from the HTML.
 */
export async function parseGoogleForm(url: string): Promise<FormSchema> {
  const viewformUrl = toViewformUrl(url);

  const response = await fetch(viewformUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch form: HTTP ${response.status}. Is the form public?`
    );
  }

  const html = await response.text();
  return parseFormHtml(html, extractFormId(url));
}

/**
 * Extract the published form ID (the /e/{id} variant) from the form HTML's
 * action attribute. This is the ID required for submission and is always
 * present in the rendered HTML regardless of which URL variant was used.
 */
function extractPublishedFormId(html: string, fallback: string): string {
  const actionMatch = html.match(
    /action="https:\/\/docs\.google\.com\/forms\/d\/e\/([a-zA-Z0-9_-]+)\/formResponse"/
  );
  return actionMatch ? actionMatch[1] : fallback;
}

/**
 * Parse the FB_PUBLIC_LOAD_DATA_ variable from Google Form HTML.
 */
function parseFormHtml(html: string, formId: string): FormSchema {
  // Use the published ID from the form's action URL, which is always correct
  // for submission. The URL-derived ID may be an edit ID when the user
  // provides a /forms/d/{editId}/... style URL.
  const submissionFormId = extractPublishedFormId(html, formId);

  const dataMatch = html.match(
    /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/
  );

  if (!dataMatch) {
    throw new Error(
      "Could not find FB_PUBLIC_LOAD_DATA_ in the form HTML. " +
        "The form may be private, require sign-in, or Google may have changed the format."
    );
  }

  let rawData: unknown;
  try {
    rawData = JSON.parse(dataMatch[1]);
  } catch {
    throw new Error(
      "Failed to parse FB_PUBLIC_LOAD_DATA_ JSON. Google may have changed the format."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = rawData as any[];

  const title: string = data[1]?.[8] ?? data[3] ?? "Untitled Form";
  const description: string = data[1]?.[0] ?? "";

  // Fields live at data[1][1] — each element is a field
  const rawFields = data[1]?.[1];
  if (!Array.isArray(rawFields) || rawFields.length === 0) {
    throw new Error(
      "No fields found in the form. The form may be empty or the format has changed."
    );
  }

  const fields: Field[] = [];

  if (hasCollectedEmailField(data)) {
    fields.push({
      entryId: "emailAddress",
      label: "Email",
      type: "email",
      required: true,
      options: [],
    });
  }

  for (const rawField of rawFields) {
    const parsed = parseField(rawField);
    if (Array.isArray(parsed)) {
      fields.push(...parsed);
    } else if (parsed) {
      fields.push(parsed);
    }
  }

  if (fields.length === 0) {
    throw new Error("No supported fields found in the form.");
  }

  // Count section headers (type code 8) to determine number of pages
  const pageCount = rawFields.filter(
    (f: any[]) => Array.isArray(f) && f[3] === 8
  ).length || 1;

  return {
    formId: submissionFormId,
    title,
    description,
    fields,
    pageCount,
    requiresSignIn: requiresSignInToContinue(html),
  };
}

/**
 * Google Forms stores the built-in "Collect email addresses" field in form
 * settings instead of the regular question array. Submitted values use the
 * special form key "emailAddress".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasCollectedEmailField(data: any[]): boolean {
  const emailSettings = data[1]?.[10];
  return Array.isArray(emailSettings) && emailSettings[0] === 1;
}

function requiresSignInToContinue(html: string): boolean {
  return html.includes('data-sign-in-to-continue="true"');
}

/**
 * Parse a single field from the raw FB_PUBLIC_LOAD_DATA_ array structure.
 * Returns Field[] for grid questions (one Field per row), Field for regular questions, null to skip.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseField(raw: any[]): Field | Field[] | null {
  if (!Array.isArray(raw)) return null;

  const typeCode: number = raw[3];

  // Multiple choice grid (type 7): each row is a separate sub-field with its own entryId
  if (typeCode === 7) {
    return parseGridField(raw);
  }

  const label: string = raw[1] ?? "";
  const fieldData = raw[4];

  if (!Array.isArray(fieldData) || fieldData.length === 0) return null;

  const fieldInfo = fieldData[0];
  if (!Array.isArray(fieldInfo)) return null;

  const entryId = `entry.${fieldInfo[0]}`;
  const type: FieldType = FIELD_TYPE_MAP[typeCode] ?? "short_text";
  const required: boolean = fieldInfo[2] === 1;

  // Extract options for choice-based fields
  const options: string[] = [];
  let hasOther = false;
  if (
    Array.isArray(fieldInfo[1]) &&
    ["multiple_choice", "checkbox", "dropdown"].includes(type)
  ) {
    for (const opt of fieldInfo[1]) {
      if (Array.isArray(opt) && typeof opt[0] === "string") {
        if (opt[0] === "") {
          // Empty string in options array is how Google Forms encodes the "Other" option
          hasOther = true;
        } else {
          options.push(opt[0]);
        }
      }
    }
    // fieldInfo[5] === 1 is an alternative indicator that "Other" is enabled
    if (fieldInfo[5] === 1) {
      hasOther = true;
    }
  }

  // Extract scale bounds for linear_scale
  let scaleMin: number | undefined;
  let scaleMax: number | undefined;
  if (type === "linear_scale" && Array.isArray(fieldInfo[1])) {
    const scaleOptions = fieldInfo[1];
    if (scaleOptions.length > 0) {
      scaleMin = Number(scaleOptions[0]?.[0]) || 1;
      scaleMax = Number(scaleOptions[scaleOptions.length - 1]?.[0]) || 5;
    }
  }

  // Store raw conditional rules for future use (Phase 6)
  const conditionalRules = raw[3] ?? undefined;

  return {
    entryId,
    label,
    type,
    required,
    options,
    hasOther: hasOther || undefined,
    scaleMin,
    scaleMax,
    conditionalRules: conditionalRules || undefined,
  };
}

/**
 * Parse a multiple choice grid field (type code 7).
 * Each row in the grid becomes its own Field with a unique entryId and
 * the shared column options as its choices.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGridField(raw: any[]): Field[] {
  const gridTitle: string = raw[1] ?? "";
  const fieldData = raw[4];
  if (!Array.isArray(fieldData)) return [];

  const fields: Field[] = [];

  for (let i = 0; i < fieldData.length; i++) {
    const subField = fieldData[i];
    if (!Array.isArray(subField)) continue;

    const entryId = `entry.${subField[0]}`;
    const required: boolean = subField[2] === 1;

    // Row label is stored at subField[3] — may be a string or [string, ...]
    let rowLabel = `Row ${i + 1}`;
    if (typeof subField[3] === "string" && subField[3]) {
      rowLabel = subField[3];
    } else if (Array.isArray(subField[3]) && typeof subField[3][0] === "string") {
      rowLabel = subField[3][0];
    }

    // Column options shared across all rows
    const options: string[] = [];
    if (Array.isArray(subField[1])) {
      for (const opt of subField[1]) {
        if (Array.isArray(opt) && typeof opt[0] === "string") {
          options.push(opt[0]);
        }
      }
    }

    fields.push({
      entryId,
      label: gridTitle ? `${gridTitle} — ${rowLabel}` : rowLabel,
      type: "grid",
      required,
      options,
    });
  }

  return fields;
}
