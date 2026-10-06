/** Date-only values are formatted in UTC so timezone changes never move the day. */
export function formatProjectCompletion(project: { completionDate?: string | null; completionYear?: number | null }): string | null {
 if (project.completionDate) {
  const date = new Date(project.completionDate + "T00:00:00Z");
  if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === project.completionDate) {
   return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
 }
 return project.completionYear ? String(project.completionYear) : null;
}
