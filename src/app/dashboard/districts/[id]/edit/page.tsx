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
    ImagePlus, X, Shield, User, ChevronDown, ChevronUp, Mail, Phone,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import DownloadButton from '@/components/shared/DownloadButton';
import { resolveImageUrl } from '@/lib/utils/resolveImageUrl';

interface FormData {
    name: string;
    code: string;
    stateId: string;
    logo: string;
    // Activate / deactivate toggle. Hides the district from public lists
    // without touching child records.
    isActive: boolean;
}

// Secretary edit form. These fields live on DistrictSecretary (a separate
// row linked by districtId), not on the District row itself — they save
// via PUT /district-secretaries/:id rather than PUT /districts/:id.
interface SecretaryFormData {
    id: string | null;
    name: string;
    gender: string;
    email: string;
    phone: string;
    aadhaarNumber: string;
    associationName: string;
    residentialAddress: string;
    identityProof: string;
    profilePhoto: string;
    logo: string;
    associationRegistrationCopy: string;
}

export default function EditDistrictPage() {
    const { id } = useParams();
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [form, setForm] = useState<FormData>({ name: '', code: '', stateId: '', logo: '', isActive: true });

    // Secretary edit state — collapsed by default.
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
                // AND renames name → district_name, stateId → state_id on the
                // way out (see districtService.getDistrictById). Accept both
                // shapes so a future refactor of the service doesn't break
                // this page silently.
                const dPayload = districtRes.data?.data ?? districtRes.data;
                const d = dPayload?.district ?? dPayload ?? {};
                // /locations/states returns a bare array under data (no
                // `states` key) — but be defensive in case the shape
                // changes.
                const stPayload = statesRes.data?.data ?? statesRes.data;
                const st = Array.isArray(stPayload)
                    ? stPayload
                    : (stPayload?.states ?? []);
                const parentStateId = d.state_id ?? d.stateId;
                setForm({
                    name: d.district_name || d.name || '',
                    code: d.code || '',
                    stateId: parentStateId ? String(parentStateId) : '',
                    logo: '',
                    // Defaults to true if omitted so we never accidentally
                    // deactivate a district on save.
                    isActive: d.isActive !== false,
                });
                // See states/[id]/edit — raw backend paths need resolving
                // before they hit an <img src>, otherwise they 404 as
                // page-relative URLs.
                if (d.logo) setLogoPreview(resolveImageUrl(d.logo));
                setStates(Array.isArray(st) ? st : []);

                // Prime the Secretary section from the linked
                // DistrictSecretary row (if any).
                if (d.secretary) {
                    const sec = d.secretary;
                    setSecretary({
                        id: sec.id || null,
                        name: sec.name || '',
                        gender: sec.gender || 'MALE',
                        email: sec.email || '',
                        phone: sec.phone || '',
                        aadhaarNumber: sec.aadhaarNumber || '',
                        associationName: sec.associationName || '',
                        residentialAddress: sec.residentialAddress || '',
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
                setError(err?.response?.data?.message || 'Failed to load district');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [id]);

    const set = <K extends keyof FormData>(field: K, value: FormData[K]) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const setSec = <K extends keyof SecretaryFormData>(field: K, value: SecretaryFormData[K]) =>
        setSecretary((prev) => ({ ...prev, [field]: value }));

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
                isActive: form.isActive,
            };
            if (form.logo) payload.logo = form.logo;

            await api.put(`/districts/${id}`, payload);

            // If the secretary section has a target id, persist its edits
            // too. Districts without an approved secretary skip this leg.
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
                if (secretary.identityProof) secPayload.identityProof = secretary.identityProof;
                if (secretary.profilePhoto) secPayload.profilePhoto = secretary.profilePhoto;
                if (secretary.logo) secPayload.logo = secretary.logo;
                if (secretary.associationRegistrationCopy) secPayload.associationRegistrationCopy = secretary.associationRegistrationCopy;

                await api.put(`/district-secretaries/${secretary.id}`, secPayload);
            }

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
                            {form.logo && (
                                <div className="mt-2">
                                    <DownloadButton url={form.logo} filename={`${form.name || 'district'}-logo`} label="Download current logo" />
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Status toggle. A deactivated district is hidden from the
                    public /locations/.../districts feed (clubs / students
                    under it are preserved — only the listing is hidden). */}
                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                    <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${form.isActive ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
                            <Shield className="w-4 h-4 text-white" />
                        </div>
                        <h2 className="font-semibold text-gray-900 text-sm">Status</h2>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-900">District is {form.isActive ? 'Active' : 'Inactive'}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {form.isActive
                                    ? 'Visible in public listings and registration dropdowns.'
                                    : 'Hidden from public listings. Existing clubs and students under this district are preserved and can still log in.'}
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

                {/* Collapsible Secretary section — edits DistrictSecretary
                    row via PUT /district-secretaries/:id. Hidden when the
                    district has no secretary linked. */}
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
                                        {secretary.profilePhoto && (
                                            <div className="mt-2">
                                                <DownloadButton url={secretary.profilePhoto} filename={`${secretary.name || 'secretary'}-photo`} label="Download current" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Identity Proof</label>
                                        <FilePicker preview={secretaryIdProofPreview} onPick={() => secretaryIdProofRef.current?.click()} onClear={() => { setSecretaryIdProofPreview(null); setSec('identityProof', ''); }} />
                                        <input ref={secretaryIdProofRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onSecretaryFile(e, 'identityProof', setSecretaryIdProofPreview)} />
                                        {secretary.identityProof && (
                                            <div className="mt-2">
                                                <DownloadButton url={secretary.identityProof} filename={`${secretary.name || 'secretary'}-id-proof`} label="Download current" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Association Logo</label>
                                        <FilePicker preview={secretaryLogoPreview} onPick={() => secretaryLogoRef.current?.click()} onClear={() => { setSecretaryLogoPreview(null); setSec('logo', ''); }} />
                                        <input ref={secretaryLogoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onSecretaryFile(e, 'logo', setSecretaryLogoPreview)} />
                                        {secretary.logo && (
                                            <div className="mt-2">
                                                <DownloadButton url={secretary.logo} filename={`${secretary.associationName || 'association'}-logo`} label="Download current" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Association Registration Copy</label>
                                        <FilePicker preview={secretaryRegCopyPreview} onPick={() => secretaryRegCopyRef.current?.click()} onClear={() => { setSecretaryRegCopyPreview(null); setSec('associationRegistrationCopy', ''); }} />
                                        <input ref={secretaryRegCopyRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onSecretaryFile(e, 'associationRegistrationCopy', setSecretaryRegCopyPreview)} />
                                        {secretary.associationRegistrationCopy && (
                                            <div className="mt-2">
                                                <DownloadButton url={secretary.associationRegistrationCopy} filename={`${secretary.associationName || 'association'}-registration`} label="Download current" />
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
