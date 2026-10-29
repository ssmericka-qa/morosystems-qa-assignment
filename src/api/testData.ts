/** Unique, traceable task text so parallel tests never touch each other's data. */
export function uniqueText(prefix: string): string {
  return `[autotest] ${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
