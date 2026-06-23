'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    ArrowLeft, Save, User, Phone, Mail, MapPin, Calendar,
    GraduationCap, Heart, Shield, Loader2, AlertCircle, CheckCircle,
    Users, Hash, Camera, Download, FileText
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useStates, useDistricts, useClubs } from '@/lib/hooks/useStudent';
import { compressImage } from '@/lib/utils/imageCompress';

const BLOOD_GROUPS = ['A_POSITIVE','A_NEGATIVE','B_POSITIVE','B_NEGATIVE','O_POSITIVE','O_NEGATIVE','AB_POSITIVE','AB_NEGATIVE'];
const ACADEMIC_BOARDS = ['STATE','CBSE','ICSE','OTHER'];
const NOMINEE_RELATIONS = ['FATHER','MOTHER','GUARDIAN','OTHER'];

const formatBG = (bg: string) => bg.replace('_POSITIVE','+').replace('_NEGATIVE','-');

interface FormData {
    firstName: string; lastName: string; dateOfBirth: string; gender: string;
    bloodGroup: string; email: string; phone: string;
    fatherName: string; motherName: string; schoolName: string;
    academicBoard: string;
    nomineeName: string; nomineeAge: number; nomineeRelation: string;
    coachName: string;
    skateCategory: string;
    aadhaarNumber: string;
    addressLine1: string; city: string; pincode: string;
    // Editable location. We keep these as ids so the cascading selects can
    // round-trip cleanly; the backend re-derives state+district from the
    // chosen club to keep the three in lockstep.
    stateId: string; districtId: string; clubId: string;
}

export default function EditStudentPage() {
    const { id } = useParams();
    const router = useRouter();
    const { token } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [studentName, setStudentName] = useState('');
    const [ssfiId, setSsfiId] = useState('');
    // Snapshot of the Aadhaar as loaded, so we only resend it on save when
    // the admin actually changed it — otherwise an untouched corrupted
    // "00000000XXXX" value would fail the backend Verhoeff check and block
    // the whole save.
    const [originalAadhaar, setOriginalAadhaar] = useState('');
    const [hasBirthCert, setHasBirthCert] = useState(false);
    const [downloadingCert, setDownloadingCert] = useState(false);
    // Profile photo (base64 dataURI). Only sent on save when changed.
    const [profilePhoto, setProfilePhoto] = useState<string>('');
    const [profilePhotoChanged, setProfilePhotoChanged] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);

    const [form, setForm] = useState<FormData>({
        firstName: '', lastName: '', dateOfBirth: '', gender: 'MALE',
        bloodGroup: '', email: '', phone: '',
        fatherName: '', motherName: '', schoolName: '',
        academicBoard: 'STATE',
        nomineeName: '', nomineeAge: 18, nomineeRelation: 'FATHER',
        coachName: '',
        skateCategory: '',
        aadhaarNumber: '',
        addressLine1: '', city: '', pincode: '',
        stateId: '', districtId: '', clubId: '',
    });

    // Cascading location pickers. We load states once on mount, then fetch
    // districts when state changes and clubs when district changes — exact
    // same pattern used on the Students list filter bar.
    const { fetchStates, data: stateList } = useStates();
    const { fetchDistricts, data: districtList, clearDistricts } = useDistricts();
    const { fetchClubs, data: clubList, clearClubs } = useClubs();

    useEffect(() => {
        if (!token || !id) return;
        const fetchStudent = async () => {
            setIsLoading(true);
            try {
                const res = await api.get(`/students/${id}`);
                // GET /students/:id returns the raw Prisma student — camelCase
                // fields, plus nested user/state/district/club objects. The
                // older snake_case paths (s.first_name, s.dob, s.state_name …)
                // just don't exist on this shape, which is why the edit form
                // was rendering empty and showed [object Object] for state.
                const s = res.data?.data?.student || res.data?.data || res.data;

                // name → firstName/lastName split (Student.name is a single field)
                const fullName = (s.name || '').trim();
                const firstSpace = fullName.indexOf(' ');
                const firstName = firstSpace === -1 ? fullName : fullName.slice(0, firstSpace);
                const lastName = firstSpace === -1 ? '' : fullName.slice(firstSpace + 1);

                setStudentName(fullName);
                setSsfiId(s.membershipId || s.user?.uid || '');
                setForm({
                    firstName,
                    lastName,
                    dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).split('T')[0] : '',
                    gender: s.gender || 'MALE',
                    bloodGroup: s.bloodGroup || '',
                    email: s.user?.email || '',
                    phone: s.user?.phone || '',
                    fatherName: s.fatherName || '',
                    motherName: s.motherName || '',
                    schoolName: s.schoolName || '',
                    academicBoard: s.academicBoard || 'STATE',
                    nomineeName: s.nomineeName || '',
                    nomineeAge: s.nomineeAge || 18,
                    nomineeRelation: s.nomineeRelation || 'FATHER',
                    coachName: s.coachName || '',
                    skateCategory: s.categoryType?.cat_name || '',
                    aadhaarNumber: s.aadhaarNumber || '',
                    addressLine1: s.addressLine1 || '',
                    city: s.city || '',
                    pincode: s.pincode || '',
                    stateId: s.stateId ? String(s.stateId) : '',
                    districtId: s.districtId ? String(s.districtId) : '',
                    clubId: s.clubId ? String(s.clubId) : '',
                });
                setOriginalAadhaar(s.aadhaarNumber || '');
                setHasBirthCert(!!s.birthCertificate);
                setProfilePhoto(s.profilePhoto || '');
                setProfilePhotoChanged(false);
                // Prime the cascading lists so the current district/club
                // options are visible without waiting for the user to
                // click through the state picker.
                if (s.stateId) {
                    fetchDistricts(String(s.stateId));
                }
                if (s.districtId) {
                    fetchClubs(String(s.districtId));
                }
            } catch (err: any) {
                setError(err.response?.data?.message || 'Failed to load student data');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStudent();
    }, [token, id, fetchDistricts, fetchClubs]);

    // Load the state list once on mount.
    useEffect(() => { fetchStates(); }, [fetchStates]);

    // When the user picks a new state, clear the current district/club and
    // fetch the new district list. Same for district → clubs.
    const handleStateChange = (newStateId: string) => {
        setForm(prev => ({ ...prev, stateId: newStateId, districtId: '', clubId: '' }));
        clearDistricts();
        clearClubs();
        if (newStateId) fetchDistricts(newStateId);
    };
    const handleDistrictChange = (newDistrictId: string) => {
        setForm(prev => ({ ...prev, districtId: newDistrictId, clubId: '' }));
        clearClubs();
        if (newDistrictId) fetchClubs(newDistrictId);
    };

    const set = (field: keyof FormData, value: string | number) =>
        setForm(prev => ({ ...prev, [field]: value }));

    // Download the birth certificate (base64 dataURI) → file. WebP for
    // images, PDF passthrough. Fetched on demand so the heavy blob isn't
    // in the page payload.
    const downloadBirthCert = async () => {
        setDownloadingCert(true);
        try {
            const res = await api.get(`/students/${id}/birth-certificate`);
            const d = res.data?.data || res.data;
            const dataUri: string = d?.dataUri;
            if (!dataUri) throw new Error('No certificate');
            const ext = dataUri.startsWith('data:application/pdf') ? 'pdf' : 'webp';
            const a = document.createElement('a');
            a.href = dataUri;
            a.download = `birth-certificate-${(d?.uid || ssfiId || id).toString().replace(/[^\w-]/g, '_')}.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch {
            setError('Failed to download birth certificate');
        } finally {
            setDownloadingCert(false);
        }
    };

    // Resolve the current photo for preview: base64/http used as-is, a
    // stored /uploads path is prefixed with the API origin.
    const photoSrc = (() => {
        if (!profilePhoto) return '';
        if (profilePhoto.startsWith('data:') || profilePhoto.startsWith('http')) return profilePhoto;
        return `https://api.ssfiskate.com${profilePhoto.startsWith('/') ? '' : '/'}${profilePhoto}`;
    })();

    // Admin picks a new profile photo → compress to base64 and stage it.
    const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoError(null);
        if (!file.type.startsWith('image/')) { setPhotoError('Please choose an image file'); return; }
        try {
            const b64 = await compressImage(file);
            setProfilePhoto(b64);
            setProfilePhotoChanged(true);
        } catch {
            setPhotoError('Could not process that image. Try another.');
        } finally {
            e.target.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            // Only send fields that exist on Student / User. stateName,
            // districtName, clubName are readonly display-only here and
            // aren't part of the update payload.
            const payload = {
                firstName: form.firstName,
                lastName: form.lastName,
                dateOfBirth: form.dateOfBirth,
                gender: form.gender,
                bloodGroup: form.bloodGroup || null,
                email: form.email || null,
                // Phone is editable now (was previously locked) so admins
                // can fix legacy migrate.js placeholders ("PH-SKT-{id}")
                // and any post-renewal typos. Only sent when non-empty —
                // backend rejects blank with a 400.
                ...(form.phone && form.phone.trim() ? { phone: form.phone.trim() } : {}),
                fatherName: form.fatherName,
                motherName: form.motherName || null,
                schoolName: form.schoolName,
                academicBoard: form.academicBoard,
                nomineeName: form.nomineeName,
                nomineeAge: form.nomineeAge,
                nomineeRelation: form.nomineeRelation,
                coachName: form.coachName,
                // Backend resolves the label to CategoryType.id (creating
                // the row if missing). Empty string clears the link.
                skateCategory: form.skateCategory,
                // Aadhaar: only sent when the admin actually changed it.
                // Untouched corrupted "00000000XXXX" values are NOT resent
                // (they'd fail the backend's 12-digit Verhoeff check and
                // block the save). On a real edit the backend validates,
                // checks uniqueness, and locks the field.
                ...((form.aadhaarNumber || '').replace(/\D/g, '') !== (originalAadhaar || '').replace(/\D/g, '')
                    && (form.aadhaarNumber || '').replace(/\D/g, '').length > 0
                    ? { aadhaarNumber: (form.aadhaarNumber || '').replace(/\D/g, '') }
                    : {}),
                // Profile photo: only sent when the admin actually replaced it.
                ...(profilePhotoChanged ? { profilePhoto } : {}),
                addressLine1: form.addressLine1,
                city: form.city,
                pincode: form.pincode,
                // Location. We send clubId when it's set — the backend
                // re-derives state+district from it to keep the three in
                // lockstep. When the admin hasn't picked a club yet we
                // fall back to the raw state/district ids.
                clubId: form.clubId ? Number(form.clubId) : null,
                stateId: form.stateId ? Number(form.stateId) : null,
                districtId: form.districtId ? Number(form.districtId) : null,
            };
            await api.put(`/students/${id}`, payload);
            setSuccess(true);
            setTimeout(() => router.push('/dashboard/students'), 1500);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update student');
            setIsSaving(false);
        }
    };

    const inputCls = "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow text-sm";
    const selectCls = "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm";
    const labelCls = "block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide";

    if (isLoading) return (
        <div className="flex items-center justify-center h-96">
            <div className="text-center space-y-3">
                <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto" />
                <p className="text-gray-500 text-sm">Loading student data...</p>
            </div>
        </div>
    );

    if (error && !form.firstName) return (
        <div className="flex flex-col items-center justify-center h-96 gap-4">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-gray-900 font-semibold">Failed to load student</p>
            <p className="text-gray-500 text-sm">{error}</p>
            <Link href="/dashboard/students" className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm hover:bg-emerald-600">
                Back to Students
            </Link>
        </div>
    );

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/students"
                        className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                        <ArrowLeft className="w-4 h-4 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Edit Student</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            {studentName && <p className="text-sm text-gray-500">{studentName}</p>}
                            {ssfiId && <span className="text-xs font-mono bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg border border-emerald-100">#{ssfiId}</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Success banner */}
            {success && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <p className="text-green-700 font-medium text-sm">Student updated successfully! Redirecting...</p>
                </motion.div>
            )}

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">

                {/* Profile Photo */}
                <Section title="Profile Photo" icon={Camera} color="blue">
                    <div className="flex items-center gap-5">
                        <div className="w-28 h-28 rounded-xl border-2 border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center flex-shrink-0">
                            {photoSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={photoSrc} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-12 h-12 text-gray-300" />
                            )}
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 mb-3">
                                {profilePhotoChanged ? 'New photo selected — it will be saved when you click Save Changes.' : 'Upload or replace the student’s profile photo.'}
                            </p>
                            <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer">
                                <Camera className="w-4 h-4" /> {photoSrc ? 'Replace photo' : 'Add photo'}
                                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                            </label>
                            {photoError && <p className="text-xs text-red-600 mt-2">{photoError}</p>}
                        </div>
                    </div>
                </Section>

                {/* Personal Info */}
                <Section title="Personal Information" icon={User} color="blue">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>First Name *</label>
                            <input className={inputCls} value={form.firstName} onChange={e => set('firstName', e.target.value)} required placeholder="First name" />
                        </div>
                        <div>
                            <label className={labelCls}>Last Name *</label>
                            <input className={inputCls} value={form.lastName} onChange={e => set('lastName', e.target.value)} required placeholder="Last name" />
                        </div>
                        <div>
                            <label className={labelCls}>Date of Birth *</label>
                            <input type="date" className={inputCls} value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} required />
                        </div>
                        <div>
                            <label className={labelCls}>Gender *</label>
                            <select className={selectCls} value={form.gender} onChange={e => set('gender', e.target.value)}>
                                <option value="MALE">Male</option>
                                <option value="FEMALE">Female</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Blood Group</label>
                            <select className={selectCls} value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                                <option value="">Select</option>
                                {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{formatBG(bg)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>
                                Phone
                                {form.phone && /^PH-SKT-/.test(form.phone) && (
                                    <span className="ml-2 text-xs text-amber-600 font-normal">(legacy placeholder — please replace)</span>
                                )}
                            </label>
                            <input
                                className={inputCls}
                                value={form.phone}
                                onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                inputMode="numeric"
                                maxLength={10}
                                placeholder="10-digit Indian mobile (e.g. 9876543210)"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Phone is the student's login identity. Changing it does not change their password —
                                if they previously logged in with this number as their password, ask them to use Forgot Password after this update.
                            </p>
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Email</label>
                            <input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>
                                Aadhaar Number
                                {/^0{8}\d{4}$/.test((form.aadhaarNumber || '').replace(/\D/g, '')) && (
                                    <span className="ml-2 text-xs text-amber-600 font-normal">(unconfirmed — only last 4 known; enter the full number to fix)</span>
                                )}
                            </label>
                            <input
                                className={`${inputCls} font-mono tracking-wider`}
                                value={form.aadhaarNumber}
                                onChange={(e) => set('aadhaarNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
                                inputMode="numeric"
                                maxLength={12}
                                placeholder="12-digit Aadhaar number"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Editing this overrides and locks the student&apos;s Aadhaar. Must be a valid 12-digit number.
                                Leave unchanged to keep the current value.
                            </p>
                        </div>
                        {hasBirthCert && (
                            <div className="sm:col-span-2">
                                <label className={labelCls}>Birth Certificate</label>
                                <button
                                    type="button"
                                    onClick={downloadBirthCert}
                                    disabled={downloadingCert}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 text-sm font-medium disabled:opacity-50"
                                >
                                    {downloadingCert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Download birth certificate
                                </button>
                                <p className="mt-1 text-xs text-gray-500">Uploaded by the student as DOB proof. Verify against the declared date of birth.</p>
                            </div>
                        )}
                    </div>
                </Section>

                {/* Family & School */}
                <Section title="Family & School" icon={GraduationCap} color="green">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Father's Name *</label>
                            <input className={inputCls} value={form.fatherName} onChange={e => set('fatherName', e.target.value)} required placeholder="Father's full name" />
                        </div>
                        <div>
                            <label className={labelCls}>Mother's Name</label>
                            <input className={inputCls} value={form.motherName} onChange={e => set('motherName', e.target.value)} placeholder="Mother's full name" />
                        </div>
                        <div>
                            <label className={labelCls}>School Name</label>
                            <input className={inputCls} value={form.schoolName} onChange={e => set('schoolName', e.target.value)} placeholder="School / college name" />
                        </div>
                        <div>
                            <label className={labelCls}>Academic Board</label>
                            <select className={selectCls} value={form.academicBoard} onChange={e => set('academicBoard', e.target.value)}>
                                {ACADEMIC_BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    </div>
                </Section>

                {/* Nominee */}
                <Section title="Nominee / Insurance" icon={Heart} color="red">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Nominee Name</label>
                            <input className={inputCls} value={form.nomineeName} onChange={e => set('nomineeName', e.target.value)} placeholder="Nominee full name" />
                        </div>
                        <div>
                            <label className={labelCls}>Relation</label>
                            <select className={selectCls} value={form.nomineeRelation} onChange={e => set('nomineeRelation', e.target.value)}>
                                {NOMINEE_RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Nominee Age</label>
                            <input type="number" className={inputCls} value={form.nomineeAge} onChange={e => set('nomineeAge', Number(e.target.value))} min={1} max={120} />
                        </div>
                    </div>
                </Section>

                <Section title="Skating Details" icon={Shield} color="purple">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Coach Name</label>
                            <input className={inputCls} value={form.coachName} onChange={e => set('coachName', e.target.value)} placeholder="Coach's name" />
                        </div>
                        <div>
                            <label className={labelCls}>Skate Category</label>
                            <select className={selectCls} value={form.skateCategory} onChange={e => set('skateCategory', e.target.value)}>
                                <option value="">Select category</option>
                                <option value="Speed Quad">Speed Quad</option>
                                <option value="Speed Inline">Speed Inline</option>
                                <option value="Recreational">Recreational</option>
                                <option value="Beginner">Beginner</option>
                                {/* Preserve any legacy label already on the
                                    record (Artistic, Adjustable/Tenacity …)
                                    so editing doesn't silently erase it.
                                    Only the four above are offered as new
                                    picks. */}
                                {form.skateCategory && !['Speed Quad','Speed Inline','Recreational','Beginner'].includes(form.skateCategory) && (
                                    <option value={form.skateCategory}>{form.skateCategory} (legacy)</option>
                                )}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Club</label>
                            <select
                                className={selectCls}
                                value={form.clubId}
                                onChange={e => set('clubId', e.target.value)}
                                disabled={!form.districtId}
                            >
                                <option value="">{form.districtId ? 'Select club' : 'Select district first'}</option>
                                {clubList.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </Section>

                {/* Address + location. State → District → Club cascade. The
                    club ultimately sets state+district server-side, but
                    keeping independent pickers here gives the admin a
                    recovery path when a student is mid-move between clubs. */}
                <Section title="Address" icon={MapPin} color="amber">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Street Address</label>
                            <textarea className={`${inputCls} resize-none`} rows={2} value={form.addressLine1} onChange={e => set('addressLine1', e.target.value)} placeholder="Door no, street, locality" />
                        </div>
                        <div>
                            <label className={labelCls}>City</label>
                            <input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" />
                        </div>
                        <div>
                            <label className={labelCls}>Pincode</label>
                            <input className={inputCls} value={form.pincode} onChange={e => set('pincode', e.target.value)} placeholder="6-digit pincode" />
                        </div>
                        <div>
                            <label className={labelCls}>State</label>
                            <select
                                className={selectCls}
                                value={form.stateId}
                                onChange={e => handleStateChange(e.target.value)}
                            >
                                <option value="">Select state</option>
                                {stateList.map((s: any) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>District</label>
                            <select
                                className={selectCls}
                                value={form.districtId}
                                onChange={e => handleDistrictChange(e.target.value)}
                                disabled={!form.stateId}
                            >
                                <option value="">{form.stateId ? 'Select district' : 'Select state first'}</option>
                                {districtList.map((d: any) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </Section>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                    <button type="submit" disabled={isSaving || success}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <Link href="/dashboard/students"
                        className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}

function Section({ title, icon: Icon, color, children }: {
    title: string; icon: any; color: 'blue'|'green'|'red'|'purple'|'amber'; children: React.ReactNode
}) {
    const colors = {
        blue:   'from-emerald-500 to-teal-600',
        green:  'from-green-500 to-emerald-600',
        red:    'from-red-500 to-teal-600',
        purple: 'from-teal-500 to-emerald-600',
        amber:  'from-amber-400 to-orange-500',
    };
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-gray-600" />
                </div>
                <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}
