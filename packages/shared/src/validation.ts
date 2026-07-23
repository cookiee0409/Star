export function sanitizeNickname(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
}

export function isValidNickname(raw: string): boolean {
  const nickname = sanitizeNickname(raw);
  return nickname.length >= 2 && nickname.length <= 12;
}

