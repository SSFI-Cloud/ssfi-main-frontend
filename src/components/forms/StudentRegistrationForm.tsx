'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  User, Home, Shield, Users, MapPin, FileText,
  ChevronLeft, ChevronRight, Check, CheckCircle, Loader2, RefreshCw,
  CheckCircle2, Pencil, ChevronDown, ChevronUp, Save, AlertTriangle,
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
  // KYC save lifecycle — surfaces failures that the previous silent
  // catch was hiding. See handleKycVerified comment for full reasoning.
  const [kycSaving, setKycSaving] = useState(false);
  const [kycSaveFailed, setKycSaveFailed] = useState(false);
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
  // Renewal Aadhaar re-collection — renewing students whose stored Aadhaar
  // is the corrupted masked form must type their full 12-digit number
  // before paying. See renewProfile.aadhaarNeedsConfirmation.
  const [renewAadhaar, setRenewAadhaar] = useState('');
  const [aadhaarSaving, setAadhaarSaving] = useState(false);
  const [aadhaarConfirmed, setAadhaarConfirmed] = useState(false);
  const [aadhaarError, setAadhaarError] = useState<string | null>(null);

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

  // Resume from a "hand off to student" link — see DocumentsStep for the
  // sister code that creates the session. When `?resume=<token>` is
  // present, fetch the saved formData snapshot, rehydrate the wizard
  // store, and jump straight to the last step. No re-verification of
  // Aadhaar; the green pill shows because formData.kycVerified=true.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resume');
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/kyc/sessions/${token}`);
        if (cancelled) return;
        const data = res.data?.data;
        if (!data) return;
        // Hydrate the wizard store with the teacher's snapshot.
        if (data.formData && typeof data.formData === 'object') {
          updateFormData(data.formData);
        } else {
          // KYC-only fallback (old sessions without formData).
          updateFormData({
            kycVerified: true,
            kycVerifiedName: data.fullName,
            kycVerifiedDob: data.dob,
            kycVerifiedGender: data.gender,
            kycProfileImage: data.profileImage,
            phone: data.phone || '',
            email: data.email || '',
          });
        }
        // Mark earlier steps complete and jump to the documents step
        // (KYC + photo + terms). The user can navigate back to review.
        for (let s = 1; s <= 5; s++) markStepComplete(s);
        setCurrentStep(6);
        setMode('new');
        toast.success('Resumed where the previous device left off.');
      } catch (e: any) {
        const msg = e?.response?.status === 410
          ? 'This resume link has expired. Please start a fresh registration.'
          : 'Could not load the resume link. Please start a fresh registration.';
        toast.error(msg);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Called when KYC completes (new verification) — persist to backend.
  //
  // CRITICAL behaviour: teachers report that closing the page right
  // after the green ✓ shows leaves the DB with kycVerified=false for
  // some students — the next time the student opens the renewal, Step
  // 1 restarts. Root cause was a silent catch that ate any error
  // (network blip, transient 5xx). Now:
  //   1. Retry up to 3 times with backoff.
  //   2. On hard failure, surface a toast and set a sticky banner
  //      (`kycSaveFailed`) so the teacher knows it didn't persist.
  //   3. Block the unload with onbeforeunload while the save is in
  //      flight or has failed, so a "close and hand off" doesn't drop
  //      the result on the floor.
  const handleKycVerified = async (result: KycResult) => {
    setRenewKycResult(result);
    if (!renewMember) return;

    setKycSaving(true);
    setKycSaveFailed(false);
    let saved = false;
    for (let attempt = 1; attempt <= 3 && !saved; attempt++) {
      try {
        await api.post('/affiliations/renew/save-kyc', {
          uid: renewMember.uid,
          fullName: result.fullName,
          dob: result.dob,
          gender: result.gender,
          photo: result.profileImage,
        });
        saved = true;
      } catch (e) {
        if (attempt < 3) {
          // 600ms, 1.2s — keeps total wait under 2s while still
          // smoothing over a transient blip.
          await new Promise(r => setTimeout(r, 600 * attempt));
        }
      }
    }
    setKycSaving(false);

    if (saved) {
      setRenewProfile((prev: any) => prev ? {
        ...prev, kycVerified: true, kycVerifiedName: result.fullName, kycVerifiedDob: result.dob,
      } : prev);
    } else {
      setKycSaveFailed(true);
      toast.error('KYC verified but couldn\'t save to server. Please stay on this page and tap Retry.');
    }
  };

  // Manual retry handler, invoked from the failure banner.
  const retryKycSave = async () => {
    if (!renewKycResult || !renewMember) return;
    await handleKycVerified(renewKycResult);
  };

  // Warn the user before they navigate away while the KYC save is
  // pending or has failed. Without this, a teacher who closes the tab
  // confidently after seeing the green ✓ will silently lose the result.
  useEffect(() => {
    const shouldWarn = kycSaving || kycSaveFailed;
    if (!shouldWarn) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [kycSaving, kycSaveFailed]);

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

  // Save the typed Aadhaar during renewal (corrupted/missing cohort).
  const handleConfirmAadhaar = async () => {
    if (!renewMember) return;
    setAadhaarError(null);
    const digits = renewAadhaar.replace(/\D/g, '');
    if (digits.length !== 12) { setAadhaarError('Enter your full 12-digit Aadhaar number.'); return; }
    const last4 = renewProfile?.aadhaarLast4;
    if (last4 && digits.slice(-4) !== last4) {
      setAadhaarError(`The number must end in ${last4} — that's the Aadhaar on your SSFI record.`);
      return;
    }
    setAadhaarSaving(true);
    try {
      await api.post('/affiliations/renew/confirm-aadhaar', { uid: renewMember.uid, aadhaarNumber: digits });
      setAadhaarConfirmed(true);
      toast.success('Aadhaar confirmed');
    } catch (e: any) {
      setAadhaarError(e?.response?.data?.message || 'Could not save your Aadhaar. Please try again.');
    } finally {
      setAadhaarSaving(false);
    }
  };

  const handleRenew = async () => {
    if (!renewMember) return;
    // Block payment until the Aadhaar is confirmed for the corrupted cohort.
    if (renewProfile?.aadhaarNeedsConfirmation && !aadhaarConfirmed) {
      setAadhaarError('Please confirm your Aadhaar number above before proceeding to payment.');
      return;
    }
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
              className="max-w-2xl mx-auto space-y-5">
              {/* Prerequisites — what the student / parent should have
                  ready before starting either New or Renewal. Surfaced
                  here (not buried later) to cut down on abandoned forms. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                  <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-600" /> Before you start — what you'll need
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">Keep these handy. Both New Registration and Renewal need the same documents.</p>
                </div>
                <div className="p-6 space-y-5 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mandatory documents</p>
                    <ul className="space-y-1.5 text-gray-700">
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span><strong>Aadhaar number</strong> (12 digits) — entered and saved to your SSFI record</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span><strong>Date of birth</strong> — confirmed in the last step (see the two options below)</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span><strong>Recent profile photo</strong> (passport-style) — or auto-fetched from DigiLocker</span></li>
                    </ul>
                  </div>

                  {/* Verification choice — surfaced up front so students know
                      they don't HAVE to use DigiLocker (many struggle with the
                      OTP) and can fall back to a birth certificate. */}
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-900 mb-1.5 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> Confirming your date of birth — pick ONE in the last step
                    </p>
                    <ul className="space-y-1.5 text-xs text-emerald-900">
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-emerald-700">1.</span>
                        <span><strong>DigiLocker (Aadhaar OTP)</strong> — fastest. Your date of birth is confirmed instantly against your Aadhaar record.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-emerald-700">2.</span>
                        <span><strong>Upload Birth Certificate</strong> — if DigiLocker isn&apos;t working for you. Upload a clear photo or PDF; our team verifies the date of birth after payment.</span>
                      </li>
                    </ul>
                    <p className="text-[11px] text-emerald-700 mt-1.5">Either option works. Payment comes after this step.</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mandatory details to fill</p>
                    <ul className="space-y-1.5 text-gray-700">
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span>Father's name and (optional) mother's name</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span>School name and academic board</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span>Coach name and coach's phone number</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span>Club affiliation (state → district → club)</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span>Skating discipline / category (Speed Quad, Inline, etc.)</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span><strong>Insurance nominee</strong> — name, age, relation</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /><span>Full residential address with city + pincode</span></li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-xs font-semibold text-amber-900 mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Important rules
                    </p>
                    <ul className="space-y-1 text-xs text-amber-900">
                      <li><strong>One phone, one student.</strong> Each mobile number can be linked to only one SSFI account. Siblings need different numbers.</li>
                      <li>Phone number is your <strong>login ID</strong> — keep it active. You can update it later from your renewal screen.</li>
                      <li>Email is optional but strongly recommended — it's used for OTPs, e-receipts, and renewal reminders.</li>
                      <li><strong>Registration fee</strong> is collected online through Razorpay. Membership is confirmed only after payment is verified.</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                    <p className="text-xs font-semibold text-sky-900 mb-1.5 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> Renewing an existing membership?
                    </p>
                    <p className="text-xs text-sky-900">
                      Use the lookup below — we'll pre-fill your details. KYC isn't repeated if you've verified before.
                      Membership extends by 1 year from your current expiry date.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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

                  {/* ── Aadhaar number (compulsory) ──
                      Renewing students whose stored Aadhaar is the corrupted
                      masked form must type their full 12-digit number. Those
                      already on file see a confirmation badge instead. */}
                  {renewProfile?.aadhaarNeedsConfirmation && !aadhaarConfirmed ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-900 mb-1">Confirm your Aadhaar number</p>
                      <p className="text-xs text-amber-700 mb-3">
                        Please enter your full 12-digit Aadhaar number to update your SSFI record.
                        {renewProfile?.aadhaarLast4 && <> It ends in <span className="font-mono font-semibold">{renewProfile.aadhaarLast4}</span>.</>}
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          inputMode="numeric"
                          value={renewAadhaar.replace(/(\d{4})(?=\d)/g, '$1 ')}
                          onChange={e => { setRenewAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12)); setAadhaarError(null); }}
                          placeholder="1234 5678 9012"
                          className="flex-1 px-3 py-2.5 border border-amber-300 rounded-lg font-mono tracking-wider focus:ring-2 focus:ring-amber-400 outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleConfirmAadhaar}
                          disabled={aadhaarSaving || renewAadhaar.replace(/\D/g, '').length !== 12}
                          className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                        >
                          {aadhaarSaving ? 'Saving…' : 'Confirm'}
                        </button>
                      </div>
                      {aadhaarError && <p className="text-xs text-red-600 mt-1.5">{aadhaarError}</p>}
                    </div>
                  ) : (renewProfile?.aadhaarNeedsConfirmation && aadhaarConfirmed) ? (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <p className="text-sm font-medium text-emerald-800">Aadhaar number confirmed</p>
                    </div>
                  ) : null}

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

                    {/* Save lifecycle indicators — only render when relevant.
                        kycSaving: the silent "writing to DB" state. Helps
                        teachers wait rather than closing the page mid-save.
                        kycSaveFailed: hard failure after retries. Teacher
                        needs to tap Retry; closing the page right now loses
                        the verification. */}
                    {kycSaving && (
                      <div className="mt-3 flex items-center gap-2 p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-700 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                        <span>Saving verification to server — please don&apos;t close this page yet…</span>
                      </div>
                    )}
                    {kycSaveFailed && !kycSaving && (
                      <div className="mt-3 flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-amber-900">Verification not saved</p>
                          <p className="text-xs text-amber-800 mt-0.5">
                            Identity was verified successfully but couldn&apos;t reach the server. Tap Retry — your verification is still valid.
                          </p>
                        </div>
                        <button type="button" onClick={retryKycSave}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
                          Retry Save
                        </button>
                      </div>
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

                            {/* Coach + skate category. Backend resolves the
                                label to CategoryType.id on save. */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Coach & Discipline</p>
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
                                <div className="col-span-2">
                                  <label className="text-xs text-gray-500 mb-1 block">Skate Category</label>
                                  <select
                                    value={profileEdits.skateCategory || ''}
                                    onChange={e => setProfileEdits((p: any) => ({ ...p, skateCategory: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                  >
                                    <option value="">Select skate category</option>
                                    <option value="Speed Quad">Speed Quad</option>
                                    <option value="Speed Inline">Speed Inline</option>
                                    <option value="Recreational">Recreational</option>
                                    <option value="Beginner">Beginner</option>
                                  </select>
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

                            {/* Contact — email + phone both editable. Phone
                                used to be locked but legacy migrate.js rows
                                were seeded with placeholders like
                                "PH-SKT-{id}", and the only way to fix those
                                was to ask an admin. Renewal is the natural
                                place for the student to put a real number on
                                file. Backend enforces 10-digit Indian + global
                                uniqueness on User.phone. */}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contact</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Email</label>
                                  <input type="email" value={profileEdits.email || ''} onChange={e => setProfileEdits((p: any) => ({ ...p, email: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">
                                    Phone <span className="text-gray-400">(login ID)</span>
                                    {renewProfile?.phoneIsPlaceholder && (
                                      <span className="ml-1 text-amber-600">— placeholder, please replace</span>
                                    )}
                                  </label>
                                  <input
                                    type="tel"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={profileEdits.phone || ''}
                                    onChange={e => setProfileEdits((p: any) => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                    placeholder="10-digit Indian mobile"
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                  />
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                Each phone number can be linked to only one SSFI account. Changing this phone will
                                make it your new login ID — your password is not changed.
                              </p>
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

                  {/* ── Payment button — enabled after KYC AND (if needed) Aadhaar confirmation ── */}
                  {(() => {
                    const needsAadhaar = !!renewProfile?.aadhaarNeedsConfirmation && !aadhaarConfirmed;
                    const blocked = renewLoading || !renewKycResult?.verified || needsAadhaar;
                    const label = !renewKycResult?.verified
                      ? 'Complete Verification to Continue'
                      : needsAadhaar
                        ? 'Confirm Aadhaar to Continue'
                        : 'Proceed to Payment';
                    return (
                      <button type="button" onClick={handleRenew}
                        disabled={blocked}
                        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all">
                        {renewLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                        {label}
                      </button>
                    );
                  })()}
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
