'use client';

/**
 * Share-link payment page
 *
 * Target of admin-generated Razorpay share links for club / student /
 * state-secretary / district-secretary registrations. The URL encodes a
 * pre-created Razorpay order plus the registrant's name, uid and type:
 *
 *   /register/payment?orderId=...&amount=...&name=...&uid=...&type=club&key=rzp_live_...
 *
 * The page loads Razorpay checkout.js, opens the checkout modal for the
 * pre-created order, and on success calls the type-specific verify endpoint.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, CheckCircle, CreditCard, Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';

type RegistrationType = 'club' | 'student' | 'state-secretary' | 'district-secretary';

// Maps the URL `type` param to the public verify endpoint for that registration.
// All four endpoints accept { razorpay_order_id, razorpay_payment_id, razorpay_signature }.
const VERIFY_ENDPOINT: Record<RegistrationType, string> = {
    'club': '/clubs/verify',
    'student': '/affiliations/student/verify',
    'state-secretary': '/state-secretaries/verify',
    'district-secretary': '/affiliations/district-secretary/verify',
};

const TYPE_LABEL: Record<RegistrationType, string> = {
    'club': 'Club Affiliation',
    'student': 'Student Registration',
    'state-secretary': 'State Secretary',
    'district-secretary': 'District Secretary',
};

function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && (window as any).Razorpay) {
            resolve(true);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

function PaymentContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const orderId = searchParams.get('orderId') || '';
    const amountParam = searchParams.get('amount') || '';
    const name = searchParams.get('name') || '';
    const uid = searchParams.get('uid') || '';
    const typeParam = (searchParams.get('type') || '') as RegistrationType;
    const key = searchParams.get('key') || '';
    const email = searchParams.get('email') || '';
    const phone = searchParams.get('phone') || '';

    const amount = Number(amountParam) || 0;
    const validType = (Object.keys(VERIFY_ENDPOINT) as RegistrationType[]).includes(typeParam);

    const [status, setStatus] = useState<'idle' | 'loading' | 'verifying' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    const missingParams = !orderId || !amount || !key || !validType;

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(value);

    const handlePay = useCallback(async () => {
        if (missingParams) return;
        setStatus('loading');
        setError(null);

        const loaded = await loadRazorpayScript();
        if (!loaded) {
            setStatus('error');
            setError('Failed to load payment gateway. Please check your connection and try again.');
            return;
        }

        const checkoutOptions = {
            key,
            amount,
            currency: 'INR',
            name: 'Speed Skating Federation of India',
            description: TYPE_LABEL[typeParam],
            order_id: orderId,
            prefill: {
                name,
                email: email || undefined,
                contact: phone || undefined,
            },
            theme: { color: '#10B981' },
            handler: async (resp: any) => {
                try {
                    setStatus('verifying');
                    const verifyUrl = VERIFY_ENDPOINT[typeParam];
                    await api.post(verifyUrl, {
                        razorpay_order_id: resp.razorpay_order_id,
                        razorpay_payment_id: resp.razorpay_payment_id,
                        razorpay_signature: resp.razorpay_signature,
                    });
                    setStatus('success');
                    // Redirect to success page with registrant's UID
                    setTimeout(() => {
                        router.push(
                            `/register/success?type=${encodeURIComponent(typeParam)}&uid=${encodeURIComponent(uid)}`
                        );
                    }, 1500);
                } catch (err: any) {
                    setStatus('error');
                    setError(
                        err?.response?.data?.message ||
                            err?.message ||
                            'Payment verification failed. Please contact support.'
                    );
                }
            },
            modal: {
                ondismiss: () => {
                    // User closed the Razorpay modal without paying
                    setStatus('idle');
                },
                escape: false,
                backdropclose: false,
            },
        };

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const razorpay = new (window as any).Razorpay(checkoutOptions);
            razorpay.on('payment.failed', (response: any) => {
                setStatus('error');
                setError(response?.error?.description || 'Payment failed. Please try again.');
            });
            razorpay.open();
        } catch (err: any) {
            setStatus('error');
            setError(err?.message || 'Failed to open payment gateway.');
        }
    }, [amount, email, key, missingParams, name, orderId, phone, router, typeParam, uid]);

    // Invalid link state
    if (missingParams) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Invalid Payment Link</h2>
                <p className="text-slate-400 mb-6 max-w-md">
                    This payment link is missing required information or has been corrupted.
                    Please request a fresh link from your SSFI admin.
                </p>
                <Link href="/" className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Go Home
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 py-12">
            <div className="container mx-auto px-4 max-w-md">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 text-sm"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Home
                </Link>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
                >
                    <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-600" />

                    <div className="p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider">SSFI Payment</p>
                                <h1 className="text-lg font-semibold text-white">{TYPE_LABEL[typeParam]}</h1>
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 mb-6 space-y-3">
                            {name && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Name</span>
                                    <span className="text-sm text-white font-medium">{name}</span>
                                </div>
                            )}
                            {uid && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">UID</span>
                                    <span className="text-sm text-white font-mono">{uid}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                                <span className="text-sm text-slate-400">Amount</span>
                                <span className="text-xl font-bold text-emerald-400">
                                    {formatCurrency(amount / 100)}
                                </span>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-2"
                            >
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </motion.div>
                        )}

                        {/* Success */}
                        {status === 'success' && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 flex items-center gap-3"
                            >
                                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold text-sm">Payment successful!</p>
                                    <p className="text-xs text-emerald-400/70">Redirecting...</p>
                                </div>
                            </motion.div>
                        )}

                        {/* Pay button */}
                        <button
                            type="button"
                            onClick={handlePay}
                            disabled={status === 'loading' || status === 'verifying' || status === 'success'}
                            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium flex items-center justify-center gap-2 shadow-lg transition-all"
                        >
                            {status === 'loading' ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" /> Opening Razorpay...
                                </>
                            ) : status === 'verifying' ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" /> Verifying payment...
                                </>
                            ) : status === 'success' ? (
                                <>
                                    <CheckCircle className="w-5 h-5" /> Paid
                                </>
                            ) : (
                                <>
                                    <CreditCard className="w-5 h-5" /> Pay {formatCurrency(amount / 100)}
                                </>
                            )}
                        </button>

                        <p className="text-xs text-slate-500 text-center mt-4">
                            Secure payment powered by Razorpay
                        </p>
                    </div>
                </motion.div>

                {/* Help */}
                <p className="text-center text-xs text-slate-500 mt-6">
                    Need help? Contact{' '}
                    <a href="mailto:info@ssfiskate.com" className="text-emerald-400 hover:text-emerald-300">
                        info@ssfiskate.com
                    </a>
                </p>
            </div>
        </div>
    );
}

export default function RegisterPaymentPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
            }
        >
            <PaymentContent />
        </Suspense>
    );
}
