import { NextRequest, NextResponse } from "next/server";
import { parseGoogleForm } from "@/lib/formParser";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { url } = body as { url?: string };

  if (!url || typeof url !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'url' field" },
      { status: 400 }
    );
  }

  // Basic validation: must look like a Google Forms URL
  if (!url.includes("docs.google.com/forms")) {
    return NextResponse.json(
      { error: "URL must be a Google Forms URL" },
      { status: 400 }
    );
  }

  try {
    const schema = await parseGoogleForm(url);
    return NextResponse.json(schema);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse form";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
