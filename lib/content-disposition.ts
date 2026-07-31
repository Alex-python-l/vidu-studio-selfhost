function asciiFallback(fileName: string) {
  const value = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\;]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/_+/g, "_")
    .trim();
  return value || "media";
}

function rfc5987Value(fileName: string) {
  return encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function inlineContentDisposition(fileName: string) {
  const trimmed = fileName.trim() || "media";
  return (
    `inline; filename="${asciiFallback(trimmed)}"; ` +
    `filename*=UTF-8''${rfc5987Value(trimmed)}`
  );
}
