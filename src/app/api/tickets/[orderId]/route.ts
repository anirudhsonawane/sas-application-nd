import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { generateTicketsForOrder } from "@/lib/tickets";

type RouteContext = {
    params: Promise<{
        orderId: string;
    }>;
};

export async function GET(
    _request: Request,
    context: RouteContext,
) {
    try {
        const { orderId } = await context.params;

        if (!orderId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Order ID is required.",
                },
                {
                    status: 400,
                },
            );
        }

        /*
         * Only paid orders are allowed to expose tickets.
         */
        const orderResult = await db.query(
            `
                SELECT
                    id,
                    order_number,
                    status
                FROM orders
                WHERE id = $1
                LIMIT 1
            `,
            [orderId],
        );

        if (orderResult.rows.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Order not found.",
                },
                {
                    status: 404,
                },
            );
        }

        const order = orderResult.rows[0];

        if (order.status !== "PAID") {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Tickets are not available for this order.",
                },
                {
                    status: 403,
                },
            );
        }

        /*
         * This is idempotent. If tickets already exist,
         * the existing tickets are returned.
         */
        const result =
            await generateTicketsForOrder(orderId);

        return NextResponse.json({
            success: true,
            order: {
                id: order.id,
                orderNumber: order.order_number,
                status: order.status,
            },
            tickets: result.tickets,
        });
    } catch (error) {
        console.error(
            "Failed to load order tickets:",
            error,
        );

        return NextResponse.json(
            {
                success: false,
                message: "Failed to load tickets.",
            },
            {
                status: 500,
            },
        );
    }
}