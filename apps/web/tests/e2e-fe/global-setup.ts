import { execSync } from "node:child_process";
import path from "node:path";

import type { FullConfig } from "@playwright/test";

function run(command: string, env: NodeJS.ProcessEnv, cwd: string) {
  execSync(command, {
    stdio: "inherit",
    cwd,
    env
  });
}

function hasRealConnectionString(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return !value.includes("YOUR-") && !value.includes("DB_NAME_TEST");
}

export default async function globalSetup(_config: FullConfig) {
  void _config;
  const repositoryRoot = path.resolve(__dirname, "../../../../");

  const testDbUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  const testDirectUrl = process.env.DIRECT_URL_TEST ?? process.env.DIRECT_URL ?? testDbUrl;

  if (!hasRealConnectionString(testDbUrl) || !hasRealConnectionString(testDirectUrl)) {
    console.warn("[playwright] DATABASE_URL_TEST/DIRECT_URL_TEST non configurati: i test FE e2e verranno skip.");
    return;
  }

  const env = {
    ...process.env,
    DATABASE_URL: testDbUrl,
    DIRECT_URL: testDirectUrl,
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? "umberto.giancola00@gmail.com",
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "Castiglione1!"
  };

  run("pnpm --filter @gestionale/db db:push", env, repositoryRoot);
  run("pnpm --filter @gestionale/db db:seed", env, repositoryRoot);
}
