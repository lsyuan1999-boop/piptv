import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("缺少环境变量 DATABASE_URL，请检查 .env.local");
}

export const db = drizzle(neon(url), { schema });
