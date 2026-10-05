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
        ticketNumber: string;
        customerName: string;
        ticketTypeName: string;
        status?: string;
    };
};

export default function ScannerPage() {
    const scannerRef = useRef<{
        stop: () => Promise<void>;
        clear: () => void;
    } | null>(null);

    const processingRef = useRef(false);

    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState<ScanResult | null>(
        null,
    );
    const [error, setError] = useState("");

    const validateQR = useCallback(
        async (decodedText: string) => {
            if (processingRef.current) {
                return;
            }

            processingRef.current = true;
            setScanning(false);

            try {
                let parsed: {
                    ticketNumber?: unknown;
                    token?: unknown;
                };

                try {
                    parsed = JSON.parse(decodedText);
                } catch {
                    setResult({
                        success: false,
                        result: "INVALID",
                        message:
                            "This is not a valid event ticket QR.",
                    });

                    return;
                }

                const ticketNumber =
                    typeof parsed.ticketNumber ===
                    "string"
                        ? parsed.ticketNumber.trim()
                        : "";

                const token =
                    typeof parsed.token === "string"
                        ? parsed.token.trim()
                        : "";

                if (!ticketNumber || !token) {
                    setResult({
                        success: false,
                        result: "INVALID",
                        message:
                            "Invalid ticket QR code.",
                    });

                    return;
                }

                const response = await fetch(
                    "/api/tickets/validate",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            ticketNumber,
                            token,
                        }),
                    },
                );

                const data =
                    (await response.json()) as ScanResult;

                setResult(data);
            } catch (requestError) {
                console.error(
                    "Ticket validation request failed:",
                    requestError,
                );

                setResult({
                    success: false,
                    result: "INVALID",
                    message:
                        "Unable to contact the ticket server.",
                });
            } finally {
                processingRef.current = false;
            }
        },
        [],
    );

    const startScanner = useCallback(async () => {
        setError("");
        setResult(null);
        setLoading(true);

        try {
            const module = await import(
                "html5-qrcode"
            );

            const Html5Qrcode =
                module.Html5Qrcode;

            const elementId = "ticket-qr-reader";

            const scanner = new Html5Qrcode(
                elementId,
            );

            scannerRef.current = scanner;

            await scanner.start(
                {
                    facingMode: "environment",
                },
                {
                    fps: 10,
                    qrbox: {
                        width: 250,
                        height: 250,
                    },
                    aspectRatio: 1,
                },
                (decodedText) => {
                    void validateQR(decodedText);
                },
                () => {
                    /*
                     * Ignore normal frame-by-frame
                     * "QR not found" messages.
                     */
                },
            );

            setScanning(true);
        } catch (scannerError) {
            console.error(
                "Unable to start scanner:",
                scannerError,
            );

            setError(
                "Camera could not be started. Please allow camera permission and try again.",
            );
        } finally {
            setLoading(false);
        }
    }, [validateQR]);

    const stopScanner = useCallback(async () => {
        const scanner = scannerRef.current;

        if (!scanner) {
            return;
        }

        try {
            await scanner.stop();
            scanner.clear();
        } catch (scannerError) {
            console.error(
                "Failed to stop scanner:",
                scannerError,
            );
        }

        scannerRef.current = null;
        setScanning(false);
    }, []);

    useEffect(() => {
        void startScanner();

        return () => {
            void stopScanner();
        };
    }, [startScanner, stopScanner]);

    const scanAgain = async () => {
        setResult(null);
        processingRef.current = false;

        await startScanner();
    };

    return (
        <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white sm:px-6">
            <div className="mx-auto max-w-lg">
                {/* Header */}
                <div className="mb-8 text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-emerald-400">
                        Event Entry
                    </p>

                    <h1 className="mt-3 text-3xl font-bold">
                        Ticket Scanner
                    </h1>

                    <p className="mt-2 text-sm text-white/50">
                        Scan the attendee's QR code to
                        validate entry.
                    </p>
                </div>

                {/* Scanner */}
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-3">
                    <div
                        id="ticket-qr-reader"
                        className="overflow-hidden rounded-2xl"
                    />
                </div>

                {loading && (
                    <div className="mt-5 text-center text-sm text-white/50">
                        Starting camera...
                    </div>
                )}

                {scanning && !result && !error && (
                    <div className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-400">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                        Scanner ready — scan QR code
                    </div>
                )}

                {/* Camera error */}
                {error && (
                    <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-center">
                        <p className="text-sm text-red-300">
                            {error}
                        </p>

                        <button
                            type="button"
                            onClick={() => {
                                void startScanner();
                            }}
                            className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"
                        >
                            Start Camera Again
                        </button>
                    </div>
                )}

                {/* Validation result */}
                {result && (
                    <div
                        className={`mt-6 rounded-3xl border p-6 ${
                            result.success
                                ? "border-emerald-500/30 bg-emerald-500/10"
                                : "border-red-500/30 bg-red-500/10"
                        }`}
                    >
                        <div className="text-center">
                            <div className="text-5xl">
                                {result.success
                                    ? "✓"
                                    : "✕"}
                            </div>

                            <h2
                                className={`mt-4 text-2xl font-bold ${
                                    result.success
                                        ? "text-emerald-400"
                                        : "text-red-400"
                                }`}
                            >
                                {result.success
                                    ? "ENTRY ALLOWED"
                                    : "ENTRY DENIED"}
                            </h2>

                            <p className="mt-2 text-sm text-white/60">
                                {result.message}
                            </p>
                        </div>

                        {result.ticket && (
                            <div className="mt-6 space-y-4 rounded-2xl bg-black/20 p-5">
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-white/40">
                                        Ticket
                                    </p>

                                    <p className="mt-1 font-mono text-sm">
                                        {
                                            result.ticket
                                                .ticketNumber
                                        }
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs uppercase tracking-wider text-white/40">
                                        Name
                                    </p>

                                    <p className="mt-1 font-medium">
                                        {
                                            result.ticket
                                                .customerName
                                        }
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs uppercase tracking-wider text-white/40">
                                        Type
                                    </p>

                                    <p className="mt-1 font-medium">
                                        {
                                            result.ticket
                                                .ticketTypeName
                                        }
                                    </p>
                                </div>

                                {result.ticket.status && (
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-white/40">
                                            Status
                                        </p>

                                        <p className="mt-1 font-medium">
                                            {
                                                result.ticket
                                                    .status
                                            }
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                void scanAgain();
                            }}
                            className="mt-6 w-full rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-white/90"
                        >
                            Scan Next Ticket
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}