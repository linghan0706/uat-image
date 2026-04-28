import { withTransaction } from "@/lib/db/pg";
import { listDefaultBootstrapModels } from "@/services/bootstrap-models";

const defaultSystemConfigs = [
  {
    configKey: "limits",
    configValue: {
      max_prompts_per_batch: 1000,
      max_prompt_length: 4000,
      max_docx_xlsx_size: 10 * 1024 * 1024,
      max_text_like_size: 5 * 1024 * 1024,
    },
    description: "Global limit settings.",
  },
  {
    configKey: "nas",
    configValue: {
      provider: "synology",
      path_pattern: "/{env}/images/{yyyy}/{mm}/{dd}/{job_no}/{item_no}/",
    },
    description: "NAS settings for storage path and provider.",
  },
];

let bootstrapped = false;

export const ensureBootstrapped = async () => {
  if (bootstrapped) {
    return;
  }

  await withTransaction(async (tx) => {
    for (const model of listDefaultBootstrapModels()) {
      await tx.query(
        `
          INSERT INTO model_configs (
            model_key,
            capability,
            provider,
            endpoint,
            enabled,
            is_default,
            allow_front_select,
            default_params,
            timeout_sec,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (capability, model_key)
          DO UPDATE SET
            provider = EXCLUDED.provider,
            endpoint = EXCLUDED.endpoint,
            enabled = EXCLUDED.enabled,
            is_default = EXCLUDED.is_default,
            allow_front_select = EXCLUDED.allow_front_select,
            default_params = EXCLUDED.default_params,
            timeout_sec = EXCLUDED.timeout_sec,
            updated_at = NOW()
        `,
        [
          model.modelKey,
          model.capability,
          model.provider,
          model.endpoint,
          model.enabled,
          model.isDefault,
          model.allowFrontSelect,
          model.defaultParams,
          model.timeoutSec,
        ],
      );
    }

    for (const cfg of defaultSystemConfigs) {
      await tx.query(
        `
          INSERT INTO system_configs (
            config_key,
            config_value,
            description,
            updated_at
          )
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (config_key)
          DO UPDATE SET
            config_value = EXCLUDED.config_value,
            description = EXCLUDED.description,
            updated_at = NOW()
        `,
        [cfg.configKey, cfg.configValue, cfg.description],
      );
    }
  });

  bootstrapped = true;
};
