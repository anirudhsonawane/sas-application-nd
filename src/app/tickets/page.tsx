"use client";

import { useEffect, useMemo, useState } from "react";

type TicketType = {
    id: string;
    name: string;
    description: string | null;
    price: string;
    available_quantity: number;
    max_per_order: number;
};

type SelectedTickets = Record<string, number>;

export default function TicketsPage() {
    const [tickets, setTickets] = useState<TicketType[]>([]);
    const [quantities, setQuantities] = useState<SelectedTickets>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function loadTickets() {
            try {
                const response = await fetch("/api/tickets");

                if (!response.ok) {
                    throw new Error("Failed to load tickets");
                }

                const data = await response.json();

                if (!data.success) {
                    throw new Error(
                        data.message || "Failed to load tickets",
                    );
                }

                setTickets(data.tickets);
            } catch (error) {
                console.error(error);

                setError(
                    "Unable to load tickets. Please try again.",
                );
            } finally {
                setLoading(false);
            }
        }

        loadTickets();
    }, []);

    function updateQuantity(
        ticket: TicketType,
        change: number,
    ) {
        setQuantities((current) => {
            const currentQuantity =
                current[ticket.id] ?? 0;

            const maximum = Math.min(
                ticket.max_per_order,
                ticket.available_quantity,
            );

            const nextQuantity = Math.max(
                0,
                Math.min(
                    maximum,
                    currentQuantity + change,
                ),
            );

            return {
                ...current,
                [ticket.id]: nextQuantity,
            };
        });
    }

    const selectedItems = useMemo(() => {
        return tickets
            .map((ticket) => ({
                ...ticket,
                quantity: quantities[ticket.id] ?? 0,
            }))
            .filter((ticket) => ticket.quantity > 0);
    }, [tickets, quantities]);

    const totalQuantity = selectedItems.reduce(
        (total, ticket) =>
            total + ticket.quantity,
        0,
    );

    const totalAmount = selectedItems.reduce(
        (total, ticket) =>
            total +
            Number(ticket.price) *
                ticket.quantity,
        0,
    );

    function continueToCheckout() {
        if (selectedItems.length === 0) {
            return;
        }

        const checkoutData = selectedItems.map(
            (ticket) => ({
                ticketTypeId: ticket.id,
                quantity: ticket.quantity,
            }),
        );

        sessionStorage.setItem(
            "ticket-selection",
            JSON.stringify(checkoutData),
        );

        window.location.href = "/checkout";
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-white px-5 py-10">
                <div className="mx-auto max-w-5xl">
                    <div className="animate-pulse">
                        <div className="mb-4 h-10 w-64 rounded-lg bg-gray-200" />

                        <div className="mb-10 h-5 w-96 max-w-full rounded bg-gray-200" />

                        <div className="grid gap-5 md:grid-cols-3">
                            {[1, 2, 3].map(
                                (item) => (
                                    <div
                                        key={item}
                                        className="h-64 rounded-2xl bg-gray-100"
                                    />
                                ),
                            )}
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-white px-5">
                <div className="text-center">
                    <h1 className="text-2xl font-semibold text-gray-900">
                        Something went wrong
                    </h1>

                    <p className="mt-2 text-gray-500">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            window.location.reload()
                        }
                        className="mt-6 rounded-xl bg-black px-6 py-3 text-sm font-medium text-white"
                    >
                        Try Again
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#f7f7f7] text-gray-950">
            {/* Header */}

            <section className="border-b border-gray-200 bg-white">
                <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
                    <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                        Tickets
                    </p>

                    <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                        Choose your ticket
                    </h1>

                    <p className="mt-3 max-w-2xl text-gray-500">
                        Select your ticket category
                        and quantity. You can review
                        everything before making your
                        payment.
                    </p>
                </div>
            </section>

            {/* Ticket Categories */}

            <section className="mx-auto max-w-6xl px-5 py-8 pb-32 sm:px-8">
                {tickets.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
                        <h2 className="text-xl font-semibold">
                            Tickets are currently
                            unavailable
                        </h2>

                        <p className="mt-2 text-gray-500">
                            Please check again later.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-5 md:grid-cols-3">
                        {tickets.map(
                            (ticket) => {
                                const quantity =
                                    quantities[
                                        ticket.id
                                    ] ?? 0;

                                const maximum =
                                    Math.min(
                                        ticket.max_per_order,
                                        ticket.available_quantity,
                                    );

                                return (
                                    <article
                                        key={
                                            ticket.id
                                        }
                                        className={`rounded-2xl border bg-white p-6 transition ${
                                            quantity >
                                            0
                                                ? "border-black shadow-lg"
                                                : "border-gray-200"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h2 className="text-2xl font-semibold">
                                                    {
                                                        ticket.name
                                                    }
                                                </h2>

                                                {ticket.description && (
                                                    <p className="mt-2 text-sm leading-6 text-gray-500">
                                                        {
                                                            ticket.description
                                                        }
                                                    </p>
                                                )}
                                            </div>

                                            {quantity >
                                                0 && (
                                                <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                                                    Selected
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-8">
                                            <p className="text-3xl font-semibold">
                                                ₹
                                                {Number(
                                                    ticket.price,
                                                ).toLocaleString(
                                                    "en-IN",
                                                )}
                                            </p>

                                            <p className="mt-1 text-sm text-gray-500">
                                                {
                                                    ticket.available_quantity
                                                }{" "}
                                                available
                                            </p>
                                        </div>

                                        {/* Quantity */}

                                        <div className="mt-7 flex items-center justify-between rounded-xl border border-gray-200 p-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    updateQuantity(
                                                        ticket,
                                                        -1,
                                                    )
                                                }
                                                disabled={
                                                    quantity ===
                                                    0
                                                }
                                                className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                −
                                            </button>

                                            <div className="text-center">
                                                <p className="text-lg font-semibold">
                                                    {
                                                        quantity
                                                    }
                                                </p>

                                                <p className="text-xs text-gray-400">
                                                    quantity
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    updateQuantity(
                                                        ticket,
                                                        1,
                                                    )
                                                }
                                                disabled={
                                                    quantity >=
                                                    maximum
                                                }
                                                className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                +
                                            </button>
                                        </div>

                                        <p className="mt-3 text-center text-xs text-gray-400">
                                            Maximum{" "}
                                            {
                                                ticket.max_per_order
                                            }{" "}
                                            per order
                                        </p>
                                    </article>
                                );
                            },
                        )}
                    </div>
                )}
            </section>

            {/* Bottom Checkout Bar */}

            {selectedItems.length > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur">
                    <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
                        <div>
                            <p className="text-sm text-gray-500">
                                {totalQuantity}{" "}
                                {totalQuantity ===
                                1
                                    ? "ticket"
                                    : "tickets"}
                            </p>

                            <p className="text-xl font-semibold">
                                ₹
                                {totalAmount.toLocaleString(
                                    "en-IN",
                                    {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    },
                                )}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={
                                continueToCheckout
                            }
                            className="rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}