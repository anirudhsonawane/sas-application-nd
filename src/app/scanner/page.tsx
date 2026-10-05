"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

type ScanResult = {
    success: boolean;
    result:
        | "VALID"
        | "ALREADY_USED"
        | "CANCELLED"
        | "INVALID";
    message: string;
    ticket?: {
        id: string;
        ticketNumber: string;
        customerName: string;
        ticketType: string;
        amount: number;
        orderNumber: string;
        orderTotal: number;
        status: string;
        usedAt?: string;
    };
};

type ScannerState =
    | "idle"
    | "scanning"
    | "processing"
    | "result";

export default function ScannerPage() {
    const scannerRef = useRef<any>(null);

    const scannerContainerId =
        "ticket-qr-reader";

    /*
     * Prevent multiple QR callbacks from being
     * processed at the same time.
     */
    const processingScanRef =
        useRef(false);

    const [scannerState, setScannerState] =
        useState<ScannerState>("idle");

    const [scanResult, setScanResult] =
        useState<ScanResult | null>(null);

    const [error, setError] = useState("");

    /*
     * Stop and completely clean the scanner.
     */
    const stopScanner = useCallback(
        async () => {
            const scanner =
                scannerRef.current;

            if (!scanner) {
                return;
            }

            try {
                await scanner.stop();
            } catch (stopError) {
                console.warn(
                    "Scanner stop warning:",
                    stopError,
                );
            }

            try {
                scanner.clear();
            } catch (clearError) {
                console.warn(
                    "Scanner clear warning:",
                    clearError,
                );
            }

            scannerRef.current = null;
        },
        [],
    );

    /*
     * Start a fresh scanner.
     */
    const startScanner = useCallback(
        async () => {
            if (processingScanRef.current) {
                return;
            }

            setError("");
            setScanResult(null);
            setScannerState("scanning");

            try {
                const { Html5Qrcode } =
                    await import(
                        "html5-qrcode"
                    );

                /*
                 * Make sure an old scanner is completely
                 * stopped before creating a new one.
                 */
                if (scannerRef.current) {
                    await stopScanner();
                }

                const scanner =
                    new Html5Qrcode(
                        scannerContainerId,
                    );

                scannerRef.current =
                    scanner;

                /*
                 * Camera configuration.
                 *
                 * IMPORTANT:
                 * Do NOT use formatsToSupport here.
                 * It is not supported by the installed
                 * html5-qrcode TypeScript type.
                 */
                await scanner.start(
                    {
                        facingMode:
                            "environment",
                    },
                    {
                        fps: 10,

                        qrbox: {
                            width: 280,
                            height: 280,
                        },

                        aspectRatio: 1,
                    },
                    async (
                        decodedText: string,
                    ) => {
                        /*
                         * Ignore every detection after
                         * the first one.
                         */
                        if (
                            processingScanRef.current
                        ) {
                            return;
                        }

                        processingScanRef.current =
                            true;

                        setScannerState(
                            "processing",
                        );

                        /*
                         * STOP CAMERA IMMEDIATELY.
                         *
                         * This is what prevents the same
                         * QR code from being scanned again.
                         */
                        await stopScanner();

                        await validateTicket(
                            decodedText,
                        );
                    },
                    () => {
                        /*
                         * Ignore continuous scan
                         * failures while searching.
                         */
                    },
                );
            } catch (startError) {
                console.error(
                    "Unable to start QR scanner:",
                    startError,
                );

                processingScanRef.current =
                    false;

                setScannerState("idle");

                setError(
                    "Unable to access the camera. Please allow camera permission and try again.",
                );
            }
        },
        [stopScanner],
    );

    /*
     * Send scanned QR data to backend.
     */
    const validateTicket = async (
        decodedText: string,
    ) => {
        try {
            let qrData: {
                ticketNumber?: string;
                token?: string;
            };

            /*
             * QR contains JSON:
             *
             * {
             *   ticketNumber: "...",
             *   token: "..."
             * }
             */
            try {
                qrData = JSON.parse(
                    decodedText,
                );
            } catch {
                setScanResult({
                    success: false,
                    result: "INVALID",
                    message:
                        "This QR code is not a valid event ticket.",
                });

                setScannerState("result");

                return;
            }

            if (
                !qrData.ticketNumber ||
                !qrData.token
            ) {
                setScanResult({
                    success: false,
                    result: "INVALID",
                    message:
                        "This QR code does not contain valid ticket information.",
                });

                setScannerState("result");

                return;
            }

            const response =
                await fetch(
                    "/api/tickets/validate",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify({
                            ticketNumber:
                                qrData.ticketNumber,

                            token:
                                qrData.token,
                        }),
                    },
                );

            const result =
                (await response.json()) as ScanResult;

            setScanResult(result);

            setScannerState("result");
        } catch (validationError) {
            console.error(
                "Ticket validation error:",
                validationError,
            );

            setScanResult({
                success: false,
                result: "INVALID",
                message:
                    "Unable to validate this ticket. Please try again.",
            });

            setScannerState("result");
        }
    };

    /*
     * Start the next scan only when the staff
     * explicitly presses SCAN NEXT.
     */
    const handleScanNext =
        async () => {
            processingScanRef.current =
                false;

            setScanResult(null);
            setError("");

            /*
             * Give the browser a moment to release
             * the previous camera stream.
             */
            await new Promise(
                (resolve) =>
                    setTimeout(
                        resolve,
                        250,
                    ),
            );

            await startScanner();
        };

    /*
     * Start scanner when page loads.
     */
    useEffect(() => {
        startScanner();

        return () => {
            processingScanRef.current =
                true;

            stopScanner();
        };
    }, [
        startScanner,
        stopScanner,
    ]);

    const isAllowed =
        scanResult?.result === "VALID";

    return (
        <main className="min-h-screen bg-neutral-950 px-4 py-6 text-white sm:px-6">
            <div className="mx-auto max-w-2xl">
                {/* HEADER */}

                <div className="mb-6 text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
                        Event Entry
                    </p>

                    <h1 className="mt-2 text-3xl font-bold tracking-tight">
                        Ticket Scanner
                    </h1>

                    <p className="mt-2 text-sm text-white/50">
                        Scan one ticket at a
                        time
                    </p>
                </div>

                {/* SCANNER */}

                {scannerState !==
                    "result" && (
                    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
                        <div className="p-4">
                            <div
                                id={
                                    scannerContainerId
                                }
                                className="overflow-hidden rounded-2xl"
                            />
                        </div>

                        {scannerState ===
                            "processing" && (
                            <div className="border-t border-white/10 px-5 py-5 text-center">
                                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white" />

                                <p className="font-semibold">
                                    Checking
                                    ticket...
                                </p>

                                <p className="mt-1 text-sm text-white/50">
                                    Please
                                    wait
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="mx-4 mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center text-sm text-red-300">
                                {error}
                            </div>
                        )}
                    </section>
                )}

                {/* RESULT CARD */}

                {scannerState ===
                    "result" &&
                    scanResult && (
                        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl">
                            {/* STATUS */}

                            <div
                                className={`px-6 py-8 text-center ${
                                    isAllowed
                                        ? "bg-emerald-500/10"
                                        : "bg-red-500/10"
                                }`}
                            >
                                <div
                                    className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl ${
                                        isAllowed
                                            ? "bg-emerald-500/15"
                                            : "bg-red-500/15"
                                    }`}
                                >
                                    {isAllowed
                                        ? "✓"
                                        : "✕"}
                                </div>

                                <h2
                                    className={`mt-5 text-3xl font-bold ${
                                        isAllowed
                                            ? "text-emerald-400"
                                            : "text-red-400"
                                    }`}
                                >
                                    {isAllowed
                                        ? "ENTRY ALLOWED"
                                        : "ENTRY DENIED"}
                                </h2>

                                <p className="mt-2 text-sm text-white/50">
                                    {
                                        scanResult.message
                                    }
                                </p>
                            </div>

                            {/* TICKET DETAILS */}

                            {scanResult.ticket && (
                                <div className="p-6">
                                    <div className="rounded-2xl border border-white/10 bg-black/20">
                                        <DetailRow
                                            label="Ticket ID"
                                            value={
                                                scanResult
                                                    .ticket
                                                    .ticketNumber
                                            }
                                            mono
                                        />

                                        <DetailRow
                                            label="Customer"
                                            value={
                                                scanResult
                                                    .ticket
                                                    .customerName
                                            }
                                        />

                                        <DetailRow
                                            label="Ticket Type"
                                            value={
                                                scanResult
                                                    .ticket
                                                    .ticketType
                                            }
                                        />

                                        <DetailRow
                                            label="Amount"
                                            value={`₹${scanResult.ticket.amount.toLocaleString(
                                                "en-IN",
                                            )}`}
                                        />

                                        <DetailRow
                                            label="Order"
                                            value={
                                                scanResult
                                                    .ticket
                                                    .orderNumber
                                            }
                                            mono
                                        />

                                        <DetailRow
                                            label="Status"
                                            value={
                                                scanResult
                                                    .ticket
                                                    .status
                                            }
                                            last
                                        />
                                    </div>
                                </div>
                            )}

                            {/* SCAN NEXT */}

                            <div className="border-t border-white/10 p-6">
                                <button
                                    type="button"
                                    onClick={
                                        handleScanNext
                                    }
                                    className="w-full rounded-2xl bg-white px-5 py-4 text-base font-bold text-black transition hover:bg-white/90 active:scale-[0.99]"
                                >
                                    SCAN NEXT
                                </button>

                                <p className="mt-3 text-center text-xs text-white/35">
                                    Camera will
                                    start again
                                    when you
                                    press this
                                    button.
                                </p>
                            </div>
                        </section>
                    )}

                {/* SCAN INSTRUCTION */}

                {scannerState ===
                    "scanning" && (
                    <p className="mt-5 text-center text-sm text-white/40">
                        Position the QR code
                        inside the scanning
                        box
                    </p>
                )}
            </div>
        </main>
    );
}

function DetailRow({
    label,
    value,
    mono = false,
    last = false,
}: {
    label: string;
    value: string;
    mono?: boolean;
    last?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between gap-5 px-5 py-4 ${
                !last
                    ? "border-b border-white/10"
                    : ""
            }`}
        >
            <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-white/40">
                {label}
            </span>

            <span
                className={`text-right text-sm font-semibold ${
                    mono
                        ? "break-all font-mono"
                        : ""
                }`}
            >
                {value}
            </span>
        </div>
    );
}