'use client';

/**
 * Admin edit page for a State record.
 *
 * The existing `/dashboard/states/new` flow registers a state SECRETARY (a
 * big multi-step form). This page is deliberately much smaller — it only
 * edits the State row itself: name, code, logo, website, and the president
 * fields the backend's updateState service accepts. Everything else (the
 * secretary application, students, districts, clubs under this state)
 * stays untouched.
 *
 * Backend: PUT /states/:id. GLOBAL_ADMIN only.
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    ArrowLeft, Save, Loader2, AlertCircle, CheckCircle, MapPin,
    ImagePlus, X, Globe, Crown,
} from 'lucide-react';
import { api } from '@/lib/api/client';

interface FormData {
    name: string;
    code: string;
    website: string;
    presidentName: string;
    // Base64 strings for new uploads; we keep the original URL for preview
    // when the admin hasn't replaced the file yet.
    logo: string;
    presidentPhoto: string;
}

export default function EditStatePage() {
    const { id } = useParams();
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [form, setForm] = useState<FormData>({
        name: '', code: '', website: '',
        presidentName: '', logo: '', presidentPhoto: '',
    });

    // Previews — either a freshly-picked base64 data URI, or the URL the
    // backend stored from a previous save.
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [presidentPreview, setPresidentPreview] = useState<string | null>(null);
    const logoRef = useRef<HTMLInputElement>(null);
    const presidentRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!id) return;
        (async () => {
            setIsLoading(true);
            try {
                const res = await api.get(`/states/${id}`);
                // Backend wraps the state in { status, data: { state: {...} } }
                // so we have to unwrap twice. The earlier `res.data?.data ??
                // res.data` left `s` as `{ state: ... }` and every field
                // came through undefined.
                const payload = res.data?.data ?? res.data;
                const s = payload?.state ?? payload ?? {};
                setForm({
                    name: s.name || '',
                    code: s.code || '',
                    website: s.website || '',
                    presidentName: s.presidentName || '',
                    logo: '',          // only send if admin picks a new file
                    presidentPhoto: '', // same
                });
                if (s.logo) setLogoPreview(s.logo);
                if (s.presidentPhoto) setPresidentPreview(s.presidentPhoto);
            } catch (err: any) {
                setError(err?.response?.data?.message || 'Failed to load state');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [id]);

    const set = (field: keyof FormData, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    // Base64 encode the picked file. 5 MB cap so we don't blow past Railway's
    // edge limit — same pattern used on the events/new page.
    const onFile = (
        e: React.ChangeEvent<HTMLInputElement>,
        field: 'logo' | 'presidentPhoto',
        setPreview: (v: string | null) => void,
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setError('File must be smaller than 5 MB');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            const b64 = reader.result as string;
            set(field, b64);
            setPreview(b64);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            // Only send the fields we actually touched. Sending an empty
            // string for logo would wipe a perfectly good existing logo.
            const payload: Record<string, string> = {
                name: form.name,
                code: form.code,
                website: form.website,
                presidentName: form.presidentName,
            };
            if (form.logo) payload.logo = form.logo;
            if (form.presidentPhoto) payload.presidentPhoto = form.presidentPhoto;

            await api.put(`/states/${id}`, payload);
            setSuccess(true);
            setTimeout(() => router.push('/dashboard/states'), 1200);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to update state');
            setIsSaving(false);
        }
    };

    const inputCls = 'w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm';
    const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide';

    if (isLoading) return (
        <div className="flex items-center justify-center h-96">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-4">
                <Link href="/dashboard/states"
                    className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
                    <ArrowLeft className="w-4 h-4 text-gray-600" />
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Edit State</h1>
                    <p className="text-sm text-gray-500">{form.name || 'Loading…'}</p>
                </div>
            </div>

            {success && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-green-700 font-medium text-sm">State updated. Redirecting…</p>
                </motion.div>
            )}

            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                    <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-white" />
                        </div>
                        <h2 className="font-semibold text-gray-900 text-sm">State details</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>State Name *</label>
                            <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} required />
                        </div>
                        <div>
                            <label className={labelCls}>State Code *</label>
                            <input className={inputCls} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} required />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Website</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input className={`${inputCls} pl-9`} type="url" placeholder="https://…" value={form.website} onChange={(e) => set('website', e.target.value)} />
                            </div>
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Association Logo</label>
                            <FilePicker preview={logoPreview} onPick={() => logoRef.current?.click()} onClear={() => { setLogoPreview(null); set('logo', ''); }} />
                            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, 'logo', setLogoPreview)} />
                        </div>
                    </div>
                </section>

                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                    <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                            <Crown className="w-4 h-4 text-white" />
                        </div>
                        <h2 className="font-semibold text-gray-900 text-sm">President</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>President Name</label>
                            <input className={inputCls} value={form.presidentName} onChange={(e) => set('presidentName', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>President Photo</label>
                            <FilePicker preview={presidentPreview} onPick={() => presidentRef.current?.click()} onClear={() => { setPresidentPreview(null); set('presidentPhoto', ''); }} />
                            <input ref={presidentRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, 'presidentPhoto', setPresidentPreview)} />
                        </div>
                    </div>
                </section>

                <div className="flex items-center gap-3 pt-2">
                    <button type="submit" disabled={isSaving || success}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <Link href="/dashboard/states"
                        className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50">
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}

function FilePicker({ preview, onPick, onClear }: { preview: string | null; onPick: () => void; onClear: () => void }) {
    if (preview) {
        return (
            <div className="relative inline-block">
                <img src={preview} alt="" className="h-24 rounded-xl border border-gray-200 object-cover" />
                <button type="button" onClick={onClear}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50">
                    <X className="w-3 h-3 text-gray-600" />
                </button>
            </div>
        );
    }
    return (
        <button type="button" onClick={onPick}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/50">
            <ImagePlus className="w-4 h-4" />
            Click to upload
        </button>
    );
}
