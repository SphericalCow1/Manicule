export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    try {
      const message = (error as { message?: unknown }).message;
      if (message !== undefined) {
        return String(message);
      }
    } catch {
      // Fall through to the safe generic conversion.
    }
  }

  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
}
