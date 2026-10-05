import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

type ValidateRequest = {
    ticketNumber?: string;
    token?: string;
};

export async function POST(request: NextRequest) {
    let body: ValidateRequest;

    try {
        body = (await request.json()) as ValidateRequest;
    } catch {
        return NextResponse.json(
            {
                success: false,
                message: "Invalid request body.",
            },
            {
                status: 400,
            },
        );
    }

    const ticketNumber = body.ticketNumber?.trim();
    const token = body.token?.trim();

    if (!ticketNumber || !token) {
        return NextResponse.json(
            {
                success: false,
                message: "Ticket number and token are required.",
            },
            {
                status: 400,
            },
        );
    }

    const client = await db.connect();

    try {
        await client.query("BEGIN");

        /*
         * Lock the ticket row.
         *
         * This is important because two scanners must never be
         * able to validate the same ticket at the same time.
         */
        const ticketResult = await client.query(
            `
                SELECT
                    t.id,
                    t.ticket_number,
                    t.secure_token,
                    t.customer_name,
                    t.ticket_type_name,
                    t.status,
                    t.order_id,
                    t.order_item_id,
                    t.ticket_type_id,
                    oi.unit_price,
                    o.order_number,
                    o.total_amount
                FROM tickets t
                INNER JOIN order_items oi
                    ON oi.id = t.order_item_id
                INNER JOIN orders o
                    ON o.id = t.order_id
                WHERE t.ticket_number = $1
                LIMIT 1
                FOR UPDATE
            `,
            [ticketNumber],
        );

        if (ticketResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return NextResponse.json(
                {
                    success: false,
                    result: "INVALID",
                    message: "Ticket not found.",
                },
                {
                    status: 404,
                },
            );
        }

        const ticket = ticketResult.rows[0];

        /*
         * Verify the secure token before allowing entry.
         */
        if (ticket.secure_token !== token) {
            await client.query(
                `
                    INSERT INTO ticket_scans (
                        ticket_id,
                        scanner_reference,
                        ip_address,
                        user_agent,
                        result
                    )
                    VALUES ($1, $2, $3, $4, 'INVALID')
                `,
                [
                    ticket.id,
                    "web-scanner",
                    getClientIp(request),
                    request.headers.get("user-agent"),
                ],
            );

            await client.query("COMMIT");

            return NextResponse.json(
                {
                    success: false,
                    result: "INVALID",
                    message: "Invalid ticket QR code.",
                    ticket: formatTicket(ticket),
                },
                {
                    status: 403,
                },
            );
        }

        /*
         * Ticket was already scanned.
         */
        if (ticket.status === "USED") {
            await client.query(
                `
                    INSERT INTO ticket_scans (
                        ticket_id,
                        scanner_reference,
                        ip_address,
                        user_agent,
                        result
                    )
                    VALUES ($1, $2, $3, $4, 'ALREADY_USED')
                `,
                [
                    ticket.id,
                    "web-scanner",
                    getClientIp(request),
                    request.headers.get("user-agent"),
                ],
            );

            await client.query("COMMIT");

            return NextResponse.json(
                {
                    success: false,
                    result: "ALREADY_USED",
                    message: "This ticket has already been used.",
                    ticket: formatTicket(ticket),
                },
                {
                    status: 409,
                },
            );
        }

        /*
         * Ticket was cancelled.
         */
        if (ticket.status === "CANCELLED") {
            await client.query(
                `
                    INSERT INTO ticket_scans (
                        ticket_id,
                        scanner_reference,
                        ip_address,
                        user_agent,
                        result
                    )
                    VALUES ($1, $2, $3, $4, 'CANCELLED')
                `,
                [
                    ticket.id,
                    "web-scanner",
                    getClientIp(request),
                    request.headers.get("user-agent"),
                ],
            );

            await client.query("COMMIT");

            return NextResponse.json(
                {
                    success: false,
                    result: "CANCELLED",
                    message: "This ticket has been cancelled.",
                    ticket: formatTicket(ticket),
                },
                {
                    status: 409,
                },
            );
        }

        /*
         * Only ISSUED tickets can enter.
         */
        if (ticket.status !== "ISSUED") {
            await client.query("ROLLBACK");

            return NextResponse.json(
                {
                    success: false,
                    result: "INVALID",
                    message: "This ticket is not valid for entry.",
                    ticket: formatTicket(ticket),
                },
                {
                    status: 409,
                },
            );
        }

        /*
         * Mark ticket as USED.
         */
        await client.query(
            `
                UPDATE tickets
                SET
                    status = 'USED',
                    used_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
            `,
            [ticket.id],
        );

        /*
         * Store successful scan.
         */
        await client.query(
            `
                INSERT INTO ticket_scans (
                    ticket_id,
                    scanner_reference,
                    ip_address,
                    user_agent,
                    result
                )
                VALUES ($1, $2, $3, $4, 'VALID')
            `,
            [
                ticket.id,
                "web-scanner",
                getClientIp(request),
                request.headers.get("user-agent"),
            ],
        );

        await client.query("COMMIT");

        return NextResponse.json(
            {
                success: true,
                result: "VALID",
                message: "Entry allowed.",
                ticket: {
                    ...formatTicket(ticket),
                    status: "USED",
                    usedAt: new Date().toISOString(),
                },
            },
            {
                status: 200,
            },
        );
    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Ticket validation error:",
            error,
        );

        return NextResponse.json(
            {
                success: false,
                message: "Unable to validate ticket.",
            },
            {
                status: 500,
            },
        );
    } finally {
        client.release();
    }
}

function formatTicket(ticket: {
    id: string;
    ticket_number: string;
    customer_name: string;
    ticket_type_name: string;
    status: string;
    order_number: string;
    unit_price: string | number;
    total_amount: string | number;
}) {
    return {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        customerName: ticket.customer_name,
        ticketType: ticket.ticket_type_name,
        amount: Number(ticket.unit_price),
        orderNumber: ticket.order_number,
        orderTotal: Number(ticket.total_amount),
        status: ticket.status,
    };
}

function getClientIp(request: NextRequest) {
    const forwardedFor =
        request.headers.get("x-forwarded-for");

    if (forwardedFor) {
        return forwardedFor.split(",")[0]?.trim() || null;
    }

    return request.headers.get("x-real-ip") || null;
}