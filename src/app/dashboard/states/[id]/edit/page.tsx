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
    ImagePlus, X, Globe, Crown, Shield, User, ChevronDown, ChevronUp,
    Mail, Phone,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import DownloadButton from '@/components/shared/DownloadButton';
import { resolveImageUrl } from '@/lib/utils/resolveImageUrl';

interface FormData {
    name: string;
    code: string;
    website: string;
    presidentName: string;
    // Base64 strings for new uploads; we keep the original URL for preview
    // when the admin hasn't replaced the file yet.
    logo: string;
    presidentPhoto: string;
    // Activate / deactivate toggle. Hides the state from public lists
    // without touching any child records.
    isActive: boolean;
}

// Secretary edit form. These fields live on StateSecretary (a separate
// row linked by stateId), not on the State row itself — they save via
// PUT /state-secretaries/:id rather than PUT /states/:id.
interface SecretaryFormData {
    id: string | null;   // null when the state has no approved secretary yet
    name: string;
    gender: string;
    email: string;
    phone: string;
    aadhaarNumber: string;
    associationName: string;
    residentialAddress: string;
    // Base64 strings for freshly picked files; preserved URLs kept in
    // state-level preview fields below.
    identityProof: string;
    profilePhoto: string;
    logo: string;
    associationRegistrationCopy: string;
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
        isActive: true,
    });

    // Secretary edit state. Collapsed by default so the primary State
    // form stays front-and-centre; admins expand it when they actually
    // want to touch secretary data.
    const [secretaryOpen, setSecretaryOpen] = useState(false);
    const [secretary, setSecretary] = useState<SecretaryFormData>({
        id: null, name: '', gender: 'MALE', email: '', phone: '',
        aadhaarNumber: '', associationName: '', residentialAddress: '',
        identityProof: '', profilePhoto: '', logo: '',
        associationRegistrationCopy: '',
    });
    const [secretaryProfilePreview, setSecretaryProfilePreview] = useState<string | null>(null);
    const [secretaryIdProofPreview, setSecretaryIdProofPreview] = useState<string | null>(null);
    const [secretaryLogoPreview, setSecretaryLogoPreview] = useState<string | null>(null);
    const [secretaryRegCopyPreview, setSecretaryRegCopyPreview] = useState<string | null>(null);
    const secretaryProfileRef = useRef<HTMLInputElement>(null);
    const secretaryIdProofRef = useRef<HTMLInputElement>(null);
    const secretaryLogoRef = useRef<HTMLInputElement>(null);
    const secretaryRegCopyRef = useRef<HTMLInputElement>(null);

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
                // so we have to unwrap twice. Also: stateService.getStateById
                // intentionally renames `name` → `state_name` in its response
                // (for legacy reasons — other list endpoints return `name`),
                // so we read either shape to be safe.
                const payload = res.data?.data ?? res.data;
                const s = payload?.state ?? payload ?? {};
                setForm({
                    name: s.state_name || s.name || '',
                    code: s.code || '',
                    website: s.website || '',
                    presidentName: s.presidentName || '',
                    logo: '',          // only send if admin picks a new file
                    presidentPhoto: '', // same
                    // isActive defaults to true; fall back if the response
                    // omits the key so we never accidentally deactivate
                    // a state on save.
                    isActive: s.isActive !== false,
                });
                // Resolve backend-relative paths before stuffing into the
                // preview — raw "uploads/..." would otherwise render as a
                // page-relative URL and 404. data: URIs pass through.
                if (s.logo) setLogoPreview(resolveImageUrl(s.logo));
                if (s.presidentPhoto) setPresidentPreview(resolveImageUrl(s.presidentPhoto));

                // Prime the Secretary section from the linked StateSecretary
                // row (if any). `id` is CUID — required for the PUT target.
                if (s.secretary) {
                    const sec = s.secretary;
                    setSecretary({
                        id: sec.id || null,
                        name: sec.name || '',
                        gender: sec.gender || 'MALE',
                        email: sec.email || '',
                        phone: sec.phone || '',
                        aadhaarNumber: sec.aadhaarNumber || '',
                        associationName: sec.associationName || '',
                        residentialAddress: sec.residentialAddress || '',
                        // File fields stay empty in form — we only send
                        // bytes when the admin picks a fresh file.
                        identityProof: '',
                        profilePhoto: '',
                        logo: '',
                        associationRegistrationCopy: '',
                    });
                    if (sec.profilePhoto) setSecretaryProfilePreview(resolveImageUrl(sec.profilePhoto));
                    if (sec.identityProof) setSecretaryIdProofPreview(resolveImageUrl(sec.identityProof));
                    if (sec.logo) setSecretaryLogoPreview(resolveImageUrl(sec.logo));
                    if (sec.associationRegistrationCopy) setSecretaryRegCopyPreview(resolveImageUrl(sec.associationRegistrationCopy));
                }
            } catch (err: any) {
                setError(err?.response?.data?.message || 'Failed to load state');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [id]);

    const set = <K extends keyof FormData>(field: K, value: FormData[K]) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const setSec = <K extends keyof SecretaryFormData>(field: K, value: SecretaryFormData[K]) =>
        setSecretary((prev) => ({ ...prev, [field]: value }));

    // File picker for secretary uploads. Same 5 MB cap as the state-level
    // pickers — the Railway edge drops requests above that.
    const onSecretaryFile = (
        e: React.ChangeEvent<HTMLInputElement>,
        field: 'identityProof' | 'profilePhoto' | 'logo' | 'associationRegistrationCopy',
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
            setSec(field, b64);
            setPreview(b64);
        };
        reader.readAsDataURL(file);
    };

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
            const payload: Record<string, any> = {
                name: form.name,
                code: form.code,
                website: form.website,
                presidentName: form.presidentName,
                isActive: form.isActive,
            };
            if (form.logo) payload.logo = form.logo;
            if (form.presidentPhoto) payload.presidentPhoto = form.presidentPhoto;

            // Save the State first, then the linked secretary if the admin
            // actually touched the secretary section. A failure on either
            // call surfaces as an error; the secretary save is gated on
            // having a non-null id (states without an approved secretary
            // skip this leg cleanly).
            await api.put(`/states/${id}`, payload);

            if (secretary.id) {
                const secPayload: Record<string, any> = {
                    name: secretary.name,
                    gender: secretary.gender,
                    email: secretary.email,
                    phone: secretary.phone,
                    aadhaarNumber: secretary.aadhaarNumber || null,
                    associationName: secretary.associationName || null,
                    residentialAddress: secretary.residentialAddress,
                };
                // Only send newly-picked files — omitting a key leaves the
                // existing URL in place on the backend.
                if (secretary.identityProof) secPayload.identityProof = secretary.identityProof;
                if (secretary.profilePhoto) secPayload.profilePhoto = secretary.profilePhoto;
                if (secretary.logo) secPayload.logo = secretary.logo;
                if (secretary.associationRegistrationCopy) secPayload.associationRegistrationCopy = secretary.associationRegistrationCopy;

                await api.put(`/state-secretaries/${secretary.id}`, secPayload);
            }

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
                            {/* Download button sources its URL from the preview — form.logo
                                is cleared on load so the save doesn't re-upload, so gating
                                on form.logo would hide the button in every normal case. */}
                            {logoPreview && (
                                <div className="mt-2">
                                    <DownloadButton url={logoPreview} filename={`${form.name || 'state'}-logo`} label="Download current logo" />
                                </div>
                            )}
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
                            {presidentPreview && (
                                <div className="mt-2">
                                    <DownloadButton url={presidentPreview} filename={`${form.presidentName || 'president'}-photo`} label="Download current photo" />
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Status toggle. A deactivated state is hidden from the
                    public /locations/states feed (child districts / clubs /
                    students are NOT touched — only the listing is hidden). */}
                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                    <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${form.isActive ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
                            <Shield className="w-4 h-4 text-white" />
                        </div>
                        <h2 className="font-semibold text-gray-900 text-sm">Status</h2>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-900">State is {form.isActive ? 'Active' : 'Inactive'}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {form.isActive
                                    ? 'Visible in public listings and registration dropdowns.'
                                    : 'Hidden from public listings. Existing districts, clubs, and students under this state are preserved and can still log in.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => set('isActive', !form.isActive)}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${form.isActive ? 'bg-emerald-600' : 'bg-gray-300'}`}
                            role="switch"
                            aria-checked={form.isActive}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                </section>

                {/* Collapsible Secretary section. Edits the linked
                    StateSecretary row via PUT /state-secretaries/:id.
                    Only rendered when the state actually has a secretary
                    — a fresh state with no approved secretary yet won't
                    show anything to edit here. */}
                {secretary.id && (
                    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setSecretaryOpen((v) => !v)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                                    <User className="w-4 h-4 text-white" />
                                </div>
                                <div className="text-left">
                                    <h2 className="font-semibold text-gray-900 text-sm">Secretary details</h2>
                                    <p className="text-xs text-gray-500">{secretary.name || '—'} · {secretary.email || 'no email'}</p>
                                </div>
                            </div>
                            {secretaryOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                        </button>

                        {secretaryOpen && (
                            <div className="p-5 border-t border-gray-100 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Full Name *</label>
                                        <input className={inputCls} value={secretary.name} onChange={(e) => setSec('name', e.target.value)} required />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Gender *</label>
                                        <select className={inputCls} value={secretary.gender} onChange={(e) => setSec('gender', e.target.value)}>
                                            <option value="MALE">Male</option>
                                            <option value="FEMALE">Female</option>
                                            <option value="OTHER">Other</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Email *</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input type="email" className={`${inputCls} pl-9`} value={secretary.email} onChange={(e) => setSec('email', e.target.value)} required />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Phone *</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input type="tel" className={`${inputCls} pl-9`} value={secretary.phone} onChange={(e) => setSec('phone', e.target.value)} required />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Aadhaar Number</label>
                                        <input className={inputCls} value={secretary.aadhaarNumber} onChange={(e) => setSec('aadhaarNumber', e.target.value)} placeholder="12-digit" />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Association Name</label>
                                        <input className={inputCls} value={secretary.associationName} onChange={(e) => setSec('associationName', e.target.value)} />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className={labelCls}>Residential Address *</label>
                                        <textarea className={`${inputCls} resize-none`} rows={2} value={secretary.residentialAddress} onChange={(e) => setSec('residentialAddress', e.target.value)} required />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                    <div>
                                        <label className={labelCls}>Profile Photo</label>
                                        <FilePicker preview={secretaryProfilePreview} onPick={() => secretaryProfileRef.current?.click()} onClear={() => { setSecretaryProfilePreview(null); setSec('profilePhoto', ''); }} />
                                        <input ref={secretaryProfileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onSecretaryFile(e, 'profilePhoto', setSecretaryProfilePreview)} />
                                        {secretaryProfilePreview && (
                                            <div className="mt-2">
                                                <DownloadButton url={secretaryProfilePreview} filename={`${secretary.name || 'secretary'}-photo`} label="Download current" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Identity Proof</label>
                                        <FilePicker preview={secretaryIdProofPreview} onPick={() => secretaryIdProofRef.current?.click()} onClear={() => { setSecretaryIdProofPreview(null); setSec('identityProof', ''); }} />
                                        <input ref={secretaryIdProofRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onSecretaryFile(e, 'identityProof', setSecretaryIdProofPreview)} />
                                        {secretaryIdProofPreview && (
                                            <div className="mt-2">
                                                <DownloadButton url={secretaryIdProofPreview} filename={`${secretary.name || 'secretary'}-id-proof`} label="Download current" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Association Logo</label>
                                        <FilePicker preview={secretaryLogoPreview} onPick={() => secretaryLogoRef.current?.click()} onClear={() => { setSecretaryLogoPreview(null); setSec('logo', ''); }} />
                                        <input ref={secretaryLogoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onSecretaryFile(e, 'logo', setSecretaryLogoPreview)} />
                                        {secretaryLogoPreview && (
                                            <div className="mt-2">
                                                <DownloadButton url={secretaryLogoPreview} filename={`${secretary.associationName || 'association'}-logo`} label="Download current" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Association Registration Copy</label>
                                        <FilePicker preview={secretaryRegCopyPreview} onPick={() => secretaryRegCopyRef.current?.click()} onClear={() => { setSecretaryRegCopyPreview(null); setSec('associationRegistrationCopy', ''); }} />
                                        <input ref={secretaryRegCopyRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onSecretaryFile(e, 'associationRegistrationCopy', setSecretaryRegCopyPreview)} />
                                        {secretaryRegCopyPreview && (
                                            <div className="mt-2">
                                                <DownloadButton url={secretaryRegCopyPreview} filename={`${secretary.associationName || 'association'}-registration`} label="Download current" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>
                )}

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
    // Track broken images so admins aren't stuck with a stale URL and no
    // way to replace it. Without this, an invalid preview path renders as
    // an empty box with only an X clear button — we saw exactly that on
    // the state president photo field.
    const [broken, setBroken] = useState(false);

    if (preview && !broken) {
        return (
            <div className="flex items-start gap-3">
                <div className="relative inline-block">
                    <img
                        src={preview}
                        alt=""
                        className="h-24 rounded-xl border border-gray-200 object-cover cursor-pointer"
                        // Clicking the image is a shortcut to replacing it.
                        onClick={onPick}
                        // Fall back to the broken state so the Replace UI
                        // takes over — admin can re-upload a working file.
                        onError={() => setBroken(true)}
                    />
                    <button type="button" onClick={onClear}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50">
                        <X className="w-3 h-3 text-gray-600" />
                    </button>
                </div>
                {/* Explicit Replace button next to the thumbnail — more
                    discoverable than "click the image". */}
                <button type="button" onClick={onPick}
                    className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100">
                    <ImagePlus className="w-3.5 h-3.5" />
                    Replace
                </button>
            </div>
        );
    }
    return (
        <button type="button" onClick={onPick}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/50">
            <ImagePlus className="w-4 h-4" />
            {broken ? 'Previous file missing — click to upload a new one' : 'Click to upload'}
        </button>
    );
}
