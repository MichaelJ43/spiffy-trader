import {
  createPrivateKey,
  sign,
  constants as cryptoConstants,
  type KeyObject
} from "crypto";
import { readFileSync } from "fs";
import {
  KALSHI_ACCESS_KEY_ID,
  KALSHI_PRIVATE_KEY_PATH,
  KALSHI_PRIVATE_KEY_PEM,
  KALSHI_WS_SIGN_PATH,
  kalshiPrivateKeyConfigured,
  kalshiWsAuthConfigured
} from "../server/config.js";

let cachedPrivateKey: KeyObject | null = null;
let cachedLoadFailed = false;

function loadPrivateKeyPem(): string | null {
  if (KALSHI_PRIVATE_KEY_PATH) {
    try {
      return readFileSync(KALSHI_PRIVATE_KEY_PATH, "utf8");
    } catch (e: any) {
      console.error("Kalshi WS: could not read KALSHI_PRIVATE_KEY_PATH:", e?.message || e);
      return null;
    }
  }
  if (KALSHI_PRIVATE_KEY_PEM) {
    return KALSHI_PRIVATE_KEY_PEM.replace(/\\n/g, "\n");
  }
  return null;
}

export function getKalshiPrivateKey(): KeyObject | null {
  if (!kalshiPrivateKeyConfigured()) return null;
  if (cachedLoadFailed) return null;
  if (cachedPrivateKey) return cachedPrivateKey;
  const pem = loadPrivateKeyPem();
  if (!pem) {
    cachedLoadFailed = true;
    return null;
  }
  try {
    cachedPrivateKey = createPrivateKey(pem);
    return cachedPrivateKey;
  } catch (e: any) {
    console.error("Kalshi WS: invalid private key PEM:", e?.message || e);
    cachedLoadFailed = true;
    return null;
  }
}

/** RSA-PSS SHA-256 signature (Base64), matching Kalshi REST/WS docs. */
export function signKalshiRsaPssSha256(privateKey: KeyObject, message: string): string {
  return sign("sha256", Buffer.from(message, "utf8"), {
    key: privateKey,
    padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
    saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST
  }).toString("base64");
}

/**
 * Headers for the WebSocket handshake (and same scheme as authenticated REST).
 */
export function createKalshiWsHandshakeHeaders(): Record<string, string> | null {
  if (!kalshiWsAuthConfigured()) return null;
  const privateKey = getKalshiPrivateKey();
  if (!privateKey || !KALSHI_ACCESS_KEY_ID) return null;

  const timestamp = String(Date.now());
  const toSign = `${timestamp}GET${KALSHI_WS_SIGN_PATH}`;
  const signature = signKalshiRsaPssSha256(privateKey, toSign);

  return {
    "KALSHI-ACCESS-KEY": KALSHI_ACCESS_KEY_ID,
    "KALSHI-ACCESS-SIGNATURE": signature,
    "KALSHI-ACCESS-TIMESTAMP": timestamp
  };
}
