import fs from "node:fs";
import crypto, { constants } from "node:crypto";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

const normalizePem = (value: string) => value.replace(/\\n/g, "\n").trim();

function loadPem(kind: "public" | "private"): string;
function loadPem(kind: "public" | "private", options: { required: false }): string | null;
function loadPem(kind: "public" | "private", options?: { required?: boolean }) {
  const required = options?.required ?? true;
  const fromPath = kind === "public" ? env.skyModelPublicKeyPath : env.skyModelPrivateKeyPath;
  const fromInline = kind === "public" ? env.skyModelPublicKeyPem : env.skyModelPrivateKeyPem;

  if (fromPath) {
    if (!fs.existsSync(fromPath)) {
      throw new AppError("E_INVALID_PARAM", `RSA ${kind} key path does not exist: ${fromPath}`, 500);
    }
    return normalizePem(fs.readFileSync(fromPath, "utf-8"));
  }

  if (fromInline) {
    return normalizePem(fromInline);
  }

  if (!required) {
    return null;
  }
  throw new AppError("E_INVALID_PARAM", `Missing SKY_MODEL_${kind.toUpperCase()}_KEY_PATH or PEM.`, 500);
}

const rsaEncrypt = (payload: string) => {
  const publicKey = loadPem("public");
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(payload, "utf-8"),
  );
  return encrypted.toString("base64");
};

const rsaSign = (payload: string) => {
  const privateKey = loadPem("private", { required: false });
  if (!privateKey) {
    return null;
  }
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(payload, "utf-8");
  sign.end();
  return sign.sign(privateKey, "base64");
};

export const buildSkyRsaAuthHeaders = (requestId: string) => {
  if (!env.skyModelApiKey) {
    throw new AppError("E_INVALID_PARAM", "Missing SKY_MODEL_API_KEY.", 500);
  }

  const timestampSec = Math.floor(Date.now() / 1000).toString();
  const plain = `${timestampSec}.${env.skyModelApiKey}`;
  const bearerToken = rsaEncrypt(plain);
  const signature = rsaSign(plain);

  const headers: Record<string, string> = {
    [env.skyModelAuthHeader]: `Bearer ${bearerToken}`,
    [env.skyModelTimestampHeader]: timestampSec,
    [env.skyModelReqIdHeader]: requestId,
  };

  // 与旧服务兼容：未提供私钥时仅发送 Bearer。
  if (signature) {
    headers[env.skyModelSignatureHeader] = signature;
  }

  return headers;
};
