export function formatCopyright(
  copyright: string | undefined,
  year = new Date().getFullYear().toString()
): string | undefined {
  if (!copyright) return copyright;
  // Replace only the latest/trailing year so date ranges (e.g. 2020-2024) preserve their start year
  return copyright.replace(/\b20\d{2}\b(?=[^0-9]*$)/, year);
}
