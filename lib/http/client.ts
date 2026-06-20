export async function readJsonResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 140);
    throw new Error(`Request failed (${response.status}): ${preview || "non-JSON response"}`);
  }
}
