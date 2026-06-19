import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getMasterKey(): Buffer {
  const hex = process.env.HL_KEY_ENC_SECRET;
  if (!hex || hex.length !== 64) {
    throw new Error("HL_KEY_ENC_SECRET must be a 32-byte hex string (64 chars)");
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt plaintext private key -> bytea payload: iv(12) + tag(16) + ciphertext */
export function encryptPrivateKey(plaintext: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

/** Decrypt envelope bytea -> private key hex string */
export function decryptPrivateKey(payload: Buffer): string {
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getMasterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
