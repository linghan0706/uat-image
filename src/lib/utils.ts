import crypto from "node:crypto";
import path from "node:path";

import { nanoid } from "nanoid";

import type { Capability } from "@/lib/db/types";

export const nowCompact = () => {
  const d = new Date();
  const cst = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = cst.getUTCFullYear().toString();
  const mm = String(cst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(cst.getUTCDate()).padStart(2, "0");
  const hh = String(cst.getUTCHours()).padStart(2, "0");
  const mi = String(cst.getUTCMinutes()).padStart(2, "0");
  const ss = String(cst.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
};

export const makeBatchJobNo = () => `BJ${nowCompact()}${nanoid(4).toUpperCase()}`;
export const makeJobItemNo = () => `IT${nowCompact()}${nanoid(5).toUpperCase()}`;

export const sha256Hex = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const capabilityPathMap: Record<Capability, string> = {
  PORTRAIT: "portrait",
  THREE_VIEW: "three_view",
  SCENE_CONCEPT: "scene_concept",
};

export const capabilityToPath = (capability: Capability) => capabilityPathMap[capability];

export const makeImageObjectKey = (args: {
  folderName: string;
  capability: Capability;
  jobNo: string;
  itemNo: string;
  variantIndex: number;
  extension: string;
  characterName?: string | null;
  characterSeq?: number;
}) => {
   if (args.characterName) {
      const seq = args.characterSeq ?? args.variantIndex;
      const hash8 = nanoid(8).toLowerCase();
      return path.posix.join(
        args.folderName,
        `${args.characterName}-${seq}-${hash8}.${args.extension}`,
      );
    }

  const ts = nowCompact();
  const hash8 = nanoid(8).toLowerCase();

  return path.posix.join(
    args.folderName,
    `${capabilityToPath(args.capability)}_${args.itemNo}_v${args.variantIndex}_${hash8}_${ts}.${args.extension}`,
  );
};

export const makeExportObjectKey = (folderName: string, jobNo: string) => {
  const ts = nowCompact();
  return path.posix.join(folderName, "exports", `batch_${jobNo}_${ts}.zip`);
};

export const parseIntSafe = (value: string | null, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Format a Date (or null) to an Asia/Shanghai locale string for API responses.
 * Returns null when the input is null.
 */
export const toCST = (date: Date | null): string | null => {
  if (!date) return null;
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
};
