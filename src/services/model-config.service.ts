import { query } from "@/lib/db/pg";
import type { Capability, ModelConfigRecord } from "@/lib/db/types";
import { AppError } from "@/lib/errors";
import { getModelProvider } from "@/lib/model-providers";
import type { ModelCapability } from "@/lib/model-providers/types";

export const getDefaultModelByCapability = async (
  capability: Capability,
  requiredProviderCapability?: ModelCapability,
) => {
  const result = await query<ModelConfigRecord>(
    `
      SELECT
        id,
        model_key AS "modelKey",
        capability,
        provider,
        endpoint,
        enabled,
        is_default AS "isDefault",
        allow_front_select AS "allowFrontSelect",
        default_params AS "defaultParams",
        timeout_sec AS "timeoutSec",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM model_configs
      WHERE capability = $1
        AND enabled = TRUE
      ORDER BY is_default DESC, id ASC
    `,
    [capability],
  );

  const rows = result.rows;
  const provider = getModelProvider();
  const model =
    requiredProviderCapability && provider.supportsCapability
      ? rows.find((row) => provider.supportsCapability!(row.modelKey, requiredProviderCapability))
      : rows.find((row) => row.isDefault) ?? rows[0];

  if (!model) {
    throw new AppError(
      "E_MODEL_NOT_ALLOWED",
      requiredProviderCapability
        ? `No ${requiredProviderCapability} model found for capability ${capability}.`
        : `No default model found for capability ${capability}.`,
      400,
    );
  }
  return model;
};

export const getModelByKey = async (modelKey: string, capability: Capability) => {
  const result = await query<ModelConfigRecord>(
    `
      SELECT
        id,
        model_key AS "modelKey",
        capability,
        provider,
        endpoint,
        enabled,
        is_default AS "isDefault",
        allow_front_select AS "allowFrontSelect",
        default_params AS "defaultParams",
        timeout_sec AS "timeoutSec",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM model_configs
      WHERE model_key = $1
        AND capability = $2
        AND enabled = TRUE
      ORDER BY id ASC
      LIMIT 1
    `,
    [modelKey, capability],
  );
  const model = result.rows[0];
  if (!model) {
    throw new AppError("E_MODEL_NOT_ALLOWED", `Model ${modelKey} not available for ${capability}.`, 400);
  }
  return model;
};

export const listFrontSelectableModels = async (
  capability: Capability,
  requiredProviderCapability?: ModelCapability,
) => {
  const rows = (
    await query<Pick<ModelConfigRecord, "modelKey" | "provider" | "endpoint" | "defaultParams" | "isDefault">>(
      `
        SELECT
          model_key AS "modelKey",
          provider,
          endpoint,
          default_params AS "defaultParams",
          is_default AS "isDefault"
        FROM model_configs
        WHERE capability = $1
          AND enabled = TRUE
          AND allow_front_select = TRUE
        ORDER BY is_default DESC, model_key ASC
      `,
      [capability],
    )
  ).rows;

  if (!requiredProviderCapability) return rows;

  const provider = getModelProvider();
  if (!provider.supportsCapability) return rows;
  return rows.filter((r) => provider.supportsCapability!(r.modelKey, requiredProviderCapability));
};
