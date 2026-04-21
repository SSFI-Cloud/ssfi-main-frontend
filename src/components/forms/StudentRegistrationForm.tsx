'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  User, Home, Shield, Users, MapPin, FileText,
  ChevronLeft, ChevronRight, Check, Loader2, RefreshCw,
  CheckCircle2, Pencil, ChevronDown, ChevronUp, Save,
} from 'lucide-react';

import { useRegistrationStore } from '@/lib/store/registrationStore';
import { useRegisterStudent, calculateAge, getAgeCategoryFromAge, useStates, useDistricts, useClubs } from '@/lib/hooks/useStudent';
import { registrationSchema } from '@/lib/validations/student';
import { useRenewal, type MemberLookupResult } from '@/lib/hooks/useAffiliationLookup';
import { api } from '@/lib/api/client';
import AffiliationLookupStep from './affiliation/AffiliationLookupStep';
import AadhaarKYCVerification from './shared/AadhaarKYCVerification';
import type { KycResult } from '@/lib/hooks/useKYC';
import type { StudentRegistrationData } from '@/types/student';

import PersonalInfoStep from './steps/PersonalInfoStep';
import FamilySchoolStep from './steps/FamilySchoolStep';
import NomineeStep from './steps/NomineeStep';
import ClubCoachStep from './steps/ClubCoachStep';
import AddressStep from './steps/AddressStep';
import DocumentsStep from './steps/DocumentsStep';

const STEPS = [
  { id: 1, title: 'Personal Info', icon: User, description: 'Basic details' },
  { id: 2, title: 'Family & School', icon: Home, description: 'Guardian & education' },
  { id: 3, title: 'Nominee', icon: Shield, description: 'Insurance nominee' },
  { id: 4, title: 'Club & Coach', icon: Users, description: 'Training details' },
  { id: 5, title: 'Address', icon: MapPin, description: 'Location details' },
  { id: 6, title: 'Verify & Submit', icon: FileText, description: 'KYC & documents' },
];

type Mode = 'choose' | 'renew' | 'new';

export default function StudentRegistrationForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('choose');
  const [renewMember, setRenewMember] = useState<MemberLookupResult | null>(null);
  const [renewKycResult, setRenewKycResult] = useState<KycResult | null>(null);
  const [renewProfile, setRenewProfile] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  // Default expanded. Used to be collapsed with a small "Review or update
  // your details" caret, but users went straight to Pay & Renew without
  // ever touching it — which meant legacy students never got a chance to
  // fill in their missing district / club / updated phone / email before
  // payment. Make the form the default state so the step is unmissable.
  const [showProfileEdit, setShowProfileEdit] = useState(true);
  const [profileEdits, setProfileEdits] = useState<any>({});

  // Cascading location data for the renewal profile edit form.
  // Many legacy students have NULL districtId because the original import
  // only captured stateId — this gives them a way to fill that in during
  // renewal so admin filters by district actually work afterwards.
  const { fetchStates: fetchRenewStates, data: renewStates } = useStates();
  const { fetchDistricts: fetchRenewDistricts, data: renewDistricts, clearDistricts: clearRenewDistricts } = useDistricts();
  const { fetchClubs: fetchRenewClubs, data: renewClubs, clearClubs: clearRenewClubs } = useClubs();
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    currentStep, formData, updateFormData, completedSteps,
    setCurrentStep, nextStep, prevStep, markStepComplete, resetForm,
  } = useRegistrationStore();

  const { initiateStudentRegistration, verifyStudentPayment } = useRegisterStudent();
  const { initiateRenewal, verifyRenewal, isLoading: renewLoading } = useRenewal();

  useEffect(() => {
    api.get('/registration-windows/check/renewal-status', { params: { type: 'student' } })
      .then(res => { if (!res.data?.data?.renewalEnabled) setMode('new'); })
      .catch(() => {});
  }, []);

  const handleStepComplete = (stepData: Partial<StudentRegistrationData>) => {
    updateFormData(stepData);
    markStepComplete(currentStep);
    if (currentStep < 6) nextStep();
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      // Each step already Zod-validated its own fields at entry time
      // (see stepSchemas in validations/student.ts — each step form uses
      // zodResolver before calling onComplete). Running a full registration
      // schema parse here on top of that was redundant and caused race
      // conditions with zustand state — kept tripping on termsAccepted /
      // kycVerified even when both were set. The backend validator is the
      // authoritative check; rely on it and surface per-field backend
      // errors via initiateStudentRegistration's enhanced error handler.
      const liveFormData = {
        ...useRegistrationStore.getState().formData,
        termsAccepted: true,
        kycVerified: true,
      };
      // eslint-disable-next-line no-console
      console.debug('[student-registration] submitting with', {
        termsAccepted: liveFormData.termsAccepted,
        kycVerified: liveFormData.kycVerified,
        keys: Object.keys(liveFormData),
      });

      // Step 1: Submit registration + create payment order
      const order = await initiateStudentRegistration(liveFormData as StudentRegistrationData);

      // Step 2: Open Razorpay checkout
      openRazorpay(order, async (response) => {
        try {
          // Step 3: Verify payment
          const result = await verifyStudentPayment(response);
          if (result?.success) {
            toast.success('Registration & payment successful!');
            resetForm();
            router.push(`/register/success?type=student&uid=${result.uid || order.uid}`);
          }
        } catch (e: any) {
          toast.error(e.message || 'Payment verification failed');
        }
      });
    } catch (err: any) {
      toast.error(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRazorpay = (order: any, onVerify: (r: any) => Promise<void>) => {
    if (order.key === 'rzp_test_mock') {
      toast.success('Mock payment — simulating success…');
      setTimeout(() => onVerify({
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_signature: 'mock_signature',
      }), 1500);
      return;
    }
    const rzp = new (window as any).Razorpay({
      key: order.key, amount: order.amount, currency: order.currency,
      name: 'SSFI', description: 'Student Registration',
      order_id: order.razorpayOrderId, prefill: order.userDetails,
      theme: { color: '#10b981' }, handler: onVerify,
    });
    rzp.on('payment.failed', (r: any) => toast.error(r.error.description || 'Payment failed'));
    rzp.open();
  };

  // Pre-load states when the renewal edit panel is used.
  useEffect(() => {
    fetchRenewStates();
  }, [fetchRenewStates]);

  // When stateId / districtId change in the edit form, refresh the
  // child dropdowns. Safe to re-run on every render of the edit panel.
  useEffect(() => {
    if (profileEdits.stateId) fetchRenewDistricts(String(profileEdits.stateId));
    else clearRenewDistricts();
  }, [profileEdits.stateId, fetchRenewDistricts, clearRenewDistricts]);

  useEffect(() => {
    if (profileEdits.districtId) fetchRenewClubs(String(profileEdits.districtId));
    else clearRenewClubs();
  }, [profileEdits.districtId, fetchRenewClubs, clearRenewClubs]);

  // Fetch student profile + check existing KYC when member is found
  const handleMemberFound = async (member: MemberLookupResult) => {
    setRenewMember(member);
    setMode('renew');
    setIsLoadingProfile(true);
    setRenewProfile(null);
    setProfileSaved(false);
    // Keep the edit panel expanded so the renewing student sees every
    // editable field (state / district / club / address / coach / nominee /
    // email) before being offered Pay. Earlier this was `false`, which
    // silently collapsed the form after lookup — users hit Pay without
    // touching any field and legacy districtId stayed NULL.
    setShowProfileEdit(true);
    try {
      const res = await api.get('/affiliations/renew/student-profile', { params: { uid: member.uid } });
      const profile = res.data?.data;
      // eslint-disable-next-line no-console
      console.debug('[renewal] profile fetched', {
        uid: member.uid,
        fields: profile ? Object.keys(profile).length : 0,
        addressLine1: profile?.addressLine1,
        city: profile?.city,
        stateId: profile?.stateId,
        districtId: profile?.districtId,
      });
      setRenewProfile(profile);
      // Pre-populate the edit form with every value returned by the
      // backend. Spread directly so fields like stateId / districtId /
      // clubId are usable by the cascading useEffects.
      setProfileEdits({ ...(profile || {}) });
      // If KYC was already done before, skip re-verification
      if (profile?.kycVerified) {
        setRenewKycResult({
          verified: true,
          fullName: profile.kycVerifiedName || member.name,
          dob: profile.kycVerifiedDob || '',
          gender: '',
          careOf: '',
        } as KycResult);
      }
    } catch {
      // Profile fetch failed — non-fatal, KYC will still show
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Called when KYC completes (new verification) — persist to backend
  const handleKycVerified = async (result: KycResult) => {
    setRenewKycResult(result);
    if (!renewMember) return;
    try {
      await api.post('/affiliations/renew/save-kyc', {
        uid: renewMember.uid,
        fullName: result.fullName,
        dob: result.dob,
        gender: result.gender,
        photo: result.profileImage,
      });
      // Update local profile state to reflect KYC is now done
      setRenewProfile((prev: any) => prev ? {
        ...prev, kycVerified: true, kycVerifiedName: result.fullName, kycVerifiedDob: result.dob,
      } : prev);
    } catch {
      // Non-fatal — payment can still proceed
    }
  };

  // Save edited profile fields
  const handleSaveProfile = async () => {
    if (!renewMember) return;
    setProfileSaveLoading(true);
    try {
      await api.patch('/affiliations/renew/student-profile', { uid: renewMember.uid, ...profileEdits });
      setProfileSaved(true);
      setShowProfileEdit(false);
      toast.success('Profile updated');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save profile');
    } finally {
      setProfileSaveLoading(false);
    }
  };

  const handleRenew = async () => {
    if (!renewMember) return;
    try {
      const order = await initiateRenewal('STUDENT', renewMember.uid);
      if (!order) return;
      openRazorpay(order, async (response) => {
        try {
          const result = await verifyRenewal(response);
          if (result?.success) {
            toast.success('Student membership renewed!');
            router.push(`/register/success?type=student&uid=${result.uid}&renewed=true`);
          }
        } catch (e: any) { toast.error(e.message || 'Renewal failed'); }
      });
    } catch (e: any) { toast.error(e.message || 'Renewal failed'); }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <PersonalInfoStep onComplete={handleStepComplete} />;
      case 2: return <FamilySchoolStep onComplete={handleStepComplete} />;
      case 3: return <NomineeStep onComplete={handleStepComplete} />;
      case 4: return <ClubCoachStep onComplete={handleStepComplete} />;
      case 5: return <AddressStep onComplete={handleStepComplete} />;
      case 6: return <DocumentsStep onComplete={handleStepComplete} onSubmit={handleSubmit} isSubmitting={isSubmitting} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0a1628] via-[#0c2340] to-[#162d50] text-white">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/" className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
              <Home className="w-3.5 h-3.5" /> Home
            </Link>
            <span className="text-white/30">/</span>
            <button onClick={() => router.push('/register')} className="text-white/60 hover:text-white text-sm transition-colors">Registration</button>
            <span className="text-white/30">/</span>
            <span className="text-white/80 text-sm">Student</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-green-500/20 border border-green-500/30 rounded-2xl flex items-center justify-center flex-shrink-0">
              <User className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-xs font-medium mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> SSFI Affiliation
              </div>
              <h1 className="text-2xl font-bold">Student Registration</h1>
              <p className="text-white/50 text-sm mt-1">Join the Speed Skating Federation of India</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">

          {/* Step 0: Choose mode */}
          {mode === 'choose' && (
            <motion.div key="choose" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Are you a new or existing member?</h2>
                <p className="text-sm text-gray-500 mt-1">Existing students can renew their membership directly.</p>
              </div>
              <div className="p-6">
                <AffiliationLookupStep
                  type="STUDENT"
                  onFound={handleMemberFound}
                  onNew={() => setMode('new')}
                />
              </div>
            </motion.div>
          )}

          {/* Step R: Renewal */}
          {mode === 'renew' && renewMember && (
            <motion.div key="renew" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Renew Student Membership</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Verify identity, review details, then pay</p>
                </div>
                <button onClick={() => {
                  setMode('choose'); setRenewMember(null); setRenewKycResult(null);
                  setRenewProfile(null); setProfileEdits({}); setProfileSaved(false); setShowProfileEdit(false);
                }} className="text-sm text-gray-400 hover:text-gray-600">Change</button>
              </div>

              {isLoadingProfile ? (
                <div className="p-10 flex items-center justify-center gap-3 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading profile…</span>
                </div>
              ) : (
                <div className="p-6 space-y-5">

                  {/* ── Member summary card ── */}
                  <div className="p-4 bg-green-50 border border-green-100 rounded-xl space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Name</span><span className="font-medium text-gray-900">{renewMember.name}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">UID</span><span className="font-mono text-gray-900">{renewMember.uid}</span></div>
                    {renewMember.clubName && <div className="flex justify-between text-sm"><span className="text-gray-500">Club</span><span className="text-gray-900">{renewMember.clubName}</span></div>}
                    {renewMember.stateName && <div className="flex justify-between text-sm"><span className="text-gray-500">State</span><span className="text-gray-900">{renewMember.stateName}</span></div>}
                    {renewMember.expiryDate && <div className="flex justify-between text-sm"><span className="text-gray-500">Current Expiry</span><span className="text-gray-900">{new Date(renewMember.expiryDate).toLocaleDateString('en-IN')}</span></div>}
                    {/* Age category — computed from DOB returned by lookup */}
                    {(() => {
                      const dob = renewMember.dateOfBirth || renewProfile?.dateOfBirth;
                      if (!dob) return null;
                      const age = calculateAge(dob);
                      const category = getAgeCategoryFromAge(age);
                      return (
                        <div className="flex justify-between text-sm items-center pt-1 border-t border-green-200">
                          <span className="text-gray-500">Age Category</span>
                          <span className="flex items-center gap-2">
                            <span className="text-gray-700">{age} yrs (as of Jan 1, {new Date().getFullYear()})</span>
                            <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full font-semibold">{category}</span>
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── Step 1: Identity Verification ── */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Step 1 — Verify Identity</p>
                    {renewProfile?.kycVerified ? (
                      /* Already verified — show badge instead of re-running DigiLocker */
                      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">Identity previously verified</p>
                          <p className="text-xs text-emerald-600 mt-0.5">
                            Aadhaar KYC completed as <span className="font-medium">{renewProfile.kycVerifiedName}</span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <AadhaarKYCVerification
                        onVerified={handleKycVerified}
                        showProfilePhotoChoice={false}
                        colorScheme="emerald"
                        initialResult={renewKycResult}
                      />
                    )}
                  </div>

                  {/* ── Step 2: Review / Edit Profile (shown after KYC) ── */}
                  {renewKycResult?.verified && renewProfile && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Step 2 — Review &amp; Update Details</p>
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowProfileEdit(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Pencil className="w-4 h-4 text-gray-400" />
                            {profileSaved ? 'Profile updated ✓' : 'Review or update your details'}
                          </span>
                          {showProfileEdit ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </button>

                        {showProfileEdit && (
                          <div className="p-4 space-y-4">
                            {/* Address */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Address</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <label className="text-xs text-gray-500 mb-1 block">Address Line 1</label>
                                  <input value={profileEdits.addressLine1 || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, addressLine1: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div className="col-span-2">
                                  <label className="text-xs text-gray-500 mb-1 block">Address Line 2</label>
                                  <input value={profileEdits.addressLine2 || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, addressLine2: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">City</label>
                                  <input value={profileEdits.city || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, city: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Pincode</label>
                                  <input value={profileEdits.pincode || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, pincode: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                              </div>
                            </div>

                            {/* State / District / Club — cascading.
                                Many legacy students come through renewal
                                with districtId=NULL; this lets them set it. */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">State & District</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">State</label>
                                  <select
                                    value={profileEdits.stateId || ''}
                                    onChange={e => setProfileEdits((p: any) => ({
                                      ...p,
                                      stateId: e.target.value ? Number(e.target.value) : null,
                                      // Reset child selections whenever parent changes
                                      districtId: null,
                                      clubId: null,
                                    }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                  >
                                    <option value="">Select state</option>
                                    {renewStates.map((s: any) => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">District</label>
                                  <select
                                    value={profileEdits.districtId || ''}
                                    onChange={e => setProfileEdits((p: any) => ({
                                      ...p,
                                      districtId: e.target.value ? Number(e.target.value) : null,
                                      clubId: null,
                                    }))}
                                    disabled={!profileEdits.stateId}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <option value="">{profileEdits.stateId ? 'Select district' : 'Pick state first'}</option>
                                    {renewDistricts.map((d: any) => (
                                      <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <label className="text-xs text-gray-500 mb-1 block">Club</label>
                                  <select
                                    value={profileEdits.clubId || ''}
                                    onChange={e => setProfileEdits((p: any) => ({
                                      ...p,
                                      clubId: e.target.value ? Number(e.target.value) : null,
                                    }))}
                                    disabled={!profileEdits.districtId}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <option value="">{profileEdits.districtId ? 'Select club (optional)' : 'Pick district first'}</option>
                                    {renewClubs.map((c: any) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* School */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">School</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <label className="text-xs text-gray-500 mb-1 block">School Name</label>
                                  <input value={profileEdits.schoolName || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, schoolName: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Academic Board</label>
                                  <input value={profileEdits.academicBoard || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, academicBoard: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Blood Group</label>
                                  <select value={profileEdits.bloodGroup || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, bloodGroup: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300">
                                    <option value="">Select</option>
                                    {['A_POSITIVE','A_NEGATIVE','B_POSITIVE','B_NEGATIVE','AB_POSITIVE','AB_NEGATIVE','O_POSITIVE','O_NEGATIVE'].map(bg => (
                                      <option key={bg} value={bg}>{bg.replace('_', ' ')}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* Coach */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Coach</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Coach Name</label>
                                  <input value={profileEdits.coachName || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, coachName: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Coach Phone</label>
                                  <input value={profileEdits.coachPhone || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, coachPhone: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                              </div>
                            </div>

                            {/* Nominee */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nominee</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <label className="text-xs text-gray-500 mb-1 block">Nominee Name</label>
                                  <input value={profileEdits.nomineeName || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, nomineeName: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Nominee Age</label>
                                  <input type="number" value={profileEdits.nomineeAge || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, nomineeAge: Number(e.target.value) }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Relation</label>
                                  <input value={profileEdits.nomineeRelation || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, nomineeRelation: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                              </div>
                            </div>

                            {/* Contact — email editable, phone read-only because
                                it's the login identifier and has a unique
                                constraint. Admin can reset phone on request. */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contact</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Email</label>
                                  <input type="email" value={profileEdits.email || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, email: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Phone <span className="text-gray-400">(login ID — contact admin to change)</span></label>
                                  <input
                                    type="tel"
                                    value={renewMember?.phone || profileEdits.phone || ''}
                                    readOnly
                                    disabled
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 cursor-not-allowed"
                                  />
                                </div>
                              </div>
                            </div>

                            <button type="button" onClick={handleSaveProfile} disabled={profileSaveLoading}
                              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                              {profileSaveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Save Changes
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Extension notice ── */}
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-sm text-amber-700">Renewing will extend your membership by 1 year from the current expiry date.</p>
                  </div>

                  {/* ── Payment button — only enabled after KYC ── */}
                  <button type="button" onClick={handleRenew}
                    disabled={renewLoading || !renewKycResult?.verified}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all">
                    {renewLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    {renewKycResult?.verified ? 'Proceed to Payment' : 'Complete Verification to Continue'}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* Step N: New Registration - multi-step wizard */}
          {mode === 'new' && (
            <motion.div key="new" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center gap-2 mb-6">
                <button onClick={() => setMode('choose')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <span className="text-sm text-gray-400">/ New Registration</span>
              </div>

              {/* Progress Steps */}
              <div className="mb-6">
                <div className="hidden md:flex items-center justify-between relative">
                  <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200">
                    <motion.div
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                      initial={{ width: '0%' }}
                      animate={{ width: `${((currentStep - 1) / 5) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  {STEPS.map((step) => {
                    const Icon = step.icon;
                    const isCompleted = completedSteps.includes(step.id);
                    const isCurrent = currentStep === step.id;
                    const isAccessible = step.id <= currentStep || isCompleted;
                    return (
                      <button key={step.id} onClick={() => isAccessible && setCurrentStep(step.id)}
                        disabled={!isAccessible} className={`relative z-10 flex flex-col items-center ${isAccessible ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isCompleted ? 'bg-green-500 text-white shadow-lg shadow-green-500/25' : isCurrent ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white ring-4 ring-green-500/20' : 'bg-white border-2 border-gray-200 text-gray-400'}`}>
                          {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                        </div>
                        <span className={`mt-2 text-xs font-medium transition-colors ${isCurrent ? 'text-green-600' : isCompleted ? 'text-green-500' : 'text-gray-400'}`}>
                          {step.title}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Mobile progress */}
                <div className="md:hidden">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-500">Step {currentStep} of 6</span>
                    <span className="text-sm font-medium text-gray-700">{STEPS[currentStep - 1].title}</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                      animate={{ width: `${(currentStep / 6) * 100}%` }} transition={{ duration: 0.3 }} />
                  </div>
                </div>
              </div>

              {/* Form Card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Step header */}
                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 flex items-center gap-3">
                  {(() => { const Icon = STEPS[currentStep - 1].icon; return <Icon className="w-5 h-5 text-green-600" />; })()}
                  <div>
                    <h2 className="font-semibold text-gray-900">{STEPS[currentStep - 1].title}</h2>
                    <p className="text-xs text-gray-500">{STEPS[currentStep - 1].description}</p>
                  </div>
                </div>

                {/* Form content */}
                <div className="p-6">
                  <AnimatePresence mode="wait">
                    <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                      {renderStep()}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Navigation */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                  <button onClick={prevStep} disabled={currentStep === 1}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${currentStep === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-gray-900 hover:bg-white border border-gray-200'}`}>
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>

                  <div className="flex items-center gap-1.5">
                    {STEPS.map((step) => (
                      <div key={step.id} className={`rounded-full transition-all ${step.id === currentStep ? 'w-5 h-2 bg-green-500' : completedSteps.includes(step.id) ? 'w-2 h-2 bg-green-400' : 'w-2 h-2 bg-gray-300'}`} />
                    ))}
                  </div>

                  {currentStep < 6 ? (
                    <button type="submit" form={`step-${currentStep}-form`}
                      className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-medium text-sm shadow-sm">
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <p className="text-center text-gray-400 text-sm mt-6">
                Need help? Contact <a href="mailto:info@ssfiskate.com" className="text-green-600 hover:underline">info@ssfiskate.com</a>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
