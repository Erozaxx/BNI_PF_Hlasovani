import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encrypt a raw event token using AES-256-GCM.
 *
 * Storage format: iv:ciphertext:authTag (hex-encoded, colon-separated)
 * - IV: 12 bytes, randomly generated per call (never reused)
 * - Auth tag: 16 bytes, GCM authenticated encryption tag
 *
 * @param rawToken  Plain-text token string
 * @param hexKey    32-byte AES-256 key as hex string (64 hex chars)
 * @returns         Encoded string: "<ivHex>:<ciphertextHex>:<authTagHex>"
 */
export function encryptToken(rawToken: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  const iv = randomBytes(12); // 12-byte random IV for AES-GCM

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(rawToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16-byte authentication tag

  return [iv, encrypted, tag].map((b) => b.toString("hex")).join(":");
}

/**
 * Decrypt a stored token produced by encryptToken.
 *
 * @param stored    Encoded string: "<ivHex>:<ciphertextHex>:<authTagHex>"
 * @param hexKey    32-byte AES-256 key as hex string (64 hex chars)
 * @returns         The original plain-text token string
 * @throws          Error if stored format is invalid or auth tag verification fails
 */
export function decryptToken(stored: string, hexKey: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error(
      `decryptToken: invalid stored format — expected 3 colon-separated parts, got ${parts.length}`
    );
  }

  const [ivHex, encHex, tagHex] = parts;
  const key = Buffer.from(hexKey, "hex");
  const iv = Buffer.from(ivHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
