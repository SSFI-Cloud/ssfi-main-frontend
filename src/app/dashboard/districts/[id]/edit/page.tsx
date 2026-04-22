'use client';

/**
 * Admin edit page for a District record.
 *
 * Parallel to /dashboard/states/[id]/edit. Only edits the District row
 * itself: name, code, parent state, logo. Secretary application lives on
 * the new-page / approval flow, not here.
 *
 * Backend: PUT /districts/:id. GLOBAL_ADMIN or STATE_SECRETARY.
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    ArrowLeft, Save, Loader2, AlertCircle, CheckCircle, MapPin,
    ImagePlus, X,
} from 'lucide-react';
import { api } from '@/lib/api/client';

interface FormData {
    name: string;
    code: string;
    stateId: string;
    logo: string;
}

export default function EditDistrictPage() {
    const { id } = useParams();
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [form, setForm] = useState<FormData>({ name: '', code: '', stateId: '', logo: '' });
    const [states, setStates] = useState<any[]>([]);

    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const logoRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!id) return;
        (async () => {
            setIsLoading(true);
            try {
                const [districtRes, statesRes] = await Promise.all([
                    api.get(`/districts/${id}`),
                    api.get('/locations/states'),
                ]);
                // Backend wraps the district in { status, data: { district: {...} } }
                // — earlier code stopped one level too shallow and every
                // field came through undefined.
                const dPayload = districtRes.data?.data ?? districtRes.data;
                const d = dPayload?.district ?? dPayload ?? {};
                // /locations/states returns a bare array under data (no
                // `states` key) — but be defensive in case the shape
                // changes.
                const stPayload = statesRes.data?.data ?? statesRes.data;
                const st = Array.isArray(stPayload)
                    ? stPayload
                    : (stPayload?.states ?? []);
                setForm({
                    name: d.name || '',
                    code: d.code || '',
                    stateId: d.stateId ? String(d.stateId) : '',
                    logo: '',
                });
                if (d.logo) setLogoPreview(d.logo);
                setStates(Array.isArray(st) ? st : []);
            } catch (err: any) {
                setError(err?.response?.data?.message || 'Failed to load district');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [id]);

    const set = (field: keyof FormData, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const onLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setError('Logo must be smaller than 5 MB');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            const b64 = reader.result as string;
            set('logo', b64);
            setLogoPreview(b64);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const payload: Record<string, any> = {
                name: form.name,
                code: form.code,
                stateId: form.stateId ? Number(form.stateId) : undefined,
            };
            if (form.logo) payload.logo = form.logo;

            await api.put(`/districts/${id}`, payload);
            setSuccess(true);
            setTimeout(() => router.push('/dashboard/districts'), 1200);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to update district');
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
                <Link href="/dashboard/districts"
                    className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
                    <ArrowLeft className="w-4 h-4 text-gray-600" />
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Edit District</h1>
                    <p className="text-sm text-gray-500">{form.name || 'Loading…'}</p>
                </div>
            </div>

            {success && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-green-700 font-medium text-sm">District updated. Redirecting…</p>
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
                        <h2 className="font-semibold text-gray-900 text-sm">District details</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>District Name *</label>
                            <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} required />
                        </div>
                        <div>
                            <label className={labelCls}>District Code *</label>
                            <input className={inputCls} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} required />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Parent State *</label>
                            <select className={inputCls} value={form.stateId} onChange={(e) => set('stateId', e.target.value)} required>
                                <option value="">Select state</option>
                                {states.map((s: any) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-500">Reassigning to a different state is allowed but cascades to every club / student under this district.</p>
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>District Logo</label>
                            <FilePicker preview={logoPreview} onPick={() => logoRef.current?.click()} onClear={() => { setLogoPreview(null); set('logo', ''); }} />
                            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
                        </div>
                    </div>
                </section>

                <div className="flex items-center gap-3 pt-2">
                    <button type="submit" disabled={isSaving || success}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <Link href="/dashboard/districts"
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
