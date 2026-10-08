import { randomBytes, scrypt, timingSafeEqual, createHmac } from "node:crypto";

export class HashBusyError extends Error {}
let activeJobs = 0;
const prefix = "scrypt$v1$131072$8$1$";
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (activeJobs >= 2) throw new HashBusyError();
  activeJobs++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
    });
  } finally { activeJobs--; }
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${prefix}${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash?: string | null, salt?: string | null): Promise<{ valid: boolean; upgradedHash?: string }> {
  const match = /^scrypt\$v1\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash || "");
  if (match) {
    const actual = await derive(password, Buffer.from(match[1], "hex"));
    return { valid: timingSafeEqual(actual, Buffer.from(match[2], "hex")) };
  }
  // Legacy and unknown credentials both pay the current password cost.
  const upgradedHash = await hashPassword(password);
  const valid = Boolean(hash && /^[a-f0-9]{64}$/.test(hash) && salt && timingSafeEqual(createHmac("sha256", salt).update(password).digest(), Buffer.from(hash, "hex")));
  return valid ? { valid, upgradedHash } : { valid: false };
}
