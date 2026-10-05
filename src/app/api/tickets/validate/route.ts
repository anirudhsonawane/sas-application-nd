import { NextResponse } from "next/server";

import { db } from "@/lib/db";

type QRPayload = {
    ticketNumber?: unknown;
    token?: unknown;
};

function getClientIp(request: Request): string | null {
    const forwardedFor = request.headers.get("x-forwarded-for");

    if (forwardedFor) {
        return forwardedFor.split(",")[0]?.trim() || null;
    }

    return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as QRPayload;

        const ticketNumber =
            typeof body.ticketNumber === "string"
                ? body.ticketNumber.trim()
                : "";

        const token =
            typeof body.token === "string"
                ? body.token.trim()
                : "";

        if (!ticketNumber || !token) {
            return NextResponse.json(
                {
                    success: false,
                    result: "INVALID",
                    message: "Invalid QR code.",
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
             * This is critical:
             * if two scanners hit the same ticket at almost
             * exactly the same time, only one request can
             * successfully consume it.
             */
            const ticketResult = await client.query(
                `
                    SELECT
                        id,
                        ticket_number,
                        secure_token,
                        customer_name,
                        ticket_type_name,
                        status
                    FROM tickets
                    WHERE ticket_number = $1
                    FOR UPDATE
                `,
                [ticketNumber],
            );

            if (ticketResult.rows.length === 0) {
                await client.query("ROLLBACK");

                return NextResponse.json({
                    success: false,
                    result: "INVALID",
                    message: "Ticket not found.",
                });
            }

            const ticket = ticketResult.rows[0];

            /*
             * Never trust the ticket number alone.
             *
             * The cryptographically generated token must
             * also match.
             */
            if (ticket.secure_token !== token) {
                await client.query("ROLLBACK");

                return NextResponse.json({
                    success: false,
                    result: "INVALID",
                    message: "Invalid ticket QR code.",
                });
            }

            /*
             * Already-used tickets cannot be reused.
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
                        VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            'ALREADY_USED'
                        )
                    `,
                    [
                        ticket.id,
                        "WEB_SCANNER",
                        getClientIp(request),
                        request.headers.get(
                            "user-agent",
                        ),
                    ],
                );

                await client.query("COMMIT");

                return NextResponse.json({
                    success: false,
                    result: "ALREADY_USED",
                    message:
                        "This ticket has already been used.",
                    ticket: {
                        ticketNumber:
                            ticket.ticket_number,
                        customerName:
                            ticket.customer_name,
                        ticketTypeName:
                            ticket.ticket_type_name,
                    },
                });
            }

            /*
             * Cancelled tickets are rejected.
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
                        VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            'CANCELLED'
                        )
                    `,
                    [
                        ticket.id,
                        "WEB_SCANNER",
                        getClientIp(request),
                        request.headers.get(
                            "user-agent",
                        ),
                    ],
                );

                await client.query("COMMIT");

                return NextResponse.json({
                    success: false,
                    result: "CANCELLED",
                    message:
                        "This ticket has been cancelled.",
                    ticket: {
                        ticketNumber:
                            ticket.ticket_number,
                        customerName:
                            ticket.customer_name,
                        ticketTypeName:
                            ticket.ticket_type_name,
                    },
                });
            }

            /*
             * Only ISSUED tickets can enter.
             */
            if (ticket.status !== "ISSUED") {
                await client.query("ROLLBACK");

                return NextResponse.json({
                    success: false,
                    result: "INVALID",
                    message:
                        "This ticket is not valid for entry.",
                });
            }

            /*
             * Consume the ticket.
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
             * Record successful scan.
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
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        'VALID'
                    )
                `,
                [
                    ticket.id,
                    "WEB_SCANNER",
                    getClientIp(request),
                    request.headers.get("user-agent"),
                ],
            );

            await client.query("COMMIT");

            return NextResponse.json({
                success: true,
                result: "VALID",
                message: "Entry allowed.",
                ticket: {
                    ticketNumber:
                        ticket.ticket_number,
                    customerName:
                        ticket.customer_name,
                    ticketTypeName:
                        ticket.ticket_type_name,
                    status: "USED",
                },
            });
        } catch (error) {
            try {
                await client.query("ROLLBACK");
            } catch {
                // Ignore rollback failure.
            }

            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error(
            "Ticket validation failed:",
            error,
        );

        return NextResponse.json(
            {
                success: false,
                result: "INVALID",
                message:
                    "Unable to validate the ticket.",
            },
            {
                status: 500,
            },
        );
    }
}