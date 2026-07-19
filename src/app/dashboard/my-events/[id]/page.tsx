'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Oswald } from 'next/font/google';
import {
    Calendar,
    MapPin,
    AlertCircle,
    ChevronLeft,
    Phone,
    Download,
    ShieldCheck,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { portalService } from '@/services/portal.service';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';

// Condensed, athletic display face for the pass — sporty + official. Self-hosted
// by next/font, so it's loaded before the user clicks download and html2canvas
// rasterises it faithfully.
const oswald = Oswald({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });

// The "mat" colour framing the ticket. Reused for the perforation notches AND the
// html2canvas background so the rounded corners + side-bites blend seamlessly in
// the downloaded PNG.
const MAT = '#e7efeb';

export default function MyEventRegistrationPage() {
    const params = useParams();
    const router = useRouter();
    const { token } = useAuth();
    const [registration, setRegistration] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRegistration = async () => {
            if (!token || !params.id) return;

            try {
                setIsLoading(true);
                const data = await portalService.getMyRegistration(Number(params.id), token);
                setRegistration(data);
            } catch (err: any) {
                console.error('Error fetching registration:', err);
                setError(err.message || 'Failed to load registration details');
                toast.error('Failed to load details');
            } finally {
                setIsLoading(false);
            }
        };

        fetchRegistration();
    }, [params.id, token]);

    const handleDownload = async () => {
        const ticketElement = document.getElementById('ticket-content');
        if (!ticketElement) return;

        try {
            setIsDownloading(true);
            const canvas = await html2canvas(ticketElement, {
                scale: 3, // crisp enough to print
                backgroundColor: MAT, // matches the mat + perforation notches
                useCORS: true,
                logging: false,
            });

            const image = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = image;
            link.download = `${registration.event.name.replace(/\s+/g, '-')}-Ticket.png`;
            link.click();
            toast.success('Ticket downloaded successfully!');
        } catch (err) {
            console.error('Download failed:', err);
            toast.error('Failed to download ticket');
        } finally {
            setIsDownloading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !registration) {
        return (
            <div className="min-h-screen bg-[#f5f6f8] flex flex-col items-center justify-center p-4">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Registration Not Found</h2>
                <p className="text-gray-500 mb-6">{error || "We couldn't find your registration for this event."}</p>
                <button
                    onClick={() => router.back()}
                    className="px-6 py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
                >
                    Go Back
                </button>
            </div>
        );
    }

    const { event, student } = registration;

    // Bib number = the last segment of the SSFI UID, which already carries its own
    // prefix (e.g. "SSFI/BS/TN/26/S5556" -> "S5556"). Split on BOTH "/" and "-" so
    // legacy hyphen-format IDs still work; only a purely-numeric tail gets an "S"
    // prepended. The old code split on "-" only, so the slash-format ID never
    // split and produced "S" + the whole string ("SSSFI/BS/TN/26/S5556").
    const lastIdPart = student.membershipId
        ? student.membershipId.split(/[/-]/).filter(Boolean).pop()
        : '';
    const bibNumber = lastIdPart
        ? (/^\d+$/.test(lastIdPart) ? `S${lastIdPart}` : lastIdPart)
        : 'PENDING';

    const qrData = JSON.stringify({
        eventId: event.id,
        eventName: event.name,
        studentId: student.id,
        membershipId: student.membershipId,
        studentName: student.name,
        bibNumber: bibNumber,
        registrationId: registration.id,
    });

    const eventDate = new Date(event.eventDate);
    const label = 'text-[10px] uppercase tracking-[0.16em] text-slate-400 font-semibold';

    return (
        <div className="min-h-screen bg-[#f5f6f8] pb-20 pt-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto">
                {/* Top bar */}
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors text-sm font-medium"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back to Dashboard
                    </button>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Confirmed Ticket
                    </span>
                </div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    {/* Captured area: mat frame + card */}
                    <div id="ticket-content" className="rounded-[30px] p-4 sm:p-5" style={{ background: MAT }}>
                        <div
                            className="bg-white rounded-[22px] relative"
                            style={{ boxShadow: '0 24px 60px -18px rgba(4, 47, 36, 0.28)' }}
                        >
                            {/* Header */}
                            <div
                                className="relative rounded-t-[22px] overflow-hidden px-7 pt-7 pb-9 text-white"
                                style={{ backgroundImage: 'linear-gradient(135deg, #0f766e 0%, #059669 58%, #10b981 100%)' }}
                            >
                                {/* Solid concentric rings — html2canvas-safe (no blur) */}
                                <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full border-[18px] border-white/10" />
                                <div className="absolute -top-2 -right-4 w-24 h-24 rounded-full border-[10px] border-white/10" />

                                <div className="relative z-10">
                                    <p className={`${oswald.className} text-[11px] uppercase tracking-[0.28em] text-emerald-50/80 mb-2`}>
                                        Official Event Pass
                                    </p>
                                    <h1 className={`${oswald.className} text-2xl sm:text-[30px] font-bold leading-[1.1] mb-6 max-w-[85%]`}>
                                        {event.name}
                                    </h1>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div className="flex items-start gap-2.5">
                                            <Calendar className="w-4 h-4 mt-0.5 shrink-0 text-emerald-100" />
                                            <div>
                                                <p className="text-emerald-50/70 text-[10px] uppercase tracking-[0.14em] font-semibold">Date &amp; Time</p>
                                                <p className="font-semibold text-[15px] leading-snug">
                                                    {eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                </p>
                                                <p className="text-emerald-50/80 text-sm">
                                                    {eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-2.5">
                                            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-emerald-100" />
                                            <div>
                                                <p className="text-emerald-50/70 text-[10px] uppercase tracking-[0.14em] font-semibold">Venue</p>
                                                <p className="font-semibold text-[15px] leading-snug">{event.venue}</p>
                                                <p className="text-emerald-50/80 text-sm">{event.city}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Perforation — notches coloured like the mat so they read as cut-outs */}
                            <div className="relative h-0 z-20">
                                <div className="absolute -left-3 -top-3 w-6 h-6 rounded-full" style={{ background: MAT }} />
                                <div className="absolute -right-3 -top-3 w-6 h-6 rounded-full" style={{ background: MAT }} />
                                <div className="absolute left-6 right-6 top-0 border-t-2 border-dashed border-slate-300" />
                            </div>

                            {/* Body */}
                            <div className="px-7 pt-8 pb-6">
                                <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
                                    {/* QR */}
                                    <div className="shrink-0 text-center">
                                        <div className="bg-white p-3 rounded-2xl border border-slate-200" style={{ boxShadow: '0 4px 14px -6px rgba(15,23,42,0.2)' }}>
                                            <div style={{ width: 128, height: 128 }}>
                                                <QRCode
                                                    size={256}
                                                    style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                                                    value={qrData}
                                                    viewBox="0 0 256 256"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold mt-2.5">Scan at entry</p>
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 w-full space-y-6">
                                        <div className="grid grid-cols-2 gap-5">
                                            <div className="col-span-2 sm:col-span-1">
                                                <p className={label}>Participant</p>
                                                <p className="font-bold text-lg text-slate-900 leading-tight mt-1">{student.name}</p>
                                                <p className="text-xs text-slate-500 font-mono mt-1 break-all">{student.membershipId}</p>
                                            </div>

                                            {/* Bib — the hero number */}
                                            <div className="col-span-2 sm:col-span-1">
                                                <div className="inline-flex flex-col rounded-xl border-2 px-4 py-2.5" style={{ borderColor: '#6ee7b7', background: '#ecfdf5' }}>
                                                    <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: '#047857' }}>Bib No.</span>
                                                    <span className={`${oswald.className} text-[32px] font-bold leading-none mt-1 tracking-wide`} style={{ color: '#064e3b' }}>
                                                        {bibNumber}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-5">
                                            <div>
                                                <p className={label}>Skate Category</p>
                                                <p className="font-semibold text-slate-900 mt-1">{registration.skateCategory}</p>
                                            </div>
                                            <div>
                                                <p className={label}>Races</p>
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {registration.selectedRaces?.map((race: string) => (
                                                        <span
                                                            key={race}
                                                            className="px-2.5 py-1 rounded-md text-xs font-semibold"
                                                            style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #d1fae5' }}
                                                        >
                                                            {race.replace('RACE_', '').replace('_', ' ')}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-7 py-4 rounded-b-[22px] border-t border-slate-100 flex items-center justify-between gap-4" style={{ background: '#fafbfa' }}>
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Organizer · {event.associationName || 'SSFI'}</p>
                                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                        <Phone className="w-3 h-3" /> Speed Skating Federation of India
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                                    <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#059669' }} />
                                    <span className={`${oswald.className} text-[11px] font-semibold uppercase tracking-[0.12em]`} style={{ color: '#047857' }}>
                                        Confirmed
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Actions — OUTSIDE the captured area, so they never appear in the PNG */}
                <div className="flex flex-col items-center gap-3 mt-7">
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="flex items-center gap-2 px-7 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-105"
                        style={{ backgroundImage: 'linear-gradient(135deg, #059669, #0f766e)', boxShadow: '0 12px 26px -10px rgba(5,150,105,0.5)' }}
                    >
                        {isDownloading ? (
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                        {isDownloading ? 'Preparing…' : 'Download Ticket'}
                    </button>
                    <p className="text-center text-slate-500 text-sm">
                        Please show this digital ticket or a printed copy at the event entry.
                    </p>
                </div>
            </div>
        </div>
    );
}
