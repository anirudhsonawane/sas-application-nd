"use client";

import { useEffect, useState } from "react";

type Ticket = {
    id: string;
    ticketNumber: string;
    ticketTypeName: string;
    customerName: string;
    qrCodeDataUrl: string;
};

type OrderResponse = {
    success: boolean;
    message?: string;
    order?: {
        id: string;
        orderNumber: string;
        status: string;
    };
    tickets?: Ticket[];
};

type SuccessContentProps = {
    orderId: string;
};

export default function SuccessContent({
    orderId,
}: SuccessContentProps) {
    const [data, setData] = useState<OrderResponse | null>(
        null,
    );

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function loadTickets() {
            try {
                const response = await fetch(
                    `/api/tickets/${encodeURIComponent(orderId)}`,
                    {
                        method: "GET",
                        cache: "no-store",
                    },
                );

                const result =
                    (await response.json()) as OrderResponse;

                if (cancelled) {
                    return;
                }

                if (!response.ok || !result.success) {
                    throw new Error(
                        result.message ||
                            "Unable to load your tickets.",
                    );
                }

                setData(result);
            } catch (requestError) {
                if (cancelled) {
                    return;
                }

                console.error(
                    "Failed to load tickets:",
                    requestError,
                );

                setError(
                    requestError instanceof Error
                        ? requestError.message
                        : "Unable to load your tickets.",
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadTickets();

        return () => {
            cancelled = true;
        };
    }, [orderId]);

    if (loading) {
        return (
            <main className="min-h-screen bg-neutral-950 px-6 py-16 text-white">
                <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center">
                    <div className="text-center">
                        <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />

                        <h1 className="text-xl font-semibold">
                            Preparing your tickets...
                        </h1>

                        <p className="mt-2 text-sm text-white/50">
                            Please don't close this page.
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    if (error || !data?.tickets?.length) {
        return (
            <main className="min-h-screen bg-neutral-950 px-6 py-16 text-white">
                <div className="mx-auto max-w-2xl">
                    <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-8 text-center">
                        <div className="mb-5 text-4xl">
                            ⚠️
                        </div>

                        <h1 className="text-2xl font-semibold">
                            We couldn't load your tickets
                        </h1>

                        <p className="mt-3 text-sm leading-6 text-white/60">
                            {error ||
                                "No tickets were found for this order."}
                        </p>

                        <button
                            type="button"
                            onClick={() =>
                                window.location.reload()
                            }
                            className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-neutral-950 px-4 py-10 text-white sm:px-6">
            <div className="mx-auto max-w-4xl">
                <div className="mb-10 text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-3xl">
                        ✓
                    </div>

                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
                        Payment Successful
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        Your tickets are ready
                    </h1>

                    {data.order && (
                        <p className="mt-3 text-sm text-white/50">
                            Order #{data.order.orderNumber}
                        </p>
                    )}
                </div>

                <div className="space-y-6">
                    {data.tickets.map((ticket, index) => (
                        <article
                            key={ticket.id}
                            className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl"
                        >
                            <div className="grid gap-0 md:grid-cols-[1fr_240px]">
                                <div className="p-6 sm:p-8">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">
                                                Ticket {index + 1}
                                            </p>

                                            <h2 className="mt-2 text-2xl font-bold">
                                                {
                                                    ticket.ticketTypeName
                                                }
                                            </h2>
                                        </div>

                                        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                                            ISSUED
                                        </span>
                                    </div>

                                    <div className="mt-8 space-y-5">
                                        <div>
                                            <p className="text-xs uppercase tracking-wider text-white/40">
                                                Name
                                            </p>

                                            <p className="mt-1 font-medium">
                                                {
                                                    ticket.customerName
                                                }
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-xs uppercase tracking-wider text-white/40">
                                                Ticket Number
                                            </p>

                                            <p className="mt-1 break-all font-mono text-sm">
                                                {
                                                    ticket.ticketNumber
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-8 border-t border-dashed border-white/10 pt-5">
                                        <p className="text-xs leading-5 text-white/40">
                                            Present this QR code at
                                            the event entrance.
                                            Each QR code can be
                                            validated individually.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col items-center justify-center border-t border-white/10 bg-white p-6 md:border-l md:border-t-0">
                                    <img
                                        src={
                                            ticket.qrCodeDataUrl
                                        }
                                        alt={`QR code for ticket ${ticket.ticketNumber}`}
                                        className="h-44 w-44 rounded-xl"
                                    />

                                    <p className="mt-4 text-center text-xs font-medium text-black/60">
                                        Scan at entry
                                    </p>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>

                <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                    <p className="text-sm text-white/60">
                        Your ticket has been generated
                        successfully.
                    </p>

                    <p className="mt-1 text-xs text-white/35">
                        Email and WhatsApp delivery will be
                        available shortly.
                    </p>
                </div>
            </div>
        </main>
    );
}