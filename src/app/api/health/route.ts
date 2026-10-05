import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
    try {
        const result = await db.query("SELECT NOW() AS current_time");

        return NextResponse.json({
            success: true,
            database: "connected",
            time: result.rows[0].current_time,
        });
    } catch (error) {
        console.error("Database connection failed:", error);

        return NextResponse.json(
            {
                success: false,
                database: "disconnected",
            },
            {
                status: 500,
            },
        );
    }
}