import { NextRequest, NextResponse } from "next/server";
import { generatePersonas } from "@/lib/personaGenerator";
import type { FormSchema } from "@/types/form";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { schema, count } = body as {
    schema?: FormSchema;
    count?: number;
  };

  if (!schema || !schema.fields || schema.fields.length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'schema' field" },
      { status: 400 }
    );
  }

  const personaCount = Math.min(Math.max(count ?? 10, 2), 20);

  try {
    const personas = await generatePersonas(schema, personaCount);
    return NextResponse.json({ personas });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate personas";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
