type FileLike = {
  title?: string;
  filename?: string;
  original_filename?: string;
  metadata?: {
    originalFilename?: string;
    [k: string]: unknown;
  };
};

const stripUploadPrefix = (value: string) => value.replace(/^\d{10,}[-_]+/, "");

const cleanName = (value?: string | null) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return stripUploadPrefix(trimmed);
};

export const getDocumentDisplayName = (doc?: FileLike, fallback = "Document") => {
  const name =
    cleanName(doc?.original_filename) ||
    cleanName(doc?.metadata?.originalFilename) ||
    cleanName(doc?.title) ||
    cleanName(doc?.filename);

  return name || fallback;
};

export const getAttachmentDisplayName = (file?: FileLike, fallback = "Attachment") => {
  const name =
    cleanName(file?.metadata?.originalFilename) ||
    cleanName(file?.filename) ||
    cleanName(file?.title);

  return name || fallback;
};

export const getSearchableDisplayName = (value?: string | null) => cleanName(value);
