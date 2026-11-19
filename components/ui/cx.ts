// Joins class names, skipping empty ones. The one helper the ui components share.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
