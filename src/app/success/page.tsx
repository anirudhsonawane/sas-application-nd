import { Suspense } from "react";
import SuccessContent from "./SuccessContent";

type SuccessPageProps = {
    searchParams: Promise<{
        order?: string;
    }>;
};

function SuccessLoading() {
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

export default async function SuccessPage({
    searchParams,
}: SuccessPageProps) {
    const params = await searchParams;
    const orderId = params.order;

    if (!orderId) {
        return (
            <main className="min-h-screen bg-neutral-950 px-6 py-16 text-white">
                <div className="mx-auto max-w-2xl">
                    <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-8 text-center">
                        <div className="mb-5 text-4xl">
                            ⚠️
                        </div>

                        <h1 className="text-2xl font-semibold">
                            Order ID is missing
                        </h1>

                        <p className="mt-3 text-sm text-white/60">
                            We couldn't determine which
                            order to display.
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <Suspense fallback={<SuccessLoading />}>
            <SuccessContent orderId={orderId} />
        </Suspense>
    );
}