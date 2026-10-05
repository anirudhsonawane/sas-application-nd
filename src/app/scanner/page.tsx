"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

type ScannerStatus =
    | "starting"
    | "ready"
    | "processing"
    | "result"
    | "error";

type TicketResult = {
    id: string;
    ticketNumber: string;
    customerName: string;
    ticketType: string;
    amount: number;
    orderNumber: string;
    orderTotal: number;
    status: string;
};

type ValidationResponse = {
    success: boolean;
    result?: "VALID" | "ALREADY_USED" | "CANCELLED" | "INVALID";
    message: string;
    ticket?: TicketResult;
};

export default function ScannerPage() {
    const scannerRef = useRef<Html5Qrcode | null>(null);

    /**
     * Prevents the same QR from being processed repeatedly.
     *
     * IMPORTANT:
     * This does NOT stop the camera.
     *
     * The camera continues running while the result popup
     * is displayed.
     */
    const processingScanRef = useRef(false);

    const [scannerStatus, setScannerStatus] =
        useState<ScannerStatus>("starting");

    const [result, setResult] =
        useState<ValidationResponse | null>(null);

    const [error, setError] = useState("");

    const scannerElementId = "ticket-qr-reader";

    /**
     * Validate the scanned ticket.
     */
    const validateTicket = useCallback(
        async (decodedText: string) => {
            try {
                let qrData: {
                    ticketNumber?: string;
                    token?: string;
                };

                try {
                    qrData = JSON.parse(decodedText);
                } catch {
                    setResult({
                        success: false,
                        result: "INVALID",
                        message: "Invalid QR code format.",
                    });

                    setScannerStatus("result");

                    return;
                }

                if (!qrData.ticketNumber || !qrData.token) {
                    setResult({
                        success: false,
                        result: "INVALID",
                        message:
                            "This QR code is not a valid event ticket.",
                    });

                    setScannerStatus("result");

                    return;
                }

                const response = await fetch(
                    "/api/tickets/validate",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            ticketNumber:
                                qrData.ticketNumber,
                            token: qrData.token,
                        }),
                    },
                );

                const data =
                    (await response.json()) as ValidationResponse;

                setResult(data);
                setScannerStatus("result");
            } catch (err) {
                console.error(
                    "Ticket validation error:",
                    err,
                );

                setResult({
                    success: false,
                    result: "INVALID",
                    message:
                        "Unable to verify this ticket. Please try again.",
                });

                setScannerStatus("result");
            }
        },
        [],
    );

    /**
     * Start the camera.
     *
     * This runs only once.
     */
    const startScanner = useCallback(async () => {
        if (scannerRef.current) {
            return;
        }

        setScannerStatus("starting");
        setError("");

        try {
            const scanner = new Html5Qrcode(
                scannerElementId,
            );

            scannerRef.current = scanner;

            await scanner.start(
                {
                    facingMode: "environment",
                },
                {
                    fps: 10,
                    qrbox: {
                        width: 280,
                        height: 280,
                    },
                    aspectRatio: 1,
                },
                async (decodedText: string) => {
                    /**
                     * VERY IMPORTANT:
                     *
                     * Once a QR is detected, lock processing.
                     *
                     * We DO NOT stop the camera.
                     */
                    if (processingScanRef.current) {
                        return;
                    }

                    processingScanRef.current = true;

                    setScannerStatus("processing");

                    await validateTicket(decodedText);
                },
                () => {
                    /**
                     * Normal scanning errors are ignored.
                     *
                     * html5-qrcode continuously calls this
                     * while searching for a QR code.
                     */
                },
            );

            setScannerStatus("ready");
        } catch (err) {
            console.error(
                "Camera initialization error:",
                err,
            );

            scannerRef.current = null;

            setScannerStatus("error");

            setError(
                "Unable to start the camera. Please allow camera permission and try again.",
            );
        }
    }, [validateTicket]);

    /**
     * SCAN NEXT
     *
     * The camera is already running.
     *
     * We only clear the result and unlock QR processing.
     */
    const handleScanNext = () => {
        setResult(null);
        setError("");

        processingScanRef.current = false;

        setScannerStatus("ready");
    };

    /**
     * Start scanner when page loads.
     *
     * Stop/clear ONLY when leaving the scanner page.
     */
    useEffect(() => {
        startScanner();

        return () => {
            const scanner = scannerRef.current;

            if (!scanner) {
                return;
            }

            scanner
                .stop()
                .catch(() => {
                    // Scanner may already be stopped.
                })
                .finally(() => {
                    try {
                        scanner.clear();
                    } catch {
                        // Ignore cleanup errors.
                    }

                    scannerRef.current = null;
                });
        };
    }, [startScanner]);

    const isAllowed =
        result?.success &&
        result.result === "VALID";

    const isAlreadyUsed =
        result?.result === "ALREADY_USED";

    const isCancelled =
        result?.result === "CANCELLED";

    return (
        <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
            <div className="mx-auto max-w-5xl">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-2xl font-bold sm:text-3xl">
                                Ticket Scanner
                            </h1>

                            <p className="mt-1 text-sm text-slate-400">
                                Scan event tickets for entry
                                verification.
                            </p>
                        </div>

                        {/* Camera status */}
                        <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm">
                            <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                    scannerStatus === "error"
                                        ? "bg-red-500"
                                        : scannerStatus ===
                                            "processing"
                                          ? "bg-yellow-400"
                                          : "bg-green-500"
                                }`}
                            />

                            <span>
                                {scannerStatus ===
                                    "starting" &&
                                    "Starting camera..."}

                                {scannerStatus ===
                                    "ready" &&
                                    "Camera running"}

                                {scannerStatus ===
                                    "processing" &&
                                    "Verifying ticket..."}

                                {scannerStatus ===
                                    "result" &&
                                    "Camera running"}

                                {scannerStatus === "error" &&
                                    "Camera error"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Scanner */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                    <div
                        id={scannerElementId}
                        className="min-h-[420px] w-full"
                    />

                    {/* Processing overlay */}
                    {scannerStatus === "processing" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5 text-center shadow-2xl">
                                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-white" />

                                <p className="font-semibold">
                                    Verifying ticket
                                </p>

                                <p className="mt-1 text-sm text-slate-400">
                                    Please wait...
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Scanner instructions */}
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
                    {scannerStatus === "ready" && (
                        <>
                            <p className="font-medium">
                                Point the camera at the ticket QR
                                code
                            </p>

                            <p className="mt-1 text-sm text-slate-400">
                                Camera stays active between scans.
                            </p>
                        </>
                    )}

                    {scannerStatus === "processing" && (
                        <p className="text-sm text-slate-300">
                            Checking ticket details...
                        </p>
                    )}

                    {scannerStatus === "result" && (
                        <p className="text-sm text-slate-300">
                            Review the result and press{" "}
                            <strong>SCAN NEXT</strong>.
                        </p>
                    )}

                    {scannerStatus === "starting" && (
                        <p className="text-sm text-slate-400">
                            Starting camera...
                        </p>
                    )}

                    {scannerStatus === "error" && (
                        <p className="text-sm text-red-400">
                            {error}
                        </p>
                    )}
                </div>

                {/* Result popup */}
                {result && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
                            {/* Result header */}
                            <div
                                className={`px-6 py-6 text-center ${
                                    isAllowed
                                        ? "bg-emerald-500/10"
                                        : "bg-red-500/10"
                                }`}
                            >
                                <div
                                    className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
                                        isAllowed
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "bg-red-500/20 text-red-400"
                                    }`}
                                >
                                    {isAllowed ? "✓" : "✕"}
                                </div>

                                <h2
                                    className={`mt-4 text-2xl font-bold ${
                                        isAllowed
                                            ? "text-emerald-400"
                                            : "text-red-400"
                                    }`}
                                >
                                    {isAllowed
                                        ? "ENTRY ALLOWED"
                                        : isAlreadyUsed
                                          ? "ALREADY USED"
                                          : isCancelled
                                            ? "TICKET CANCELLED"
                                            : "ENTRY DENIED"}
                                </h2>

                                <p className="mt-2 text-sm text-slate-400">
                                    {result.message}
                                </p>
                            </div>

                            {/* Ticket details */}
                            {result.ticket && (
                                <div className="space-y-3 px-6 py-5">
                                    <TicketDetail
                                        label="Ticket ID"
                                        value={
                                            result.ticket
                                                .ticketNumber
                                        }
                                    />

                                    <TicketDetail
                                        label="Customer"
                                        value={
                                            result.ticket
                                                .customerName
                                        }
                                    />

                                    <TicketDetail
                                        label="Ticket Type"
                                        value={
                                            result.ticket
                                                .ticketType
                                        }
                                    />

                                    <TicketDetail
                                        label="Amount"
                                        value={`₹${result.ticket.amount.toLocaleString(
                                            "en-IN",
                                        )}`}
                                    />

                                    <TicketDetail
                                        label="Order"
                                        value={
                                            result.ticket
                                                .orderNumber
                                        }
                                    />

                                    <TicketDetail
                                        label="Status"
                                        value={
                                            result.ticket.status
                                        }
                                    />
                                </div>
                            )}

                            {/* Scan next */}
                            <div className="border-t border-slate-800 p-5">
                                <button
                                    type="button"
                                    onClick={handleScanNext}
                                    className="w-full rounded-xl bg-white px-5 py-4 text-base font-bold text-slate-950 transition hover:bg-slate-200 active:scale-[0.99]"
                                >
                                    SCAN NEXT
                                </button>

                                <p className="mt-3 text-center text-xs text-slate-500">
                                    Camera is already running.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

function TicketDetail({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <span className="text-sm text-slate-500">
                {label}
            </span>

            <span className="max-w-[65%] break-all text-right text-sm font-semibold text-white">
                {value}
            </span>
        </div>
    );
}