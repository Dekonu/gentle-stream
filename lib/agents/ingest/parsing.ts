export function stripCodeFences(text: string): string {
  return text
    .split("```json")
    .join("")
    .split("```JSON")
    .join("")
    .split("```")
    .join("")
    .trim();
}

export function parseJsonPayload(text: string): unknown {
  const cleaned = stripCodeFences(text);
  if (!cleaned) return null;
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");

  if (objStart !== -1 && objEnd !== -1) {
    try {
      return JSON.parse(cleaned.slice(objStart, objEnd + 1));
    } catch {
      // keep trying
    }
  }
  if (arrStart !== -1 && arrEnd !== -1) {
    try {
      return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    } catch {
      // keep trying
    }
  }
  return null;
}
