export function readTruthyFlag(
  input: string | undefined,
  defaultValue: boolean
): boolean {
  if (input == null) return defaultValue;
  const value = input.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on")
    return true;
  if (value === "0" || value === "false" || value === "no" || value === "off")
    return false;
  return defaultValue;
}

export function readPositiveInt(
  input: string | undefined,
  defaultValue: number
): number {
  if (!input) return defaultValue;
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}
