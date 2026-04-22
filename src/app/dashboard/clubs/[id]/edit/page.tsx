'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    ArrowLeft, Save, Loader2, AlertCircle, CheckCircle,
    Shield, MapPin, Phone, Mail, User, Calendar, Hash, Globe, FileText, Upload, X, UserCheck
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useStates, useDistricts } from '@/lib/hooks/useStudent';
import DownloadButton from '@/components/shared/DownloadButton';

interface ClubData {
    id: string;
    name: string;
    code: string;
    uid: string;
    email: string;
    phone: string;
    contactPerson: string;
    address: string;
    city: string;
    pincode: string;
    establishedYear: number | null;
    stateId: number;
    districtId: number;
    registrationNumber: string;
    website: string;
    logo: string;
    // Nominee (insurance / emergency contact)
    nomineeName: string;
    nomineeAge: number | string | null;
    nomineeRelation: string;
}

export default function EditClubPage() {
    const { id } = useParams();
    const router = useRouter();
    const { token } = useAuth();
    const [form, setForm] = useState<Partial<ClubData>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Cascading location hooks — admin can re-assign a club's state/district.
    const { fetchStates, data: statesList } = useStates();
    const { fetchDistricts, data: districtsList, clearDistricts } = useDistricts();

    useEffect(() => {
        if (!token || !id) return;
        (async () => {
            try {
                const res = await api.get(`/clubs/${id}`);
                const club = res.data?.data?.club || res.data?.data || res.data;
                setForm({
                    name: club.name || club.club_name || '',
                    code: club.code || '',
                    uid: club.uid || '',
                    email: club.email || '',
                    phone: club.phone || '',
                    contactPerson: club.contactPerson || '',
                    address: club.address || '',
                    city: club.city || '',
                    pincode: club.pincode || '',
                    establishedYear: club.establishedYear || club.established_year || null,
                    stateId: club.stateId,
                    districtId: club.districtId,
                    registrationNumber: club.registrationNumber || club.registration_number || '',
                    website: club.website || '',
                    logo: club.logo || '',
                    nomineeName: club.nomineeName || '',
                    nomineeAge: club.nomineeAge ?? '',
                    nomineeRelation: club.nomineeRelation || '',
                });
                if (club.logo) {
                    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || '';
                    setLogoPreview(club.logo.startsWith('http') ? club.logo : `${baseUrl}/${club.logo}`);
                }
            } catch {
                setError('Failed to load club details.');
            } finally {
                setLoading(false);
            }
        })();
    }, [token, id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    // Load states once on mount
    useEffect(() => { fetchStates(); }, [fetchStates]);

    // Whenever the club's state changes (either loaded or user-picked),
    // refresh the district list for that state.
    useEffect(() => {
        if (form.stateId) fetchDistricts(String(form.stateId));
        else clearDistricts();
    }, [form.stateId, fetchDistricts, clearDistricts]);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setError('Logo must be under 5MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            setLogoPreview(result);
            setForm(prev => ({ ...prev, logo: result }));
        };
        reader.readAsDataURL(file);
    };

    const removeLogo = () => {
        setLogoPreview(null);
        setForm(prev => ({ ...prev, logo: '' }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await api.put(`/clubs/${id}`, form);
            setSuccess('Club updated successfully!');
            setTimeout(() => router.push('/dashboard/clubs'), 1500);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to update club.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        );
    }

    const field = (label: string, name: string, icon: React.ReactNode, type = 'text', disabled = false) => (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
                <input
                    type={type}
                    name={name}
                    value={(form as any)[name] ?? ''}
                    onChange={handleChange}
                    disabled={disabled}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-center gap-3 mb-6">
                <Link href="/dashboard/clubs" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Edit Club</h1>
                    <p className="text-sm text-gray-500">UID: {form.uid}</p>
                </div>
            </div>

            {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" /> {error}
                </motion.div>
            )}
            {success && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" /> {success}
                </motion.div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-emerald-600" /> Club Information
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {field('Club Name', 'name', <Shield className="w-4 h-4" />)}
                        {field('Club Code', 'code', <Hash className="w-4 h-4" />, 'text', true)}
                        {field('Registration Number', 'registrationNumber', <FileText className="w-4 h-4" />)}
                        {field('Contact Person', 'contactPerson', <User className="w-4 h-4" />)}
                        {field('Email', 'email', <Mail className="w-4 h-4" />, 'email')}
                        {field('Phone', 'phone', <Phone className="w-4 h-4" />, 'tel')}
                        {field('Address', 'address', <MapPin className="w-4 h-4" />)}
                        {field('City', 'city', <MapPin className="w-4 h-4" />)}
                        {field('Pincode', 'pincode', <Hash className="w-4 h-4" />)}
                        {field('Established Year', 'establishedYear', <Calendar className="w-4 h-4" />, 'number')}
                        {field('Website', 'website', <Globe className="w-4 h-4" />, 'url')}

                        {/* State + District — admin can re-assign a club's
                            location (common for data cleanup when the wrong
                            district was picked on original registration). */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><MapPin className="w-4 h-4" /></span>
                                <select
                                    name="stateId"
                                    value={form.stateId ?? ''}
                                    onChange={e => {
                                        const v = e.target.value ? Number(e.target.value) : undefined;
                                        // Changing state invalidates the current district — reset it.
                                        setForm(prev => ({ ...prev, stateId: v, districtId: undefined }));
                                    }}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                >
                                    <option value="">Select state</option>
                                    {statesList.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><MapPin className="w-4 h-4" /></span>
                                <select
                                    name="districtId"
                                    value={form.districtId ?? ''}
                                    onChange={e => {
                                        const v = e.target.value ? Number(e.target.value) : undefined;
                                        setForm(prev => ({ ...prev, districtId: v }));
                                    }}
                                    disabled={!form.stateId}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                >
                                    <option value="">{form.stateId ? 'Select district' : 'Pick state first'}</option>
                                    {districtsList.map((d: any) => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Nominee Details (insurance / emergency contact) */}
                    <div className="pt-2 border-t border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-emerald-600" /> Nominee Details
                            <span className="text-xs font-normal text-gray-400 ml-auto">For insurance / emergency contact</span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nominee Name</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><User className="w-4 h-4" /></span>
                                    <input
                                        type="text"
                                        name="nomineeName"
                                        value={form.nomineeName ?? ''}
                                        onChange={handleChange}
                                        placeholder="Full name of nominee"
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nominee Age</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Calendar className="w-4 h-4" /></span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={120}
                                        name="nomineeAge"
                                        value={form.nomineeAge ?? ''}
                                        onChange={handleChange}
                                        placeholder="Age"
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Relation</label>
                                <select
                                    name="nomineeRelation"
                                    value={form.nomineeRelation ?? ''}
                                    onChange={e => setForm(prev => ({ ...prev, nomineeRelation: e.target.value }))}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                >
                                    <option value="">Select relation</option>
                                    <option value="Father">Father</option>
                                    <option value="Mother">Mother</option>
                                    <option value="Spouse">Spouse</option>
                                    <option value="Son">Son</option>
                                    <option value="Daughter">Daughter</option>
                                    <option value="Brother">Brother</option>
                                    <option value="Sister">Sister</option>
                                    <option value="Guardian">Guardian</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Club Logo Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Club Logo</label>
                        <div className="flex items-start gap-4">
                            {logoPreview ? (
                                <div className="relative">
                                    <img src={logoPreview} alt="Club Logo" className="w-24 h-24 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                                    <button type="button" onClick={removeLogo} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                                    <Upload className="w-6 h-6 text-gray-400" />
                                </div>
                            )}
                            <div className="flex flex-col gap-2">
                                <label className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg cursor-pointer hover:bg-emerald-100 transition-colors text-sm font-medium inline-flex items-center gap-2 w-fit">
                                    <Upload className="w-4 h-4" />
                                    {logoPreview ? 'Change Logo' : 'Upload Logo'}
                                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" />
                                </label>
                                <p className="text-xs text-gray-500">PNG, JPG or WebP. Max 5MB.</p>
                                {form.logo && (
                                    <DownloadButton url={form.logo} filename={`${form.name || 'club'}-logo`} label="Download current logo" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <Link href="/dashboard/clubs" className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}
