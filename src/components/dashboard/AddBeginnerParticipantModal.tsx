'use client';

/**
 * Admin-side "Add Participant Manually" modal for the
 * beginner-certification program detail page. Same shape as the coach
 * version (see AddCoachParticipantModal) — backend endpoints are
 * /beginner-cert/admin-create (offline) and /beginner-cert/admin-initiate
 * (online Razorpay link). The beginner schema differs from coach: it
 * adds guardian fields (mandatory), a 3-25 age window, mother's name,
 * whatsapp, currentSkillLevel, clubName, and an extra optional file
 * (birthCertificate) on top of photo + aadhaarCard.
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Loader2, CreditCard, Copy, Check, Upload } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { toast } from 'react-hot-toast';

type PaymentMode = 'offline' | 'online';

interface Props {
  programId: number;
  programTitle: string;
  programPrice: number;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const TSHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    {children}
  </div>
);

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';

export default function AddBeginnerParticipantModal({ programId, programTitle, programPrice, open, onClose, onAdded }: Props) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('offline');
  const [saving, setSaving] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);
  const aadhaarRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [birthFile, setBirthFile] = useState<File | null>(null);

  const initial = {
    fullName: '', fatherName: '', motherName: '',
    gender: 'MALE', dateOfBirth: '', age: '',
    phone: '', email: '', whatsapp: '',
    address: '', city: '', district: '', state: '', pincode: '',
    bloodGroup: '', skatingExperience: '', currentSkillLevel: '', clubName: '', tshirtSize: '',
    guardianName: '', guardianRelation: 'FATHER', guardianPhone: '', guardianEmail: '',
    aadhaarNumber: '',
  };
  const [form, setForm] = useState(initial);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const reset = () => {
    setForm(initial);
    setPhotoFile(null); setAadhaarFile(null); setBirthFile(null);
    setPaymentLink(null); setLinkCopied(false);
    setPaymentMode('offline');
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const validate = (): string | null => {
    if (!form.fullName.trim()) return 'Full name is required';
    if (!form.fatherName.trim()) return "Father's name is required";
    if (!form.dateOfBirth) return 'Date of birth is required';
    if (!/^[6-9]\d{9}$/.test(form.phone)) return 'Phone must be a 10-digit Indian mobile';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Valid email is required';
    if (form.address.trim().length < 5) return 'Address is required (min 5 chars)';
    if (!form.city.trim() || !form.district.trim() || !form.state.trim()) return 'City / District / State are required';
    if (!form.pincode.trim()) return 'Pincode is required';
    if (!form.guardianName.trim()) return 'Guardian name is required';
    if (!/^[6-9]\d{9}$/.test(form.guardianPhone)) return 'Guardian phone must be a 10-digit Indian mobile';
    if (form.aadhaarNumber && form.aadhaarNumber.trim() && !/^\d{12}$/.test(form.aadhaarNumber.trim())) return 'Aadhaar (if provided) must be 12 digits';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);

    const fd = new FormData();
    fd.append('programId', String(programId));
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) fd.append(k, String(v));
    });
    fd.append('declaration1', 'true');
    fd.append('declaration2', 'true');
    fd.append('declaration3', 'true');
    if (photoFile) fd.append('photo', photoFile);
    if (aadhaarFile) fd.append('aadhaarCard', aadhaarFile);
    if (birthFile) fd.append('birthCertificate', birthFile);

    const endpoint = paymentMode === 'offline' ? '/beginner-cert/admin-create' : '/beginner-cert/admin-initiate';
    try {
      const res = await apiClient.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = res.data?.data;

      if (paymentMode === 'offline') {
        toast.success('Participant added (offline payment recorded).');
        onAdded();
        handleClose();
      } else {
        const link = `${window.location.origin}/register/payment?orderId=${data.razorpayOrderId}&amount=${data.amount}&name=${encodeURIComponent(form.fullName)}&type=beginner-cert&key=${data.key}`;
        setPaymentLink(link);
        toast.success('Payment link generated. Share it with the participant.');
        onAdded();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to add participant');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = () => {
    if (!paymentLink) return;
    navigator.clipboard.writeText(paymentLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
    toast.success('Link copied');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Add Participant Manually</h3>
                <p className="text-xs text-gray-500 mt-0.5">{programTitle} · ₹{programPrice.toLocaleString('en-IN')}</p>
              </div>
              <button onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
              {paymentLink ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <p className="text-sm font-semibold text-emerald-900 mb-1">Registration created — payment pending</p>
                    <p className="text-xs text-emerald-800">Share this link with the participant. Their registration will auto-confirm once they complete payment.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input readOnly value={paymentLink} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 truncate" />
                    <button onClick={copyLink} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                      {linkCopied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <section>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Personal Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Full Name" required><input className={inputCls} value={form.fullName} onChange={e => set('fullName', e.target.value)} /></Field>
                      <Field label="Father's Name" required><input className={inputCls} value={form.fatherName} onChange={e => set('fatherName', e.target.value)} /></Field>
                      <Field label="Mother's Name"><input className={inputCls} value={form.motherName} onChange={e => set('motherName', e.target.value)} /></Field>
                      <Field label="Gender" required>
                        <select className={inputCls} value={form.gender} onChange={e => set('gender', e.target.value)}>
                          <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
                        </select>
                      </Field>
                      <Field label="Date of Birth" required><input type="date" className={inputCls} value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></Field>
                      <Field label="Age (years)">
                        <input type="number" min={3} max={25} className={inputCls} value={form.age}
                          onChange={e => set('age', e.target.value)} />
                      </Field>
                      <Field label="Phone" required>
                        <input className={inputCls} type="tel" inputMode="numeric" maxLength={10} value={form.phone}
                          onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                      </Field>
                      <Field label="Email" required><input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
                      <Field label="WhatsApp">
                        <input className={inputCls} type="tel" inputMode="numeric" maxLength={10} value={form.whatsapp}
                          onChange={e => set('whatsapp', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                      </Field>
                      <Field label="Aadhaar Number">
                        <input className={inputCls} inputMode="numeric" maxLength={12} value={form.aadhaarNumber}
                          onChange={e => set('aadhaarNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="Optional — 12 digits if available" />
                      </Field>
                      <Field label="Blood Group">
                        <select className={inputCls} value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                          <option value="">—</option>
                          {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </Field>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Guardian</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Guardian Name" required><input className={inputCls} value={form.guardianName} onChange={e => set('guardianName', e.target.value)} /></Field>
                      <Field label="Relation" required>
                        <select className={inputCls} value={form.guardianRelation} onChange={e => set('guardianRelation', e.target.value)}>
                          <option value="FATHER">Father</option><option value="MOTHER">Mother</option><option value="GUARDIAN">Guardian</option>
                        </select>
                      </Field>
                      <Field label="Guardian Phone" required>
                        <input className={inputCls} type="tel" inputMode="numeric" maxLength={10} value={form.guardianPhone}
                          onChange={e => set('guardianPhone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                      </Field>
                      <Field label="Guardian Email"><input type="email" className={inputCls} value={form.guardianEmail} onChange={e => set('guardianEmail', e.target.value)} /></Field>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Address</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2"><Field label="Address" required><input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} /></Field></div>
                      <Field label="City" required><input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} /></Field>
                      <Field label="District" required><input className={inputCls} value={form.district} onChange={e => set('district', e.target.value)} /></Field>
                      <Field label="State" required><input className={inputCls} value={form.state} onChange={e => set('state', e.target.value)} /></Field>
                      <Field label="Pincode" required>
                        <input className={inputCls} inputMode="numeric" maxLength={6} value={form.pincode}
                          onChange={e => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} />
                      </Field>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Skating</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Field label="Experience (Months)">
                        <input type="number" min={0} className={inputCls} value={form.skatingExperience}
                          onChange={e => set('skatingExperience', e.target.value)} />
                      </Field>
                      <Field label="Skill Level">
                        <select className={inputCls} value={form.currentSkillLevel} onChange={e => set('currentSkillLevel', e.target.value)}>
                          <option value="">—</option>
                          <option value="BEGINNER">Beginner</option>
                          <option value="BASIC">Basic</option>
                          <option value="INTERMEDIATE">Intermediate</option>
                        </select>
                      </Field>
                      <Field label="Club / Academy">
                        <input className={inputCls} value={form.clubName} onChange={e => set('clubName', e.target.value)} />
                      </Field>
                      <Field label="T-Shirt Size">
                        <select className={inputCls} value={form.tshirtSize} onChange={e => set('tshirtSize', e.target.value)}>
                          <option value="">—</option>
                          {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </Field>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Documents (optional)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Photo</label>
                        <button type="button" onClick={() => photoRef.current?.click()}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                          <Upload className="w-4 h-4" /> {photoFile ? photoFile.name : 'Photo'}
                        </button>
                        <input ref={photoRef} type="file" accept="image/*" className="hidden"
                          onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Aadhaar Card</label>
                        <button type="button" onClick={() => aadhaarRef.current?.click()}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                          <Upload className="w-4 h-4" /> {aadhaarFile ? aadhaarFile.name : 'Aadhaar'}
                        </button>
                        <input ref={aadhaarRef} type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => setAadhaarFile(e.target.files?.[0] || null)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Birth Certificate</label>
                        <button type="button" onClick={() => birthRef.current?.click()}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                          <Upload className="w-4 h-4" /> {birthFile ? birthFile.name : 'Birth Cert'}
                        </button>
                        <input ref={birthRef} type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => setBirthFile(e.target.files?.[0] || null)} />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Payment Mode</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button type="button" onClick={() => setPaymentMode('offline')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${paymentMode === 'offline' ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentMode === 'offline' ? 'border-emerald-500' : 'border-gray-300'}`}>
                            {paymentMode === 'offline' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                          </div>
                          <span className="font-semibold text-sm text-gray-900">Offline Payment</span>
                        </div>
                        <p className="text-xs text-gray-500 ml-6">Fee already collected. Marks PAID + REGISTERED immediately.</p>
                      </button>
                      <button type="button" onClick={() => setPaymentMode('online')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${paymentMode === 'online' ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentMode === 'online' ? 'border-emerald-500' : 'border-gray-300'}`}>
                            {paymentMode === 'online' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                          </div>
                          <span className="font-semibold text-sm text-gray-900">Online Payment</span>
                        </div>
                        <p className="text-xs text-gray-500 ml-6">Generates a Razorpay link to share. Auto-confirms when paid.</p>
                      </button>
                    </div>
                  </section>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={handleClose} disabled={saving}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-50">
                {paymentLink ? 'Close' : 'Cancel'}
              </button>
              {!paymentLink && (
                <button onClick={handleSubmit} disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> :
                    paymentMode === 'offline' ? <Save className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                  {paymentMode === 'offline' ? 'Add Participant' : 'Generate Payment Link'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
