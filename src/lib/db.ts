import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
}

const globalForDb = globalThis as unknown as {
    db: Pool | undefined;
};

export const db =
    globalForDb.db ??
    new Pool({
        connectionString,
        ssl: {
            rejectUnauthorized: false,
        },
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    });

if (process.env.NODE_ENV !== "production") {
    globalForDb.db = db;
}