import crypto from "crypto";
import QRCode from "qrcode";

import { db } from "@/lib/db";

type GenerateTicketsResult = {
    tickets: Array<{
        id: string;
        ticketNumber: string;
        ticketTypeName: string;
        customerName: string;
        qrCodeDataUrl: string;
    }>;
};

function generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();

    const random = crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase();

    return `ND-${timestamp}-${random}`;
}

function generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

export async function generateTicketsForOrder(
    orderId: string,
): Promise<GenerateTicketsResult> {
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        /*
         * Lock the order so two simultaneous requests cannot
         * generate duplicate tickets.
         */
        const orderResult = await client.query(
            `
                SELECT
                    id,
                    order_number,
                    customer_name,
                    status
                FROM orders
                WHERE id = $1
                FOR UPDATE
            `,
            [orderId],
        );

        if (orderResult.rows.length === 0) {
            throw new Error("Order not found.");
        }

        const order = orderResult.rows[0];

        if (order.status !== "PAID") {
            throw new Error("Tickets can only be generated for paid orders.");
        }

        /*
         * If tickets already exist, return them instead of creating
         * duplicates. This makes ticket generation idempotent.
         */
        const existingTicketsResult = await client.query(
            `
                SELECT
                    id,
                    ticket_number,
                    ticket_type_name,
                    customer_name,
                    secure_token
                FROM tickets
                WHERE order_id = $1
                ORDER BY created_at ASC
            `,
            [orderId],
        );

        if (existingTicketsResult.rows.length > 0) {
            await client.query("COMMIT");

            const tickets = await Promise.all(
                existingTicketsResult.rows.map(async (ticket) => {
                    const qrPayload = JSON.stringify({
                        ticketNumber: ticket.ticket_number,
                        token: ticket.secure_token,
                    });

                    const qrCodeDataUrl = await QRCode.toDataURL(
                        qrPayload,
                        {
                            errorCorrectionLevel: "H",
                            margin: 2,
                            width: 500,
                        },
                    );

                    return {
                        id: ticket.id,
                        ticketNumber: ticket.ticket_number,
                        ticketTypeName: ticket.ticket_type_name,
                        customerName: ticket.customer_name,
                        qrCodeDataUrl,
                    };
                }),
            );

            return { tickets };
        }

        /*
         * Get all purchased items for this order.
         */
        const itemsResult = await client.query(
            `
                SELECT
                    id,
                    ticket_type_id,
                    ticket_type_name,
                    quantity
                FROM order_items
                WHERE order_id = $1
                ORDER BY created_at ASC
            `,
            [orderId],
        );

        if (itemsResult.rows.length === 0) {
            throw new Error("No ticket items found for this order.");
        }

        const createdTickets: Array<{
            id: string;
            ticketNumber: string;
            ticketTypeName: string;
            customerName: string;
            secureToken: string;
        }> = [];

        for (const item of itemsResult.rows) {
            for (let index = 0; index < item.quantity; index++) {
                const ticketNumber = generateTicketNumber();
                const secureToken = generateSecureToken();

                const ticketResult = await client.query(
                    `
                        INSERT INTO tickets (
                            order_id,
                            order_item_id,
                            ticket_type_id,
                            ticket_number,
                            secure_token,
                            customer_name,
                            ticket_type_name,
                            status
                        )
                        VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6,
                            $7,
                            'ISSUED'
                        )
                        RETURNING
                            id,
                            ticket_number,
                            ticket_type_name,
                            customer_name,
                            secure_token
                    `,
                    [
                        order.id,
                        item.id,
                        item.ticket_type_id,
                        ticketNumber,
                        secureToken,
                        order.customer_name,
                        item.ticket_type_name,
                    ],
                );

                const ticket = ticketResult.rows[0];

                createdTickets.push({
                    id: ticket.id,
                    ticketNumber: ticket.ticket_number,
                    ticketTypeName: ticket.ticket_type_name,
                    customerName: ticket.customer_name,
                    secureToken: ticket.secure_token,
                });
            }
        }

        await client.query("COMMIT");

        const tickets = await Promise.all(
            createdTickets.map(async (ticket) => {
                /*
                 * The QR contains only the ticket number and secure
                 * token. No customer email, mobile number, or payment
                 * information is exposed in the QR itself.
                 */
                const qrPayload = JSON.stringify({
                    ticketNumber: ticket.ticketNumber,
                    token: ticket.secureToken,
                });

                const qrCodeDataUrl = await QRCode.toDataURL(
                    qrPayload,
                    {
                        errorCorrectionLevel: "H",
                        margin: 2,
                        width: 500,
                    },
                );

                return {
                    id: ticket.id,
                    ticketNumber: ticket.ticketNumber,
                    ticketTypeName: ticket.ticketTypeName,
                    customerName: ticket.customerName,
                    qrCodeDataUrl,
                };
            }),
        );

        return { tickets };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}