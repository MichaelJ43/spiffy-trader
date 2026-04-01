import {
  constants,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  verify
} from "crypto";
import { describe, expect, it } from "vitest";
import { signKalshiRsaPssSha256 } from "../../src/kalshi/ws-auth.js";

describe("signKalshiRsaPssSha256", () => {
  it("produces a signature verifiable with the public key (PSS-SHA256)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    const pk = createPrivateKey(privateKey);
    const pubKey = createPublicKey(publicKey);

    const timestamp = "1735689600000";
    const path = "/trade-api/ws/v2";
    const message = `${timestamp}GET${path}`;
    const sigB64 = signKalshiRsaPssSha256(pk, message);
    const sig = Buffer.from(sigB64, "base64");

    const ok = verify(
      "sha256",
      Buffer.from(message, "utf8"),
      {
        key: pubKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_DIGEST
      },
      sig
    );
    expect(ok).toBe(true);
  });
});
