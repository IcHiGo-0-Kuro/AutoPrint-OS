// Which customer files the shop desktop is allowed to store, open and print.
//
// Customers control both the filename and the MIME type of everything they send
// over WhatsApp. The desktop opens files with the Windows "PrintTo" verb, which
// runs executables, shortcuts and scripts, so only known document/image types
// may get through. Keep the extension list in sync with PRINTABLE_EXTENSIONS in
// electron/main.cjs.

export const PRINTABLE_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
] as const;

const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

function extensionOf(name: string) {
  const match = name.match(/\.[A-Za-z0-9]{1,8}$/);
  return match ? match[0].toLowerCase() : "";
}

function sanitizeBaseName(name: string) {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "whatsapp-document";
}

/**
 * Returns a safe document name that always ends in a printable extension, or
 * null when the file is not a type the shop can print.
 *
 * - A recognised extension is kept (the MIME type must not contradict it).
 * - A missing or unknown extension is replaced by the one the MIME type implies,
 *   so "evil.exe" labelled application/pdf becomes "evil.exe.pdf" and is opened by
 *   the PDF handler, never executed.
 * - No usable extension and no known MIME type means the file is rejected.
 */
export function resolvePrintableDocument(rawName: unknown, rawMime: unknown): string | null {
  const name = sanitizeBaseName(typeof rawName === "string" ? rawName : "");
  const mime = typeof rawMime === "string" ? rawMime.split(";")[0].trim().toLowerCase() : "";
  const mimeExtension = MIME_TO_EXTENSION[mime] || "";
  const extension = extensionOf(name);
  const extensionAllowed = (PRINTABLE_EXTENSIONS as readonly string[]).includes(extension);

  if (extensionAllowed) {
    const mimeContradicts = Boolean(mime) && mime !== "application/octet-stream" && !mimeExtension;
    return mimeContradicts ? null : name;
  }
  return mimeExtension ? name + mimeExtension : null;
}
