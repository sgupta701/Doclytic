export const getDeleteDocumentErrorMessage = (error: unknown) => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const normalized = raw.trim().toLowerCase();
  if (
    normalized.includes("not allowed") ||
    normalized.includes("permission denied") ||
    normalized.includes("access denied") ||
    normalized.includes("403")
  ) {
    return "Permission denied: you can only delete documents you uploaded.";
  }

  return "Could not delete document.";
};
