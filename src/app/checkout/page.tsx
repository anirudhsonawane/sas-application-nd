"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Ticket = {
    id: string;
    name: string;
    description: string | null;
    price: number | string;
    available_quantity: number;
    max_per_order: number;
};

type SelectedTicket = {
    ticketTypeId: string;
    quantity: number;
};

type CreatedOrder = {
    id: string;
    orderNumber: string;
    totalAmount: string | number;
    currency: string;
    status: string;
    expiresAt: string;
    totalQuantity: number;
};

type RazorpayOrder = {
    id: string;
    amount: number;
    currency: string;
};

type RazorpayResponse = {
    success: boolean;
    provider: string;
    keyId: string;
    paymentOrder: RazorpayOrder;
    message?: string;
};

type RazorpaySuccessResponse = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
};

declare global {
    interface Window {
        Razorpay: new (
            options: RazorpayOptions,
        ) => RazorpayInstance;
    }
}

type RazorpayOptions = {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;

    prefill?: {
        name?: string;
        email?: string;
        contact?: string;
    };

    notes?: {
        [key: string]: string;
    };

    theme?: {
        color?: string;
    };

    modal?: {
        ondismiss?: () => void;
    };

    handler: (
        response: RazorpaySuccessResponse,
    ) => void;
};

type RazorpayInstance = {
    open: () => void;
};

export default function CheckoutPage() {
    const router = useRouter();

    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTickets, setSelectedTickets] =
        useState<SelectedTicket[]>([]);

    const [customerName, setCustomerName] =
        useState("");

    const [customerEmail, setCustomerEmail] =
        useState("");

    const [customerMobile, setCustomerMobile] =
        useState("");

    const [loading, setLoading] =
        useState(true);

    const [submitting, setSubmitting] =
        useState(false);

    const [error, setError] =
        useState("");

    /*
     * Load Razorpay Checkout script.
     */
    useEffect(() => {
        const existingScript =
            document.querySelector(
                'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
            );

        if (existingScript) {
            return;
        }

        const script =
            document.createElement("script");

        script.src =
            "https://checkout.razorpay.com/v1/checkout.js";

        script.async = true;

        document.body.appendChild(script);

        return () => {
            /*
             * Do not remove the script here.
             * This prevents unnecessary reloads
             * during development/HMR.
             */
        };
    }, []);

    /*
     * Load selected tickets from sessionStorage.
     */
    useEffect(() => {
        try {
            const savedSelection =
                sessionStorage.getItem(
                    "ticket-selection",
                );

            console.log(
                "Saved ticket selection:",
                savedSelection,
            );

            if (!savedSelection) {
                router.replace("/tickets");
                return;
            }

            const parsed =
                JSON.parse(savedSelection);

            if (!Array.isArray(parsed)) {
                throw new Error(
                    "Invalid ticket selection.",
                );
            }

            const normalized =
                parsed
                    .map((item) => ({
                        ticketTypeId: String(
                            item.ticketTypeId,
                        ),
                        quantity: Number(
                            item.quantity,
                        ),
                    }))
                    .filter(
                        (item) =>
                            item.ticketTypeId &&
                            item.ticketTypeId !==
                                "undefined" &&
                            item.ticketTypeId !==
                                "null" &&
                            Number.isInteger(
                                item.quantity,
                            ) &&
                            item.quantity > 0,
                    );

            console.log(
                "Normalized selection:",
                normalized,
            );

            if (normalized.length === 0) {
                setError(
                    "No tickets were selected. Please go back and select your tickets.",
                );

                return;
            }

            setSelectedTickets(
                normalized,
            );
        } catch (error) {
            console.error(
                "Failed to read ticket selection:",
                error,
            );

            setError(
                "Unable to load your ticket selection.",
            );
        }
    }, [router]);

    /*
     * Load latest ticket information.
     */
    useEffect(() => {
        async function loadTickets() {
            try {
                const response =
                    await fetch(
                        "/api/tickets",
                        {
                            method: "GET",
                            cache: "no-store",
                        },
                    );

                if (!response.ok) {
                    throw new Error(
                        "Failed to load tickets.",
                    );
                }

                const data =
                    await response.json();

                if (
                    !data.success ||
                    !Array.isArray(
                        data.tickets,
                    )
                ) {
                    throw new Error(
                        "Invalid ticket response.",
                    );
                }

                setTickets(
                    data.tickets,
                );
            } catch (error) {
                console.error(
                    "Failed to load tickets:",
                    error,
                );

                setError(
                    "Unable to load the latest ticket information.",
                );
            } finally {
                setLoading(false);
            }
        }

        loadTickets();
    }, []);

    /*
     * Match selected ticket IDs
     * with database ticket records.
     */
    const orderItems = useMemo(() => {
        return selectedTickets
            .map((selected) => {
                const ticket =
                    tickets.find(
                        (item) =>
                            item.id ===
                            selected.ticketTypeId,
                    );

                if (!ticket) {
                    return null;
                }

                return {
                    ...ticket,
                    quantity:
                        selected.quantity,
                };
            })
            .filter(
                (
                    item,
                ): item is Ticket & {
                    quantity: number;
                } => item !== null,
            );
    }, [
        selectedTickets,
        tickets,
    ]);

    /*
     * Total ticket quantity.
     */
    const totalQuantity =
        useMemo(() => {
            return orderItems.reduce(
                (
                    total,
                    item,
                ) =>
                    total +
                    item.quantity,
                0,
            );
        }, [orderItems]);

    /*
     * Display total.
     *
     * This is NOT trusted by the server.
     * The server recalculates the real amount.
     */
    const totalAmount =
        useMemo(() => {
            return orderItems.reduce(
                (
                    total,
                    item,
                ) =>
                    total +
                    Number(
                        item.price,
                    ) *
                        item.quantity,
                0,
            );
        }, [orderItems]);

    function handleBack() {
        router.push(
            "/tickets",
        );
    }

    /*
     * Verify the payment on our server.
     */
    async function verifyPayment(
        orderId: string,
        response: RazorpaySuccessResponse,
    ) {
        const verifyResponse =
            await fetch(
                "/api/payments/razorpay/verify",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        orderId,
                        razorpayPaymentId:
                            response.razorpay_payment_id,
                        razorpayOrderId:
                            response.razorpay_order_id,
                        razorpaySignature:
                            response.razorpay_signature,
                    }),
                },
            );

        const data =
            await verifyResponse.json();

        if (
            !verifyResponse.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                    "Payment verification failed.",
            );
        }

        /*
         * Payment is now verified by our server.
         */
        sessionStorage.removeItem(
            "ticket-selection",
        );

        sessionStorage.setItem(
            "completed-order",
            JSON.stringify(
                data.order,
            ),
        );

        /*
         * Success page will be
         * created in the next step.
         */
        router.push(
            `/success?order=${encodeURIComponent(
                orderId,
            )}`,
        );
    }

    /*
     * Create order and launch Razorpay.
     */
    async function handleSubmit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");

        if (
            orderItems.length === 0
        ) {
            setError(
                "No tickets are selected. Please go back and select your tickets.",
            );

            return;
        }

        const name =
            customerName.trim();

        const email =
            customerEmail
                .trim()
                .toLowerCase();

        const mobile =
            customerMobile.replace(
                /\D/g,
                "",
            );

        if (!name) {
            setError(
                "Please enter your full name.",
            );

            return;
        }

        if (name.length > 150) {
            setError(
                "Your name is too long.",
            );

            return;
        }

        if (!email) {
            setError(
                "Please enter your email address.",
            );

            return;
        }

        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                email,
            )
        ) {
            setError(
                "Please enter a valid email address.",
            );

            return;
        }

        if (!/^\d{10}$/.test(mobile)) {
            setError(
                "Please enter a valid 10-digit mobile number.",
            );

            return;
        }

        try {
            setSubmitting(true);

            /*
             * STEP 1
             *
             * Create our internal order.
             *
             * The server calculates
             * the real amount.
             */
            const orderResponse =
                await fetch(
                    "/api/orders",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            customerName:
                                name,
                            customerEmail:
                                email,
                            customerMobile:
                                mobile,
                            items:
                                selectedTickets,
                        }),
                    },
                );

            const orderData =
                await orderResponse.json();

            if (
                !orderResponse.ok ||
                !orderData.success
            ) {
                throw new Error(
                    orderData.message ||
                        "Unable to create your order.",
                );
            }

            const order =
                orderData.order as CreatedOrder;

            console.log(
                "Internal order created:",
                order,
            );

            /*
             * STEP 2
             *
             * Ask our server to create
             * the Razorpay order.
             */
            const razorpayResponse =
                await fetch(
                    "/api/payments/razorpay",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            orderId:
                                order.id,
                        }),
                    },
                );

            const razorpayData =
                (await razorpayResponse.json()) as RazorpayResponse;

            if (
                !razorpayResponse.ok ||
                !razorpayData.success
            ) {
                throw new Error(
                    razorpayData.message ||
                        "Unable to initialize Razorpay payment.",
                );
            }

            /*
             * Make sure Razorpay Checkout
             * has loaded.
             */
            if (
                typeof window.Razorpay !==
                "function"
            ) {
                throw new Error(
                    "Razorpay Checkout is still loading. Please try again.",
                );
            }

            /*
             * STEP 3
             *
             * Open Razorpay Checkout.
             */
            const razorpay =
                new window.Razorpay({
                    key:
                        razorpayData.keyId,

                    amount:
                        razorpayData
                            .paymentOrder
                            .amount,

                    currency:
                        razorpayData
                            .paymentOrder
                            .currency,

                    name:
                        "Nav Durga Raas Dandiya",

                    description:
                        `Ticket booking ${order.orderNumber}`,

                    order_id:
                        razorpayData
                            .paymentOrder
                            .id,

                    prefill: {
                        name,
                        email,
                        contact:
                            mobile,
                    },

                    notes: {
                        internal_order_id:
                            order.id,
                        order_number:
                            order.orderNumber,
                    },

                    theme: {
                        color: "#000000",
                    },

                    modal: {
                        ondismiss:
                            () => {
                                setSubmitting(
                                    false,
                                );
                            },
                    },

                    /*
                     * STEP 4
                     *
                     * Razorpay returns these
                     * values after successful
                     * payment.
                     */
                    handler:
                        async (
                            paymentResponse,
                        ) => {
                            try {
                                setSubmitting(
                                    true,
                                );

                                await verifyPayment(
                                    order.id,
                                    paymentResponse,
                                );
                            } catch (
                                error
                            ) {
                                console.error(
                                    "Payment verification error:",
                                    error,
                                );

                                setError(
                                    error instanceof
                                        Error
                                        ? error.message
                                        : "Payment verification failed.",
                                );

                                setSubmitting(
                                    false,
                                );
                            }
                        },
                });

            razorpay.open();
        } catch (error) {
            console.error(
                "Payment initialization failed:",
                error,
            );

            setError(
                error instanceof
                    Error
                    ? error.message
                    : "Unable to start payment. Please try again.",
            );

            setSubmitting(
                false,
            );
        }
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-[#f7f7f7] px-6 py-16">
                <div className="mx-auto max-w-5xl">
                    <p className="text-sm text-gray-500">
                        Loading checkout...
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#f7f7f7]">
            {/* HEADER */}

            <section className="border-b border-gray-200 bg-white">
                <div className="mx-auto max-w-5xl px-6 py-12">
                    <button
                        type="button"
                        onClick={
                            handleBack
                        }
                        className="mb-6 text-sm font-medium text-gray-500 transition hover:text-black"
                    >
                        ← Back to tickets
                    </button>

                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-gray-500">
                        Checkout
                    </p>

                    <h1 className="text-4xl font-semibold tracking-tight text-black">
                        Complete your booking
                    </h1>

                    <p className="mt-3 max-w-xl text-gray-500">
                        Enter your details
                        below. You&apos;ll
                        review everything
                        before making your
                        payment.
                    </p>
                </div>
            </section>

            {/* CONTENT */}

            <section className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[1fr_360px]">
                {/* CUSTOMER FORM */}

                <form
                    onSubmit={
                        handleSubmit
                    }
                    className="rounded-2xl border border-gray-200 bg-white p-7"
                >
                    <div className="mb-8">
                        <h2 className="text-xl font-semibold text-black">
                            Your details
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                            Your tickets
                            will be
                            delivered
                            using these
                            contact
                            details.
                        </p>
                    </div>

                    <div className="space-y-5">
                        {/* NAME */}

                        <div>
                            <label
                                htmlFor="name"
                                className="mb-2 block text-sm font-medium text-gray-800"
                            >
                                Full name
                            </label>

                            <input
                                id="name"
                                type="text"
                                value={
                                    customerName
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setCustomerName(
                                        event
                                            .target
                                            .value,
                                    )
                                }
                                placeholder="Enter your full name"
                                autoComplete="name"
                                maxLength={
                                    150
                                }
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-gray-400 focus:border-black"
                            />
                        </div>

                        {/* EMAIL */}

                        <div>
                            <label
                                htmlFor="email"
                                className="mb-2 block text-sm font-medium text-gray-800"
                            >
                                Email
                                address
                            </label>

                            <input
                                id="email"
                                type="email"
                                value={
                                    customerEmail
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setCustomerEmail(
                                        event
                                            .target
                                            .value,
                                    )
                                }
                                placeholder="you@example.com"
                                autoComplete="email"
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-gray-400 focus:border-black"
                            />
                        </div>

                        {/* MOBILE */}

                        <div>
                            <label
                                htmlFor="mobile"
                                className="mb-2 block text-sm font-medium text-gray-800"
                            >
                                Mobile
                                number
                            </label>

                            <input
                                id="mobile"
                                type="tel"
                                inputMode="numeric"
                                value={
                                    customerMobile
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setCustomerMobile(
                                        event.target.value.replace(
                                            /\D/g,
                                            "",
                                        ),
                                    )
                                }
                                placeholder="10-digit mobile number"
                                maxLength={
                                    10
                                }
                                autoComplete="tel"
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-gray-400 focus:border-black"
                            />
                        </div>
                    </div>

                    {/* ERROR */}

                    {error && (
                        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {/* PAYMENT BUTTON */}

                    <button
                        type="submit"
                        disabled={
                            submitting ||
                            orderItems.length ===
                                0
                        }
                        className="mt-8 w-full rounded-xl bg-black px-5 py-4 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        {submitting
                            ? "Opening payment..."
                            : "Pay ₹" +
                              totalAmount.toLocaleString(
                                  "en-IN",
                              )}
                    </button>
                </form>

                {/* ORDER SUMMARY */}

                <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-7">
                    <div className="mb-6">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
                            Order
                            summary
                        </p>

                        <h2 className="mt-2 text-xl font-semibold text-black">
                            Your tickets
                        </h2>
                    </div>

                    {orderItems.length ===
                    0 ? (
                        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                            No tickets
                            selected.
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {orderItems.map(
                                (
                                    ticket,
                                ) => (
                                    <div
                                        key={
                                            ticket.id
                                        }
                                        className="flex items-start justify-between gap-4"
                                    >
                                        <div>
                                            <p className="font-semibold text-black">
                                                {
                                                    ticket.name
                                                }
                                            </p>

                                            <p className="mt-1 text-sm text-gray-500">
                                                ₹
                                                {Number(
                                                    ticket.price,
                                                ).toLocaleString(
                                                    "en-IN",
                                                )}{" "}
                                                ×{" "}
                                                {
                                                    ticket.quantity
                                                }
                                            </p>
                                        </div>

                                        <p className="font-semibold text-black">
                                            ₹
                                            {(
                                                Number(
                                                    ticket.price,
                                                ) *
                                                ticket.quantity
                                            ).toLocaleString(
                                                "en-IN",
                                            )}
                                        </p>
                                    </div>
                                ),
                            )}
                        </div>
                    )}

                    <div className="my-6 border-t border-gray-200" />

                    <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>
                            Total tickets
                        </span>

                        <span>
                            {
                                totalQuantity
                            }
                        </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                        <span className="font-semibold text-black">
                            Total
                        </span>

                        <span className="text-2xl font-semibold text-black">
                            ₹
                            {totalAmount.toLocaleString(
                                "en-IN",
                            )}
                        </span>
                    </div>
                </aside>
            </section>
        </main>
    );
}