import { db } from "../db";
import {
    sendTicketEmail,
} from "./email";

type TicketForDelivery = {
    id: string;
    ticketNumber: string;
    ticketTypeName: string;
    customerName: string;
    qrCodeDataUrl: string;
};

type DeliveryOrder = {
    id: string;
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    eventName: string;
    eventDate: string | null;
    venue: string | null;
};

export async function deliverTicketsByEmail(
    orderId: string,
    tickets: TicketForDelivery[],
): Promise<void> {
    if (tickets.length === 0) {
        return;
    }

    const orderResult = await db.query<DeliveryOrder>(
        `
            select
                o.id,
                o.order_number as "orderNumber",
                o.customer_name as "customerName",
                o.customer_email as "customerEmail",
                e.name as "eventName",
                e.event_date as "eventDate",
                e.venue
            from orders o
            inner join events e
                on e.id = o.event_id
            where o.id = $1
            limit 1
        `,
        [orderId],
    );

    const order = orderResult.rows[0];

    if (!order) {
        throw new Error(
            `Order not found for ticket delivery: ${orderId}`,
        );
    }

    /*
     * Create one EMAIL delivery record per ticket.
     *
     * The unique index on:
     * ticket_id + channel
     *
     * makes this operation idempotent.
     */
    for (const ticket of tickets) {
        await db.query(
            `
                insert into ticket_deliveries (
                    ticket_id,
                    channel,
                    status,
                    recipient
                )
                values (
                    $1,
                    'EMAIL',
                    'PENDING',
                    $2
                )
                on conflict (
                    ticket_id,
                    channel
                )
                do nothing
            `,
            [
                ticket.id,
                order.customerEmail,
            ],
        );
    }

    /*
     * Check whether all tickets have already been successfully
     * delivered by email.
     *
     * This makes repeated calls safe.
     */
    const deliveryResult = await db.query<{
        ticket_id: string;
        status: string;
    }>(
        `
            select
                ticket_id,
                status
            from ticket_deliveries
            where
                ticket_id = any($1::uuid[])
                and channel = 'EMAIL'
        `,
        [
            tickets.map((ticket) => ticket.id),
        ],
    );

    const deliveryMap = new Map(
        deliveryResult.rows.map(
            (delivery) => [
                delivery.ticket_id,
                delivery.status,
            ],
        ),
    );

    const ticketsToSend = tickets.filter(
        (ticket) =>
            deliveryMap.get(ticket.id) !== "SENT",
    );

    if (ticketsToSend.length === 0) {
        return;
    }

    try {
        const emailResult = await sendTicketEmail({
            customerEmail: order.customerEmail,
            customerName: order.customerName,
            orderNumber: order.orderNumber,
            eventName: order.eventName,
            eventDate: order.eventDate,
            venue: order.venue,
            tickets: ticketsToSend.map(
                (ticket) => ({
                    ticketNumber:
                        ticket.ticketNumber,

                    ticketTypeName:
                        ticket.ticketTypeName,

                    customerName:
                        ticket.customerName,

                    qrCodeDataUrl:
                        ticket.qrCodeDataUrl,
                }),
            ),
        });

        /*
         * The email contains all tickets in this order.
         * Mark every ticket included in that email as SENT.
         */
        for (const ticket of ticketsToSend) {
            await db.query(
                `
                    update ticket_deliveries
                    set
                        status = 'SENT',
                        provider_message_id = $1,
                        sent_at = now()
                    where
                        ticket_id = $2
                        and channel = 'EMAIL'
                `,
                [
                    emailResult.messageId,
                    ticket.id,
                ],
            );
        }
    } catch (error) {
        const errorMessage =
            error instanceof Error
                ? error.message
                : "Unknown email delivery error.";

        /*
         * Delivery failure must NOT invalidate the ticket
         * or payment.
         */
        for (const ticket of ticketsToSend) {
            await db.query(
                `
                    update ticket_deliveries
                    set
                        status = 'FAILED',
                        error_message = $1
                    where
                        ticket_id = $2
                        and channel = 'EMAIL'
                `,
                [
                    errorMessage,
                    ticket.id,
                ],
            );
        }

        console.error(
            "Ticket email delivery failed:",
            {
                orderId,
                error: errorMessage,
            },
        );
    }
}