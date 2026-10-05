import crypto from "crypto";

import { NextResponse } from "next/server";

import { db } from "@/lib/db";

import { generateTicketsForOrder } from "@/lib/tickets";

import {
    deliverTicketsByEmail,
} from "@/lib/delivery/deliverTicket";


function getRequiredEnv(
    name: string,
): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(
            `${name} is not configured.`,
        );
    }

    return value;
}


function isValidSignature(
    orderId: string,
    paymentId: string,
    signature: string,
    secret: string,
): boolean {
    const expectedSignature = crypto
        .createHmac(
            "sha256",
            secret,
        )
        .update(
            `${orderId}|${paymentId}`,
        )
        .digest("hex");

    const expectedBuffer =
        Buffer.from(
            expectedSignature,
            "utf8",
        );

    const receivedBuffer =
        Buffer.from(
            signature,
            "utf8",
        );

    if (
        expectedBuffer.length !==
        receivedBuffer.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer,
    );
}


export async function POST(
    request: Request,
) {
    try {
        const body =
            await request.json();

        const orderId =
            String(
                body.orderId || "",
            ).trim();

        const razorpayPaymentId =
            String(
                body.razorpayPaymentId ||
                    "",
            ).trim();

        const razorpayOrderId =
            String(
                body.razorpayOrderId ||
                    "",
            ).trim();

        const razorpaySignature =
            String(
                body.razorpaySignature ||
                    "",
            ).trim();


        if (
            !orderId ||
            !razorpayPaymentId ||
            !razorpayOrderId ||
            !razorpaySignature
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Missing payment verification data.",
                },
                {
                    status: 400,
                },
            );
        }


        const secret =
            getRequiredEnv(
                "RAZORPAY_KEY_SECRET",
            );


        /*
         * Get the internal order.
         */
        const orderResult =
            await db.query(
                `
                    SELECT
                        id,
                        order_number,
                        customer_name,
                        total_amount,
                        currency,
                        status,
                        expires_at
                    FROM orders
                    WHERE id = $1
                    LIMIT 1
                `,
                [orderId],
            );


        if (
            orderResult.rows.length ===
            0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Order not found.",
                },
                {
                    status: 404,
                },
            );
        }


        const order =
            orderResult.rows[0];


        /*
         * Idempotency:
         *
         * If this order has already been
         * successfully paid, do not process
         * the payment again.
         */
        if (
            order.status === "PAID"
        ) {
            const existingPaymentResult =
                await db.query(
                    `
                        SELECT
                            provider_payment_id
                        FROM payments
                        WHERE order_id = $1
                            AND provider = 'RAZORPAY'
                            AND status = 'SUCCESS'
                        ORDER BY created_at DESC
                        LIMIT 1
                    `,
                    [orderId],
                );


            const existingPayment =
                existingPaymentResult
                    .rows[0];


            /*
             * Only accept the request as an
             * idempotent retry when the same
             * Razorpay payment is supplied.
             */
            if (
                existingPayment
                    ?.provider_payment_id ===
                razorpayPaymentId
            ) {
                const ticketResult =
                    await generateTicketsForOrder(
                        orderId,
                    );


                /*
                 * Retry delivery safely.
                 *
                 * deliverTicketsByEmail()
                 * is idempotent because the
                 * ticket/channel combination
                 * is unique.
                 */
                void deliverTicketsByEmail(
                    orderId,
                    ticketResult.tickets,
                );


                return NextResponse.json({
                    success: true,
                    message:
                        "Payment already verified.",
                    order: {
                        id: order.id,
                        orderNumber:
                            order.order_number,
                        status:
                            order.status,
                    },
                    tickets:
                        ticketResult.tickets,
                });
            }


            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Order has already been paid.",
                },
                {
                    status: 409,
                },
            );
        }


        /*
         * Get the Razorpay payment record
         * created when the Razorpay order
         * was initialized.
         */
        const paymentResult =
            await db.query(
                `
                    SELECT
                        id,
                        provider_order_id,
                        provider_payment_id,
                        amount,
                        currency,
                        status
                    FROM payments
                    WHERE order_id = $1
                        AND provider = 'RAZORPAY'
                    ORDER BY created_at DESC
                    LIMIT 1
                `,
                [orderId],
            );


        if (
            paymentResult.rows.length ===
            0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Razorpay payment record not found.",
                },
                {
                    status: 404,
                },
            );
        }


        const payment =
            paymentResult.rows[0];


        /*
         * The Razorpay order ID returned
         * by the browser must match the
         * order ID stored on our server.
         */
        if (
            payment.provider_order_id !==
            razorpayOrderId
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Invalid Razorpay order.",
                },
                {
                    status: 400,
                },
            );
        }


        /*
         * Make sure the payment amount
         * matches our internal order amount.
         */
        const expectedAmountInPaise =
            Math.round(
                Number(
                    order.total_amount,
                ) * 100,
            );


        const storedAmountInPaise =
            Math.round(
                Number(
                    payment.amount,
                ) * 100,
            );


        if (
            expectedAmountInPaise !==
            storedAmountInPaise
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Payment amount mismatch.",
                },
                {
                    status: 400,
                },
            );
        }


        /*
         * Verify Razorpay HMAC signature.
         */
        const signatureValid =
            isValidSignature(
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature,
                secret,
            );


        if (!signatureValid) {
            await db.query(
                `
                    UPDATE payments
                    SET
                        status = 'FAILED',
                        updated_at = NOW()
                    WHERE id = $1
                `,
                [payment.id],
            );


            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Invalid payment signature.",
                },
                {
                    status: 400,
                },
            );
        }


        /*
         * Check order expiry.
         */
        if (
            order.expires_at &&
            new Date(
                order.expires_at,
            ).getTime() <
                Date.now()
        ) {
            await db.query(
                `
                    UPDATE orders
                    SET
                        status = 'EXPIRED',
                        updated_at = NOW()
                    WHERE id = $1
                `,
                [orderId],
            );


            return NextResponse.json(
                {
                    success: false,
                    message:
                        "This order has expired.",
                },
                {
                    status: 400,
                },
            );
        }


        /*
         * Lock the order before marking
         * it as paid.
         *
         * This prevents two verification
         * requests from processing the
         * same order simultaneously.
         */
        const client =
            await db.connect();


        try {
            await client.query(
                "BEGIN",
            );


            const lockedOrderResult =
                await client.query(
                    `
                        SELECT
                            id,
                            order_number,
                            status
                        FROM orders
                        WHERE id = $1
                        FOR UPDATE
                    `,
                    [orderId],
                );


            if (
                lockedOrderResult
                    .rows.length === 0
            ) {
                throw new Error(
                    "Order not found.",
                );
            }


            const lockedOrder =
                lockedOrderResult
                    .rows[0];


            /*
             * Another request may have
             * completed the payment while
             * this request was waiting for
             * the database lock.
             */
            if (
                lockedOrder.status ===
                "PAID"
            ) {
                await client.query(
                    "COMMIT",
                );


                const ticketResult =
                    await generateTicketsForOrder(
                        orderId,
                    );


                void deliverTicketsByEmail(
                    orderId,
                    ticketResult.tickets,
                );


                return NextResponse.json({
                    success: true,
                    message:
                        "Payment already verified.",
                    order: {
                        id:
                            lockedOrder.id,
                        orderNumber:
                            lockedOrder.order_number,
                        status: "PAID",
                    },
                    tickets:
                        ticketResult.tickets,
                });
            }


            if (
                lockedOrder.status !==
                    "PAYMENT_PROCESSING" &&
                lockedOrder.status !==
                    "PENDING"
            ) {
                await client.query(
                    "ROLLBACK",
                );


                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "Order cannot be verified in its current state.",
                    },
                    {
                        status: 409,
                    },
                );
            }


            /*
             * Make sure the same Razorpay
             * payment has not already been
             * attached to another order.
             */
            const duplicatePaymentResult =
                await client.query(
                    `
                        SELECT
                            id,
                            order_id
                        FROM payments
                        WHERE provider = 'RAZORPAY'
                            AND provider_payment_id = $1
                            AND status = 'SUCCESS'
                        LIMIT 1
                    `,
                    [razorpayPaymentId],
                );


            if (
                duplicatePaymentResult
                    .rows.length > 0 &&
                duplicatePaymentResult
                    .rows[0]
                    .order_id !==
                    orderId
            ) {
                await client.query(
                    "ROLLBACK",
                );


                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "This Razorpay payment is already associated with another order.",
                    },
                    {
                        status: 409,
                    },
                );
            }


            /*
             * Mark payment as successful.
             */
            await client.query(
                `
                    UPDATE payments
                    SET
                        provider_payment_id = $1,
                        status = 'SUCCESS',
                        signature = $2,
                        updated_at = NOW()
                    WHERE id = $3
                `,
                [
                    razorpayPaymentId,
                    razorpaySignature,
                    payment.id,
                ],
            );


            /*
             * Mark internal order as paid.
             */
            await client.query(
                `
                    UPDATE orders
                    SET
                        status = 'PAID',
                        paid_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                `,
                [orderId],
            );


            await client.query(
                "COMMIT",
            );
        } catch (error) {
            try {
                await client.query(
                    "ROLLBACK",
                );
            } catch {
                // Ignore rollback errors.
            }

            throw error;
        } finally {
            client.release();
        }


        console.log(
            `Payment verified successfully for order ${order.order_number}`,
        );


        /*
         * Generate tickets only after the
         * order is definitely marked as PAID.
         *
         * generateTicketsForOrder()
         * is idempotent, so retries do not
         * create duplicate tickets.
         */
        const ticketResult =
            await generateTicketsForOrder(
                orderId,
            );


        /*
         * Start email delivery after tickets
         * have been generated.
         *
         * IMPORTANT:
         *
         * We intentionally do not await this.
         *
         * If Resend is slow or unavailable,
         * the payment and ticket generation
         * remain successful.
         */
        void deliverTicketsByEmail(
            orderId,
            ticketResult.tickets,
        );


        return NextResponse.json({
            success: true,
            message:
                "Payment verified and tickets generated.",
            order: {
                id: order.id,
                orderNumber:
                    order.order_number,
                status: "PAID",
            },
            tickets:
                ticketResult.tickets,
        });
    } catch (error) {
        console.error(
            "Razorpay payment verification failed:",
            error,
        );


        return NextResponse.json(
            {
                success: false,
                message:
                    "Unable to verify Razorpay payment.",
            },
            {
                status: 500,
            },
        );
    }
}