import { NextResponse } from "next/server";

import Razorpay from "razorpay";

import { db } from "@/lib/db";

type RequestBody = {
    orderId: string;
};

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

export async function POST(
    request: Request,
) {
    const client = await db.connect();

    try {
        const body =
            (await request.json()) as RequestBody;

        const orderId =
            body.orderId?.trim();

        if (!orderId) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Order ID is required.",
                },
                {
                    status: 400,
                },
            );
        }

        const keyId =
            getRequiredEnv(
                "RAZORPAY_KEY_ID",
            );

        const keySecret =
            getRequiredEnv(
                "RAZORPAY_KEY_SECRET",
            );

        /*
         * Get our internal order.
         *
         * We NEVER trust the amount sent by
         * the browser.
         */
        const orderResult =
            await client.query(
                `
                    SELECT
                        id,
                        order_number,
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
            orderResult.rows.length === 0
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
         * Payment can only be created
         * for a pending order.
         */
        if (order.status !== "PENDING") {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        `This order cannot be paid because its status is ${order.status}.`,
                },
                {
                    status: 409,
                },
            );
        }

        /*
         * Check order expiry.
         */
        if (
            order.expires_at &&
            new Date(order.expires_at) <
                new Date()
        ) {
            await client.query(
                `
                    UPDATE orders
                    SET
                        status = 'EXPIRED',
                        updated_at = NOW()
                    WHERE id = $1
                      AND status = 'PENDING'
                `,
                [orderId],
            );

            return NextResponse.json(
                {
                    success: false,
                    message:
                        "This order has expired. Please create a new order.",
                },
                {
                    status: 409,
                },
            );
        }

        /*
         * Convert INR amount to paise.
         *
         * Razorpay expects amount in the
         * smallest currency unit.
         */
        const amountInPaise =
            Math.round(
                Number(
                    order.total_amount,
                ) * 100,
            );

        if (
            !Number.isSafeInteger(
                amountInPaise,
            ) ||
            amountInPaise <= 0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Invalid order amount.",
                },
                {
                    status: 400,
                },
            );
        }

        /*
         * Check whether we already created
         * a Razorpay payment order for this
         * internal order.
         *
         * This prevents duplicate Razorpay
         * orders if the user clicks twice.
         */
        const existingPaymentResult =
            await client.query(
                `
                    SELECT
                        provider_order_id,
                        amount,
                        currency,
                        status
                    FROM payments
                    WHERE order_id = $1
                      AND provider = 'RAZORPAY'
                      AND provider_order_id IS NOT NULL
                    ORDER BY created_at DESC
                    LIMIT 1
                `,
                [orderId],
            );

        if (
            existingPaymentResult.rows.length >
            0
        ) {
            const existing =
                existingPaymentResult.rows[0];

            if (
                existing.status !==
                    "FAILED" &&
                Number(existing.amount) ===
                    Number(order.total_amount)
            ) {
                return NextResponse.json({
                    success: true,
                    provider: "RAZORPAY",
                    keyId,
                    paymentOrder: {
                        id:
                            existing.provider_order_id,
                        amount: amountInPaise,
                        currency:
                            order.currency,
                    },
                });
            }
        }

        /*
         * Create Razorpay order.
         */
        const razorpay =
            new Razorpay({
                key_id: keyId,
                key_secret: keySecret,
            });

        const razorpayOrder =
            await razorpay.orders.create({
                amount: amountInPaise,
                currency:
                    order.currency || "INR",
                receipt:
                    order.order_number,
                notes: {
                    internal_order_id:
                        order.id,
                    order_number:
                        order.order_number,
                },
            });

        /*
         * Save the payment record.
         */
        await client.query(
            `
                INSERT INTO payments (
                    order_id,
                    provider,
                    provider_order_id,
                    amount,
                    currency,
                    status
                )
                VALUES (
                    $1,
                    'RAZORPAY',
                    $2,
                    $3,
                    $4,
                    'CREATED'
                )
            `,
            [
                order.id,
                razorpayOrder.id,
                order.total_amount,
                order.currency || "INR",
            ],
        );

        /*
         * Mark our order as being processed.
         */
        await client.query(
            `
                UPDATE orders
                SET
                    status =
                        'PAYMENT_PROCESSING',
                    updated_at = NOW()
                WHERE id = $1
                  AND status = 'PENDING'
            `,
            [order.id],
        );

        return NextResponse.json({
            success: true,
            provider: "RAZORPAY",
            keyId,
            paymentOrder: {
                id:
                    razorpayOrder.id,
                amount:
                    razorpayOrder.amount,
                currency:
                    razorpayOrder.currency,
            },
        });
    } catch (error) {
        console.error(
            "Razorpay order creation failed:",
            error,
        );

        return NextResponse.json(
            {
                success: false,
                message:
                    "Unable to initialize Razorpay payment.",
            },
            {
                status: 500,
            },
        );
    } finally {
        client.release();
    }
}