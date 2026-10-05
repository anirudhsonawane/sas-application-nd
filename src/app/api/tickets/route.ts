import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET() {
    try {
        const result = await db.query(`
            SELECT
                id,
                name,
                description,
                price,
                available_quantity,
                max_per_order
            FROM ticket_types
            WHERE is_active = true
              AND available_quantity > 0
            ORDER BY price ASC
        `);

        return NextResponse.json({
            success: true,
            tickets: result.rows,
        });
    } catch (error) {
        console.error("Failed to fetch tickets:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to load tickets",
            },
            {
                status: 500,
            },
        );
    }
}