'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    User, Lock, Shield, Mail, Phone, Save, Loader2, Camera,
    CheckCircle, AlertCircle, MapPin, Heart, GraduationCap,
    UserCheck, Calendar, CreditCard, Trash2, Zap, Eye, EyeOff
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useStates, useDistricts, useClubs } from '@/lib/hooks/useStudent';
import { toast } from 'react-hot-toast';

// The backend stores profile photos as relative paths under /uploads/...
// Settings wasn't prefixing them with the API origin, so <img src> resolved
// against the Vercel frontend origin and 404'd. Match the admin pages'
// convention.
const IMG_BASE = 'https://api.ssfiskate.com';
const resolvePhoto = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path;
    const slash = path.startsWith('/') ? '' : '/';
    return `${IMG_BASE}${slash}${path}`;
};

interface ProfileData {
    name?: string;
    gender?: string;
    dateOfBirth?: string;
    bloodGroup?: string;
    aadhaarNumber?: string;
    fatherName?: string;
    motherName?: string;
    schoolName?: string;
    academicBoard?: string;
    nomineeName?: string;
    nomineeAge?: number;
    nomineeRelation?: string;
    coachName?: string;
    coachPhone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    pincode?: string;
    profilePhoto?: string;
    state?: { id: number; name: string };
    district?: { id: number; name: string; state?: { id: number; name: string } };
    club?: { id: number; name: string };
}

interface FullUser {
    id: number;
    uid: string;
    phone: string;
    email: string;
    role: string;
    isActive: boolean;
    accountStatus: string;
    registrationDate: string;
    expiryDate: string;
    profile: ProfileData | null;
}

const genderOptions = ['MALE', 'FEMALE', 'OTHER'];
const bloodGroupOptions = ['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'];
const academicBoardOptions = ['STATE_BOARD', 'CBSE', 'ICSE', 'IB', 'OTHER'];

const formatBloodGroup = (bg: string) => bg.replace('_POSITIVE', '+').replace('_NEGATIVE', '-').replace('_', ' ');
const formatBoard = (b: string) => b.replace(/_/g, ' ');

const InputField = ({ label, value, onChange, type = 'text', placeholder = '', required = false, disabled = false, icon: Icon }: any) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-600">{label}</label>
        <div className="relative">
            {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />}
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                className={`w-full ${Icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-gray-400 transition-all ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
            />
        </div>
    </div>
);

const SelectField = ({ label, value, onChange, options, disabled = false }: any) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-600">{label}</label>
        <select
            value={value}
            onChange={onChange}
            disabled={disabled}
            className={`w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
        >
            {options.map((opt: any) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </div>
);

const ReadOnlyField = ({ label, value, icon: Icon }: any) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-500">{label} <span className="text-xs text-gray-400">(Read only)</span></label>
        <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-gray-400" />}
            {value || '—'}
        </div>
    </div>
);

export default function SettingsPage() {
    const { user: authUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'payment'>('profile');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Full profile from /auth/me
    const [fullUser, setFullUser] = useState<FullUser | null>(null);

    // Editable profile form state
    const [formData, setFormData] = useState<Record<string, any>>({});

    // Password form
    const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });

    // Razorpay config state
    const [rpConfig, setRpConfig] = useState<any>(null);
    const [rpForm, setRpForm] = useState({ keyId: '', keySecret: '', webhookSecret: '' });
    const [rpTesting, setRpTesting] = useState(false);
    const [rpSaving, setRpSaving] = useState(false);
    const [showSecrets, setShowSecrets] = useState(false);

    // District & State fallback Razorpay config (GLOBAL_ADMIN only)
    const [fbConfig, setFbConfig] = useState<any>(null);
    const [fbForm, setFbForm] = useState({ keyId: '', keySecret: '', webhookSecret: '' });
    const [fbTesting, setFbTesting] = useState(false);
    const [fbSaving, setFbSaving] = useState(false);

    // Club-owner self-service: nominee details for their club. Club table has
    // its own nomineeName / nomineeAge / nomineeRelation columns separate
    // from the ClubOwner / User profile, so they go through a dedicated
    // /clubs/my-club endpoint rather than the generic /auth/profile.
    const [clubForm, setClubForm] = useState({ nomineeName: '', nomineeAge: '' as number | string, nomineeRelation: '' });
    const [clubSaving, setClubSaving] = useState(false);

    const fetchProfile = useCallback(async () => {
        setFetching(true);
        try {
            const res = await api.get('/auth/me');
            const userData = (res.data as any)?.data?.user ?? (res.data as any)?.user;
            if (userData) {
                setFullUser(userData);
                // Populate editable form fields from profile
                const p = userData.profile || {};
                const fields: Record<string, any> = {
                    email: userData.email || '',
                    name: p.name || '',
                    gender: p.gender || 'MALE',
                    addressLine1: p.addressLine1 || '',
                    addressLine2: p.addressLine2 || '',
                    city: p.city || '',
                    pincode: p.pincode || '',
                };
                if (userData.role === 'STUDENT') {
                    fields.dateOfBirth = p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split('T')[0] : '';
                    fields.bloodGroup = p.bloodGroup || '';
                    fields.fatherName = p.fatherName || '';
                    fields.motherName = p.motherName || '';
                    fields.schoolName = p.schoolName || '';
                    fields.academicBoard = p.academicBoard || 'STATE_BOARD';
                    fields.nomineeName = p.nomineeName || '';
                    fields.nomineeAge = p.nomineeAge || '';
                    fields.nomineeRelation = p.nomineeRelation || '';
                    fields.coachName = p.coachName || '';
                    fields.coachPhone = p.coachPhone || '';
                }
                setFormData(fields);
            }
        } catch (err: any) {
            toast.error('Failed to load profile');
        } finally {
            setFetching(false);
        }
    }, []);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    // Load the club owner's own club so we can pre-fill nominee fields.
    const fetchMyClub = useCallback(async () => {
        try {
            const res = await api.get('/clubs/my-club');
            const club = (res.data as any)?.data?.club || (res.data as any)?.data || res.data;
            if (club) {
                setClubForm({
                    nomineeName: club.nomineeName || '',
                    nomineeAge: club.nomineeAge ?? '',
                    nomineeRelation: club.nomineeRelation || '',
                });
            }
        } catch {
            // not linked to a club yet — leave form empty
        }
    }, []);

    useEffect(() => {
        if ((fullUser?.role || authUser?.role) === 'CLUB_OWNER') fetchMyClub();
    }, [fullUser?.role, authUser?.role, fetchMyClub]);

    const handleClubSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setClubSaving(true);
        setMessage(null);
        try {
            const payload: any = {
                nomineeName: clubForm.nomineeName.trim(),
                nomineeRelation: clubForm.nomineeRelation,
            };
            if (clubForm.nomineeAge !== '' && clubForm.nomineeAge !== null) {
                payload.nomineeAge = Number(clubForm.nomineeAge);
            }
            await api.put('/clubs/my-club', payload);
            setMessage({ type: 'success', text: 'Club nominee details updated' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update club details' });
        } finally {
            setClubSaving(false);
        }
    };

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            // Never send a blank state/district/club — these are numeric ids and
            // an empty string would be written straight through to the column.
            const payload: Record<string, any> = { ...formData };
            for (const k of ['stateId', 'districtId', 'clubId']) {
                if (!payload[k]) delete payload[k];
            }

            const res = await api.put('/auth/profile', payload);
            const userData = (res.data as any)?.data?.user ?? (res.data as any)?.user;
            if (userData) setFullUser(userData);
            setMessage({ type: 'success', text: 'Profile updated successfully' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update profile' });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            setLoading(false);
            return;
        }

        try {
            await api.post('/auth/change-password', {
                oldPassword: passwordData.oldPassword,
                newPassword: passwordData.newPassword,
            });
            setMessage({ type: 'success', text: 'Password changed successfully. For better security, ensure your password includes uppercase, lowercase, numbers & special characters.' });
            setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to change password' });
        } finally {
            setLoading(false);
        }
    };

    // Razorpay config functions
    const isSecretary = ['GLOBAL_ADMIN', 'STATE_SECRETARY', 'DISTRICT_SECRETARY'].includes(fullUser?.role || authUser?.role || '');

    const fetchRpConfig = useCallback(async () => {
        try {
            const res = await api.get('/razorpay-config');
            const data = (res.data as any)?.data;
            setRpConfig(data);
            if (data) setRpForm({ keyId: data.keyId || '', keySecret: '', webhookSecret: '' });
        } catch { /* not configured yet */ }
    }, []);

    useEffect(() => {
        if (isSecretary) fetchRpConfig();
    }, [isSecretary, fetchRpConfig]);

    const handleRpSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rpForm.keyId || !rpForm.keySecret) {
            toast.error('Key ID and Key Secret are required');
            return;
        }
        setRpSaving(true);
        try {
            const res = await api.put('/razorpay-config', rpForm);
            toast.success((res.data as any)?.message || 'Credentials saved');
            setRpForm(prev => ({ ...prev, keySecret: '', webhookSecret: '' }));
            await fetchRpConfig();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally {
            setRpSaving(false);
        }
    };

    const handleRpTest = async () => {
        setRpTesting(true);
        try {
            const res = await api.post('/razorpay-config/test', {});
            const data = res.data as any;
            if (data.status === 'success') {
                toast.success(data.message || 'Integration verified!');
                await fetchRpConfig();
            } else {
                toast.error(data.message || 'Verification failed');
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Test failed');
        } finally {
            setRpTesting(false);
        }
    };

    const handleRpDelete = async () => {
        if (!confirm('Remove your Razorpay configuration? Event payments will use the central SSFI account.')) return;
        try {
            await api.delete('/razorpay-config');
            toast.success('Configuration removed');
            setRpConfig(null);
            setRpForm({ keyId: '', keySecret: '', webhookSecret: '' });
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to remove');
        }
    };

    // Fallback Razorpay config functions (GLOBAL_ADMIN only)
    const fetchFbConfig = useCallback(async () => {
        try {
            const res = await api.get('/razorpay-config/fallback');
            const data = (res.data as any)?.data;
            setFbConfig(data);
            if (data) setFbForm({ keyId: data.keyId || '', keySecret: '', webhookSecret: '' });
        } catch { /* not configured yet */ }
    }, []);

    useEffect(() => {
        if ((fullUser?.role || authUser?.role) === 'GLOBAL_ADMIN') fetchFbConfig();
    }, [fullUser?.role, authUser?.role, fetchFbConfig]);

    const handleFbSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fbForm.keyId || !fbForm.keySecret) {
            toast.error('Key ID and Key Secret are required');
            return;
        }
        setFbSaving(true);
        try {
            const res = await api.put('/razorpay-config/fallback', fbForm);
            toast.success((res.data as any)?.message || 'Credentials saved');
            setFbForm(prev => ({ ...prev, keySecret: '', webhookSecret: '' }));
            await fetchFbConfig();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally {
            setFbSaving(false);
        }
    };

    const handleFbTest = async () => {
        setFbTesting(true);
        try {
            const res = await api.post('/razorpay-config/fallback/test', {});
            const data = res.data as any;
            if (data.status === 'success') {
                toast.success(data.message || 'Integration verified!');
                await fetchFbConfig();
            } else {
                toast.error(data.message || 'Verification failed');
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Test failed');
        } finally {
            setFbTesting(false);
        }
    };

    const handleFbDelete = async () => {
        if (!confirm('Remove the fallback Razorpay account? District/State event payments without their own account will use the central SSFI account.')) return;
        try {
            await api.delete('/razorpay-config/fallback');
            toast.success('Configuration removed');
            setFbConfig(null);
            setFbForm({ keyId: '', keySecret: '', webhookSecret: '' });
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to remove');
        }
    };

    const setField = (key: string, value: any) => setFormData(prev => ({ ...prev, [key]: value }));

    const role = fullUser?.role || authUser?.role || '';
    const profile = fullUser?.profile;

    // ── Fill-only geography ──────────────────────────────────────────────────
    // A student whose state/district/club is blank (renewal never captured it)
    // is silently barred from every district event. Let them complete it here.
    // Fields already set stay read-only — the backend enforces the same rule, so
    // changing an existing district (and hopping into another district's meet)
    // isn't possible from this form.
    const { fetchStates, data: states } = useStates();
    const { fetchDistricts, clearDistricts, data: districts } = useDistricts();
    const { fetchClubs, clearClubs, data: clubs } = useClubs();

    const hasState = !!(profile as any)?.state?.name;
    const hasDistrict = !!(profile as any)?.district?.name;
    const hasClub = !!(profile as any)?.club?.name;
    const needsGeo = role === 'STUDENT' && (!hasState || !hasDistrict || !hasClub);

    // Effective ids drive the cascade: prefer what's already on the profile so a
    // student who has a state but no district still gets that state's districts.
    const effStateId = hasState ? String((profile as any).state.id) : (formData.stateId || '');
    const effDistrictId = hasDistrict ? String((profile as any).district.id) : (formData.districtId || '');

    useEffect(() => {
        if (needsGeo) fetchStates();
    }, [needsGeo, fetchStates]);

    useEffect(() => {
        if (needsGeo && effStateId) fetchDistricts(effStateId);
        else if (needsGeo) clearDistricts();
    }, [needsGeo, effStateId, fetchDistricts, clearDistricts]);

    useEffect(() => {
        if (needsGeo && effDistrictId) fetchClubs(effDistrictId);
        else if (needsGeo) clearClubs();
    }, [needsGeo, effDistrictId, fetchClubs, clearClubs]);

    // Changing a parent clears its children so we never save a mismatched pair.
    const handleStateChange = (v: string) =>
        setFormData(prev => ({ ...prev, stateId: v, districtId: '', clubId: '' }));
    const handleDistrictChange = (v: string) =>
        setFormData(prev => ({ ...prev, districtId: v, clubId: '' }));

    if (fetching) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-500">Manage your account and profile details</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar */}
                <div className="lg:w-64 space-y-2">
                    <button
                        onClick={() => { setActiveTab('profile'); setMessage(null); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'profile' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                    >
                        <User className="w-5 h-5" />
                        <span className="font-medium">Profile</span>
                    </button>
                    <button
                        onClick={() => { setActiveTab('security'); setMessage(null); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'security' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                    >
                        <Shield className="w-5 h-5" />
                        <span className="font-medium">Security</span>
                    </button>
                    {isSecretary && (
                        <button
                            onClick={() => { setActiveTab('payment'); setMessage(null); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'payment' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                        >
                            <CreditCard className="w-5 h-5" />
                            <span className="font-medium">Payment Settings</span>
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1">
                    {message && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
                        >
                            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                            {message.text}
                        </motion.div>
                    )}

                    <motion.div key={activeTab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl border border-gray-200 p-6">
                        {activeTab === 'payment' && isSecretary ? (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                                        <CreditCard className="w-5 h-5 text-emerald-500" /> Payment Settings
                                    </h2>
                                    <p className="text-gray-500 text-sm">Configure your Razorpay account to collect event registration fees directly.</p>
                                </div>

                                {/* Status Badge */}
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-gray-600">Status:</span>
                                    {!rpConfig ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                                            <span className="w-2 h-2 rounded-full bg-gray-400" /> Not Configured
                                        </span>
                                    ) : rpConfig.isVerified ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                                            <span className="w-2 h-2 rounded-full bg-green-500" /> Verified and Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700">
                                            <span className="w-2 h-2 rounded-full bg-yellow-500" /> Configured (Unverified)
                                        </span>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                                    When configured, event registration fees for events you create will be collected directly into your Razorpay account. Without this, payments go to the central SSFI account.
                                </div>

                                {/* Form */}
                                <form onSubmit={handleRpSave} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-gray-600">Razorpay Key ID</label>
                                        <input
                                            type="text"
                                            value={rpForm.keyId}
                                            onChange={(e) => setRpForm(p => ({ ...p, keyId: e.target.value }))}
                                            placeholder="rzp_live_xxxxxxxxxxxxxxxx"
                                            required
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-gray-600">Razorpay Key Secret</label>
                                        <div className="relative">
                                            <input
                                                type={showSecrets ? 'text' : 'password'}
                                                value={rpForm.keySecret}
                                                onChange={(e) => setRpForm(p => ({ ...p, keySecret: e.target.value }))}
                                                placeholder={rpConfig ? '(enter new value to change)' : 'Enter your key secret'}
                                                required={!rpConfig}
                                                className="w-full px-4 py-2.5 pr-12 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                                            />
                                            <button type="button" onClick={() => setShowSecrets(!showSecrets)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-gray-600">Webhook Secret <span className="text-gray-400">(Optional)</span></label>
                                        <input
                                            type={showSecrets ? 'text' : 'password'}
                                            value={rpForm.webhookSecret}
                                            onChange={(e) => setRpForm(p => ({ ...p, webhookSecret: e.target.value }))}
                                            placeholder={rpConfig?.hasWebhookSecret ? '(enter new value to change)' : 'Enter your webhook secret'}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-3 pt-2">
                                        <button type="submit" disabled={rpSaving} className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all font-medium">
                                            {rpSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                            Save Credentials
                                        </button>
                                        {rpConfig && (
                                            <button type="button" onClick={handleRpTest} disabled={rpTesting} className="px-6 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all font-medium">
                                                {rpTesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                                                Test Integration
                                            </button>
                                        )}
                                    </div>
                                </form>

                                {/* Danger Zone */}
                                {rpConfig && (
                                    <div className="pt-4 border-t border-gray-200">
                                        <h3 className="text-sm font-semibold text-red-600 mb-2">Danger Zone</h3>
                                        <button onClick={handleRpDelete} className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 flex items-center gap-2 transition-all">
                                            <Trash2 className="w-4 h-4" />
                                            Remove Configuration
                                        </button>
                                    </div>
                                )}

                                {/* District & State fallback account (GLOBAL_ADMIN only) */}
                                {role === 'GLOBAL_ADMIN' && (
                                    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                                                <Shield className="w-5 h-5 text-emerald-500" /> District &amp; State Fallback Account
                                            </h2>
                                            <p className="text-gray-500 text-sm">Fallback Razorpay account for district and state event payments.</p>
                                        </div>

                                        {/* Status Badge */}
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium text-gray-600">Status:</span>
                                            {!fbConfig ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                                                    <span className="w-2 h-2 rounded-full bg-gray-400" /> Not Configured
                                                </span>
                                            ) : fbConfig.isVerified ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                                                    <span className="w-2 h-2 rounded-full bg-green-500" /> Verified and Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700">
                                                    <span className="w-2 h-2 rounded-full bg-yellow-500" /> Configured (Unverified)
                                                </span>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                                            District and state event payments are collected into that district/state secretary&apos;s own Razorpay account when they have configured one. Otherwise they fall back to this account. If this is also not set, the central SSFI account is used.
                                        </div>

                                        {/* Form */}
                                        <form onSubmit={handleFbSave} className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium text-gray-600">Razorpay Key ID</label>
                                                <input
                                                    type="text"
                                                    value={fbForm.keyId}
                                                    onChange={(e) => setFbForm(p => ({ ...p, keyId: e.target.value }))}
                                                    placeholder="rzp_live_xxxxxxxxxxxxxxxx"
                                                    required
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium text-gray-600">Razorpay Key Secret</label>
                                                <div className="relative">
                                                    <input
                                                        type={showSecrets ? 'text' : 'password'}
                                                        value={fbForm.keySecret}
                                                        onChange={(e) => setFbForm(p => ({ ...p, keySecret: e.target.value }))}
                                                        placeholder={fbConfig ? '(enter new value to change)' : 'Enter your key secret'}
                                                        required={!fbConfig}
                                                        className="w-full px-4 py-2.5 pr-12 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                                                    />
                                                    <button type="button" onClick={() => setShowSecrets(!showSecrets)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                        {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium text-gray-600">Webhook Secret <span className="text-gray-400">(Optional)</span></label>
                                                <input
                                                    type={showSecrets ? 'text' : 'password'}
                                                    value={fbForm.webhookSecret}
                                                    onChange={(e) => setFbForm(p => ({ ...p, webhookSecret: e.target.value }))}
                                                    placeholder={fbConfig?.hasWebhookSecret ? '(enter new value to change)' : 'Enter your webhook secret'}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                                                />
                                            </div>

                                            <div className="flex flex-wrap gap-3 pt-2">
                                                <button type="submit" disabled={fbSaving} className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all font-medium">
                                                    {fbSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                                    Save Credentials
                                                </button>
                                                {fbConfig && (
                                                    <button type="button" onClick={handleFbTest} disabled={fbTesting} className="px-6 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all font-medium">
                                                        {fbTesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                                                        Test Integration
                                                    </button>
                                                )}
                                            </div>
                                        </form>

                                        {/* Danger Zone */}
                                        {fbConfig && (
                                            <div className="pt-4 border-t border-gray-200">
                                                <h3 className="text-sm font-semibold text-red-600 mb-2">Danger Zone</h3>
                                                <button onClick={handleFbDelete} className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 flex items-center gap-2 transition-all">
                                                    <Trash2 className="w-4 h-4" />
                                                    Remove Configuration
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : activeTab === 'profile' ? (
                            <form onSubmit={handleProfileUpdate} className="space-y-8">
                                {/* Incomplete geography blocks district event entry — tell them why. */}
                                {needsGeo && (
                                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-semibold text-amber-900">Complete your profile to register for events</p>
                                            <p className="text-sm text-amber-800 mt-0.5">
                                                Your State, District and Club are required to enter district championships.
                                                Please select them below and save. Once saved they are locked — contact your
                                                district secretary if anything needs correcting later.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Account info (read-only) */}
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-emerald-500" /> Account Information
                                    </h2>
                                    <p className="text-gray-500 text-sm mb-4">Phone number and SSFI ID cannot be changed.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Prefer the public SSFI membership id for STUDENTs
                                            (SSFI/BS/TN/25/S0275) — that's the one on their
                                            emails, receipts and what they recognise. Fall
                                            back to the internal User.uid otherwise. */}
                                        <ReadOnlyField
                                            label="SSFI ID"
                                            value={(fullUser?.profile as any)?.membershipId || fullUser?.uid}
                                            icon={User}
                                        />
                                        <ReadOnlyField label="Role" value={role?.replace(/_/g, ' ')} icon={Shield} />
                                        <ReadOnlyField label="Phone Number" value={fullUser?.phone} icon={Phone} />
                                        <InputField label="Email Address" value={formData.email || ''} onChange={(e: any) => setField('email', e.target.value)} type="email" icon={Mail} />
                                        <ReadOnlyField label="Aadhaar Number" value={profile?.aadhaarNumber ? `XXXX-XXXX-${profile.aadhaarNumber.slice(-4)}` : '—'} icon={Shield} />
                                        {role === 'STATE_SECRETARY' && (profile as any)?.state && (
                                            <ReadOnlyField label="State" value={(profile as any).state?.name} icon={MapPin} />
                                        )}
                                        {role === 'DISTRICT_SECRETARY' && (profile as any)?.district && (
                                            <ReadOnlyField label="District" value={`${(profile as any).district?.name}, ${(profile as any).district?.state?.name || ''}`} icon={MapPin} />
                                        )}
                                        {role === 'CLUB_OWNER' && (profile as any)?.club && (
                                            <ReadOnlyField label="Club" value={(profile as any).club?.name} icon={MapPin} />
                                        )}
                                        {role === 'STUDENT' && (
                                            <>
                                                {hasState ? (
                                                    <ReadOnlyField label="State" value={(profile as any).state.name} icon={MapPin} />
                                                ) : (
                                                    <SelectField
                                                        label="State *"
                                                        value={formData.stateId || ''}
                                                        onChange={(e: any) => handleStateChange(e.target.value)}
                                                        options={[{ value: '', label: 'Select State' }, ...(states || []).map((s: any) => ({ value: String(s.id), label: s.name }))]}
                                                    />
                                                )}

                                                {hasDistrict ? (
                                                    <ReadOnlyField label="District" value={(profile as any).district.name} icon={MapPin} />
                                                ) : (
                                                    <SelectField
                                                        label="District *"
                                                        value={formData.districtId || ''}
                                                        onChange={(e: any) => handleDistrictChange(e.target.value)}
                                                        disabled={!effStateId}
                                                        options={[{ value: '', label: effStateId ? 'Select District' : 'Select State first' }, ...(districts || []).map((d: any) => ({ value: String(d.id), label: d.name }))]}
                                                    />
                                                )}

                                                {hasClub ? (
                                                    <ReadOnlyField label="Club" value={(profile as any).club.name} icon={MapPin} />
                                                ) : (
                                                    <SelectField
                                                        label="Club *"
                                                        value={formData.clubId || ''}
                                                        onChange={(e: any) => setField('clubId', e.target.value)}
                                                        disabled={!effDistrictId}
                                                        options={[{ value: '', label: effDistrictId ? 'Select Club' : 'Select District first' }, ...(clubs || []).map((c: any) => ({ value: String(c.id), label: c.name }))]}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Profile Photo */}
                                {role === 'STUDENT' && (
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                                            <Camera className="w-5 h-5 text-emerald-500" /> Profile Photo
                                        </h2>
                                        <p className="text-gray-500 text-sm mb-4">Update your profile photo.</p>
                                        <div className="flex items-center gap-4">
                                            <div className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
                                                {(() => {
                                                    // Priority: locally-picked new file (data: URL) →
                                                    // stored profilePhoto → Aadhaar-KYC photo fallback.
                                                    // Resolve relative paths against the API origin.
                                                    const src =
                                                        resolvePhoto(formData.profilePhoto as string) ||
                                                        resolvePhoto((profile as any)?.profilePhoto) ||
                                                        resolvePhoto((profile as any)?.kycProfileImage);
                                                    return src ? (
                                                        <img src={src} alt="Profile" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-10 h-10 text-gray-300" />
                                                    );
                                                })()}
                                            </div>
                                            <div>
                                                <label className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-medium cursor-pointer hover:bg-emerald-100 transition-colors border border-emerald-200">
                                                    <Camera className="w-4 h-4" />
                                                    Change Photo
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => setField('profilePhoto', reader.result as string);
                                                            reader.readAsDataURL(file);
                                                        }}
                                                    />
                                                </label>
                                                <p className="text-xs text-gray-400 mt-2">JPG, PNG up to 5MB</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Personal details (editable) */}
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                                        <UserCheck className="w-5 h-5 text-green-500" /> Personal Details
                                    </h2>
                                    <p className="text-gray-500 text-sm mb-4">Update your personal information below.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <InputField label="Full Name" value={formData.name} onChange={(e: any) => setField('name', e.target.value)} required icon={User} />
                                        <SelectField
                                            label="Gender"
                                            value={formData.gender}
                                            onChange={(e: any) => setField('gender', e.target.value)}
                                            options={genderOptions.map(g => ({ value: g, label: g.charAt(0) + g.slice(1).toLowerCase() }))}
                                        />
                                        {role === 'STUDENT' && (
                                            <>
                                                <InputField label="Date of Birth" value={formData.dateOfBirth} onChange={(e: any) => setField('dateOfBirth', e.target.value)} type="date" icon={Calendar} />
                                                <SelectField
                                                    label="Blood Group"
                                                    value={formData.bloodGroup}
                                                    onChange={(e: any) => setField('bloodGroup', e.target.value)}
                                                    options={[{ value: '', label: 'Select Blood Group' }, ...bloodGroupOptions.map(bg => ({ value: bg, label: formatBloodGroup(bg) }))]}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Student-only: Family & School */}
                                {role === 'STUDENT' && (
                                    <>
                                        <div>
                                            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                                                <Heart className="w-5 h-5 text-teal-500" /> Family Details
                                            </h2>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                                <InputField label="Father's Name" value={formData.fatherName} onChange={(e: any) => setField('fatherName', e.target.value)} required />
                                                <InputField label="Mother's Name" value={formData.motherName} onChange={(e: any) => setField('motherName', e.target.value)} />
                                            </div>
                                        </div>

                                        <div>
                                            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                                                <GraduationCap className="w-5 h-5 text-teal-500" /> School & Coaching
                                            </h2>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                                <InputField label="School Name" value={formData.schoolName} onChange={(e: any) => setField('schoolName', e.target.value)} required />
                                                <SelectField
                                                    label="Academic Board"
                                                    value={formData.academicBoard}
                                                    onChange={(e: any) => setField('academicBoard', e.target.value)}
                                                    options={academicBoardOptions.map(b => ({ value: b, label: formatBoard(b) }))}
                                                />
                                                <InputField label="Coach Name" value={formData.coachName} onChange={(e: any) => setField('coachName', e.target.value)} required />
                                                <InputField label="Coach Phone" value={formData.coachPhone} onChange={(e: any) => setField('coachPhone', e.target.value)} required type="tel" icon={Phone} />
                                            </div>
                                        </div>

                                        <div>
                                            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                                                <Shield className="w-5 h-5 text-teal-500" /> Nominee (Insurance)
                                            </h2>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                                <InputField label="Nominee Name" value={formData.nomineeName} onChange={(e: any) => setField('nomineeName', e.target.value)} required />
                                                <InputField label="Nominee Age" value={formData.nomineeAge} onChange={(e: any) => setField('nomineeAge', e.target.value)} type="number" required />
                                                <InputField label="Relation" value={formData.nomineeRelation} onChange={(e: any) => setField('nomineeRelation', e.target.value)} required placeholder="Father / Mother / Guardian" />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Club-owner: Nominee details for the club
                                    (insurance / emergency contact). Saves via
                                    its own /clubs/my-club endpoint — separate
                                    button so the user doesn't have to re-save
                                    personal details to update it. */}
                                {role === 'CLUB_OWNER' && (
                                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-5">
                                        <div className="flex items-start justify-between mb-3 gap-3">
                                            <div>
                                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                                    <Shield className="w-5 h-5 text-emerald-600" /> Club Nominee
                                                </h2>
                                                <p className="text-gray-500 text-sm">Insurance / emergency contact for the club. Updates apply to your club record.</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                            <InputField
                                                label="Nominee Name"
                                                value={clubForm.nomineeName}
                                                onChange={(e: any) => setClubForm(p => ({ ...p, nomineeName: e.target.value }))}
                                                placeholder="Full name"
                                                icon={User}
                                            />
                                            <InputField
                                                label="Nominee Age"
                                                value={clubForm.nomineeAge}
                                                onChange={(e: any) => setClubForm(p => ({ ...p, nomineeAge: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                                                type="number"
                                                placeholder="Age in years"
                                            />
                                            <SelectField
                                                label="Relation"
                                                value={clubForm.nomineeRelation}
                                                onChange={(e: any) => setClubForm(p => ({ ...p, nomineeRelation: e.target.value }))}
                                                options={[
                                                    { value: '', label: 'Select relation' },
                                                    { value: 'Father', label: 'Father' },
                                                    { value: 'Mother', label: 'Mother' },
                                                    { value: 'Spouse', label: 'Spouse' },
                                                    { value: 'Son', label: 'Son' },
                                                    { value: 'Daughter', label: 'Daughter' },
                                                    { value: 'Brother', label: 'Brother' },
                                                    { value: 'Sister', label: 'Sister' },
                                                    { value: 'Guardian', label: 'Guardian' },
                                                    { value: 'Other', label: 'Other' },
                                                ]}
                                            />
                                        </div>
                                        <div className="mt-4">
                                            <button
                                                type="button"
                                                onClick={handleClubSave}
                                                disabled={clubSaving}
                                                className="px-5 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-2 transition-all font-medium text-sm"
                                            >
                                                {clubSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Save Nominee Details
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Address (all roles) */}
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                                        <MapPin className="w-5 h-5 text-emerald-500" /> Address
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                        <div className="md:col-span-2">
                                            <InputField label="Address Line 1" value={formData.addressLine1} onChange={(e: any) => setField('addressLine1', e.target.value)} required icon={MapPin} />
                                        </div>
                                        <div className="md:col-span-2">
                                            <InputField label="Address Line 2" value={formData.addressLine2} onChange={(e: any) => setField('addressLine2', e.target.value)} />
                                        </div>
                                        <InputField label="City" value={formData.city} onChange={(e: any) => setField('city', e.target.value)} required />
                                        <InputField label="Pincode" value={formData.pincode} onChange={(e: any) => setField('pincode', e.target.value)} required />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-200">
                                    <button type="submit" disabled={loading} className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all font-medium">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handlePasswordChange} className="space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 mb-1">Security Settings</h2>
                                    <p className="text-gray-500 text-sm">Use a strong password to protect your account.</p>
                                </div>

                                <div className="space-y-4 max-w-md">
                                    <InputField label="Current Password" value={passwordData.oldPassword} onChange={(e: any) => setPasswordData({ ...passwordData, oldPassword: e.target.value })} type="password" placeholder="••••••••" required icon={Lock} />
                                    <div>
                                        <InputField label="New Password" value={passwordData.newPassword} onChange={(e: any) => setPasswordData({ ...passwordData, newPassword: e.target.value })} type="password" placeholder="••••••••" required icon={Lock} />
                                        <p className="text-xs text-amber-600 mt-1">Tip: Use at least 8 characters with uppercase, lowercase, numbers & special characters for a stronger password.</p>
                                    </div>
                                    <InputField label="Confirm New Password" value={passwordData.confirmPassword} onChange={(e: any) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} type="password" placeholder="••••••••" required icon={Lock} />
                                </div>

                                <div className="pt-4 border-t border-gray-200">
                                    <button type="submit" disabled={loading} className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all font-medium">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                        Update Password
                                    </button>
                                </div>
                            </form>
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
