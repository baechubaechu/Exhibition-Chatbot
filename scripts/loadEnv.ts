import { config } from "dotenv";
import { resolve } from "path";

/** 로컬 스크립트용: `.env.local` 우선 */
export function loadEnv(): void {
  config({ path: resolve(process.cwd(), ".env.local") });
  config({ path: resolve(process.cwd(), ".env") });
}
