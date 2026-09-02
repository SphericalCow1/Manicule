export const APP_ERROR_CODES = [
  "invalid_path",
  "not_found",
  "conflict",
  "already_exists",
  "folder_not_empty",
  "io",
  "state_lock",
  "internal",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type ErrorPresentation = {
  code: AppErrorCode | null;
  message: string;
  detail: string | null;
};

const fallbackMessages: Record<AppErrorCode, string> = {
  invalid_path: "Choose a valid path inside the current workspace and try again.",
  not_found: "The requested item no longer exists. Refresh the workspace and try again.",
  conflict: "The operation conflicts with the current workspace state. Refresh and try again.",
  already_exists: "An item with this name already exists. Choose another name.",
  folder_not_empty: "The folder is not empty. Move or delete its contents first.",
  io: "Manicule could not access the file. Check its permissions and try again.",
  state_lock: "Manicule could not access its current state. Restart the app and try again.",
  internal: "Manicule could not complete the operation. Reopen the workspace and try again.",
};

function appErrorCode(value: unknown): AppErrorCode | null {
  return typeof value === "string" && APP_ERROR_CODES.includes(value as AppErrorCode)
    ? (value as AppErrorCode)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function toErrorPresentation(error: unknown): ErrorPresentation {
  if (error instanceof Error) {
    return { code: null, message: error.message, detail: null };
  }

  if (typeof error === "string") {
    return { code: null, message: error, detail: null };
  }

  if (error && typeof error === "object") {
    try {
      const candidate = error as { code?: unknown; message?: unknown; detail?: unknown };
      const code = appErrorCode(candidate.code);
      const message = nonEmptyString(candidate.message);
      const detail = nonEmptyString(candidate.detail);

      if (message || code) {
        return {
          code,
          message: message ?? fallbackMessages[code!],
          detail,
        };
      }
    } catch {
      // Fall through to the safe generic conversion.
    }
  }

  try {
    return { code: null, message: String(error), detail: null };
  } catch {
    return { code: null, message: "Unknown error", detail: null };
  }
}

export function toErrorMessage(error: unknown): string {
  return toErrorPresentation(error).message;
}

export function toErrorDetail(error: unknown): string | null {
  return toErrorPresentation(error).detail;
}
