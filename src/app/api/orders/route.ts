import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { db } from "@/lib/db";

type OrderItemInput = {
    ticketTypeId: string;
    quantity: number;
};

type CreateOrderBody = {
    customerName: string;
    customerEmail: string;
    customerMobile: string;
    items: OrderItemInput[];
};

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidMobile(mobile: string) {
    return /^\d{10}$/.test(mobile);
}

function generateOrderNumber() {
    const random = randomBytes(4).toString("hex").toUpperCase();

    return `ND-${Date.now()}-${random}`;
}

function toPaise(value: string | number) {
    const valueString = String(value);

    const [rupees, paise = ""] = valueString.split(".");

    const normalizedPaise = `${paise}00`.slice(0, 2);

    return (
        Number(rupees) * 100 +
        Number(normalizedPaise)
    );
}

function fromPaise(value: number) {
    return (value / 100).toFixed(2);
}

export async function POST(request: Request) {
    const client = await db.connect();

    try {
        const body =
            (await request.json()) as CreateOrderBody;

        const customerName =
            body.customerName?.trim();

        const customerEmail =
            body.customerEmail?.trim().toLowerCase();

        const customerMobile =
            body.customerMobile?.replace(/\D/g, "");

        const items = body.items;

        if (!customerName) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Customer name is required.",
                },
                { status: 400 },
            );
        }

        if (customerName.length > 150) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Customer name is too long.",
                },
                { status: 400 },
            );
        }

        if (
            !customerEmail ||
            !isValidEmail(customerEmail)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Please provide a valid email address.",
                },
                { status: 400 },
            );
        }

        if (
            !customerMobile ||
            !isValidMobile(customerMobile)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Please provide a valid 10-digit mobile number.",
                },
                { status: 400 },
            );
        }

        if (
            !Array.isArray(items) ||
            items.length === 0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "At least one ticket is required.",
                },
                { status: 400 },
            );
        }

        if (items.length > 20) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Too many ticket types.",
                },
                { status: 400 },
            );
        }

        /*
         * Combine duplicate ticket types.
         */
        const quantityMap = new Map<string, number>();

        for (const item of items) {
            if (
                !item ||
                typeof item.ticketTypeId !== "string"
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Invalid ticket selection.",
                    },
                    { status: 400 },
                );
            }

            const quantity = Number(item.quantity);

            if (
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Ticket quantity must be a positive integer.",
                    },
                    { status: 400 },
                );
            }

            const existing =
                quantityMap.get(item.ticketTypeId) ?? 0;

            quantityMap.set(
                item.ticketTypeId,
                existing + quantity,
            );
        }

        const ticketTypeIds = [
            ...quantityMap.keys(),
        ];

        await client.query("BEGIN");

        /*
         * Lock the selected ticket rows.
         *
         * This prevents two customers from buying
         * the same last available ticket simultaneously.
         */
        const ticketResult = await client.query(
            `
                SELECT
                    id,
                    event_id,
                    name,
                    price,
                    available_quantity,
                    max_per_order,
                    is_active
                FROM ticket_types
                WHERE id = ANY($1::uuid[])
                FOR UPDATE
            `,
            [ticketTypeIds],
        );

        if (
            ticketResult.rows.length !==
            ticketTypeIds.length
        ) {
            await client.query("ROLLBACK");

            return NextResponse.json(
                {
                    success: false,
                    message:
                        "One or more selected tickets no longer exist.",
                },
                { status: 409 },
            );
        }

        /*
         * All selected ticket types must belong
         * to the same event.
         */
        const eventIds = new Set(
            ticketResult.rows.map(
                (ticket) => ticket.event_id,
            ),
        );

        if (eventIds.size !== 1) {
            await client.query("ROLLBACK");

            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Tickets from different events cannot be purchased together.",
                },
                { status: 400 },
            );
        }

        const eventId = ticketResult.rows[0].event_id;

        let totalPaise = 0;
        let totalQuantity = 0;

        const orderItems: {
            ticketTypeId: string;
            ticketTypeName: string;
            quantity: number;
            unitPrice: string;
            totalPrice: string;
        }[] = [];

        /*
         * Validate inventory and calculate price
         * completely on the server.
         */
        for (const ticket of ticketResult.rows) {
            const quantity =
                quantityMap.get(ticket.id) ?? 0;

            if (quantity <= 0) {
                continue;
            }

            if (!ticket.is_active) {
                await client.query("ROLLBACK");

                return NextResponse.json(
                    {
                        success: false,
                        message: `${ticket.name} is no longer available.`,
                    },
                    { status: 409 },
                );
            }

            if (
                quantity >
                ticket.max_per_order
            ) {
                await client.query("ROLLBACK");

                return NextResponse.json(
                    {
                        success: false,
                        message: `${ticket.name} allows a maximum of ${ticket.max_per_order} tickets per order.`,
                    },
                    { status: 400 },
                );
            }

            if (
                quantity >
                ticket.available_quantity
            ) {
                await client.query("ROLLBACK");

                return NextResponse.json(
                    {
                        success: false,
                        message: `Only ${ticket.available_quantity} ${ticket.name} tickets are available.`,
                    },
                    { status: 409 },
                );
            }

            const unitPricePaise =
                toPaise(ticket.price);

            const itemTotalPaise =
                unitPricePaise * quantity;

            totalPaise += itemTotalPaise;
            totalQuantity += quantity;

            orderItems.push({
                ticketTypeId: ticket.id,
                ticketTypeName: ticket.name,
                quantity,
                unitPrice: String(ticket.price),
                totalPrice:
                    fromPaise(itemTotalPaise),
            });
        }

        if (orderItems.length === 0) {
            await client.query("ROLLBACK");

            return NextResponse.json(
                {
                    success: false,
                    message: "No valid tickets selected.",
                },
                { status: 400 },
            );
        }

        const orderNumber =
            generateOrderNumber();

        /*
         * Reserve inventory for 10 minutes.
         *
         * Later, payment expiry handling will restore
         * this inventory if the customer doesn't pay.
         */
        const orderResult = await client.query(
            `
                INSERT INTO orders (
                    order_number,
                    event_id,
                    customer_name,
                    customer_email,
                    customer_mobile,
                    subtotal,
                    total_amount,
                    currency,
                    status,
                    expires_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $6,
                    'INR',
                    'PENDING',
                    NOW() + INTERVAL '10 minutes'
                )
                RETURNING
                    id,
                    order_number,
                    total_amount,
                    currency,
                    status,
                    expires_at
            `,
            [
                orderNumber,
                eventId,
                customerName,
                customerEmail,
                customerMobile,
                fromPaise(totalPaise),
            ],
        );

        const order = orderResult.rows[0];

        /*
         * Create order items.
         */
        for (const item of orderItems) {
            await client.query(
                `
                    INSERT INTO order_items (
                        order_id,
                        ticket_type_id,
                        ticket_type_name,
                        quantity,
                        unit_price,
                        total_price
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6
                    )
                `,
                [
                    order.id,
                    item.ticketTypeId,
                    item.ticketTypeName,
                    item.quantity,
                    item.unitPrice,
                    item.totalPrice,
                ],
            );

            /*
             * Reserve the tickets.
             */
            await client.query(
                `
                    UPDATE ticket_types
                    SET
                        available_quantity =
                            available_quantity - $1,
                        updated_at = NOW()
                    WHERE id = $2
                `,
                [
                    item.quantity,
                    item.ticketTypeId,
                ],
            );
        }

        await client.query("COMMIT");

        return NextResponse.json(
            {
                success: true,
                order: {
                    id: order.id,
                    orderNumber:
                        order.order_number,
                    totalAmount:
                        order.total_amount,
                    currency:
                        order.currency,
                    status: order.status,
                    expiresAt:
                        order.expires_at,
                    totalQuantity,
                },
            },
            { status: 201 },
        );
    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Order creation failed:",
            error,
        );

        return NextResponse.json(
            {
                success: false,
                message:
                    "Unable to create your order.",
            },
            { status: 500 },
        );
    } finally {
        client.release();
    }
}