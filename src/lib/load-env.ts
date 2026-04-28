import { loadEnvConfig } from "@next/env";

const isDev = process.env.NODE_ENV !== "production";

// Load .env files in the same priority order as Next.js runtime.
loadEnvConfig(process.cwd(), isDev);
