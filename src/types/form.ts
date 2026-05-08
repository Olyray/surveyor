export type FieldType =
  | "short_text"
  | "long_text"
  | "multiple_choice"
  | "checkbox"
  | "dropdown"
  | "linear_scale"
  | "date"
  | "time"
  | "grid";

export type Field = {
  entryId: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  hasOther?: boolean;
  scaleMin?: number;
  scaleMax?: number;
  conditionalRules?: unknown;
};

export type FormSchema = {
  formId: string;
  title: string;
  description: string;
  fields: Field[];
  pageCount: number;
};

/**
 * Map from Google Forms internal field type IDs to our FieldType.
 * These are the numeric type codes found in FB_PUBLIC_LOAD_DATA_.
 */
export const FIELD_TYPE_MAP: Record<number, FieldType> = {
  0: "short_text",
  1: "long_text",
  2: "multiple_choice",
  3: "dropdown",
  4: "checkbox",
  5: "linear_scale",
  // type 7 (multiple choice grid) is handled specially in parseField
  9: "date",
  10: "time",
};
