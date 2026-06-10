'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileText, Camera, X, Check, Loader2, AlertTriangle, Copy, Share2, ShieldCheck, ScrollText } from 'lucide-react';
import { compressImage } from '@/lib/utils/imageCompress';
import { useRegistrationStore } from '@/lib/store/registrationStore';
import { StudentRegistrationData } from '@/types/student';
import AadhaarKYCVerification from '@/components/forms/shared/AadhaarKYCVerification';
import type { KycResult } from '@/lib/hooks/useKYC';
import { api } from '@/lib/api/client';
import { toast } from 'react-hot-toast';

interface DocumentsStepProps {
  onComplete: (data: Partial<StudentRegistrationData>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

type VerificationMethod = 'surepass' | 'birth_certificate';

export default function DocumentsStep({ onComplete, onSubmit, isSubmitting }: DocumentsStepProps) {
  const { formData, updateFormData, setPreview, previews } = useRegistrationStore();

  // ── Verification method (SurePass DigiLocker vs Birth Certificate) ──
  const [method, setMethod] = useState<VerificationMethod>(
    (formData.verificationMethod as VerificationMethod) || 'surepass'
  );

  // ── Typed Aadhaar (compulsory for BOTH methods) ──
  // Never prefill the old corrupted "00000000XXXX" value — only a real
  // typed number resuming from a prior session.
  const storedAadhaar = (formData.aadhaarNumber || '').replace(/\D/g, '');
  const [aadhaar, setAadhaar] = useState<string>(/^0{8}/.test(storedAadhaar) ? '' : storedAadhaar);

  // KYC state
  const [kycResult, setKycResult] = useState<KycResult | null>(
    formData.kycVerified
      ? {
          verified: true,
          fullName: formData.kycVerifiedName || '',
          dob: formData.kycVerifiedDob || '',
          gender: formData.kycVerifiedGender || '',
          maskedAadhaar: aadhaar ? `XXXX XXXX ${aadhaar.slice(-4)}` : '',
          profileImage: formData.kycProfileImage,
        }
      : null
  );
  const [dobMismatch, setDobMismatch] = useState(false);

  // Resume-link state
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeSaving, setResumeSaving] = useState(false);
  const [resumeCopied, setResumeCopied] = useState(false);

  // File state
  const [termsAccepted, setTermsAccepted] = useState(formData.termsAccepted || false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(previews.profilePhoto || null);
  const [certPreview, setCertPreview] = useState<string | null>(previews.birthCertificate || null);
  const [useAadhaarPhoto, setUseAadhaarPhoto] = useState(false);

  // The masked last-4 DigiLocker returned (authoritative) — the typed
  // Aadhaar must end in these digits on the SurePass path.
  const kycLast4 = kycResult?.maskedAadhaar ? kycResult.maskedAadhaar.replace(/\D/g, '').slice(-4) : '';

  const onAadhaarChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 12);
    setAadhaar(digits);
    updateFormData({ aadhaarNumber: digits });
  };
  const aadhaarGrouped = aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ');

  const switchMethod = (m: VerificationMethod) => {
    setMethod(m);
    updateFormData({ verificationMethod: m });
    // Switching to birth cert clears any DigiLocker mismatch state so a
    // prior attempt's DOB can't bleed into this path.
    if (m === 'birth_certificate') setDobMismatch(false);
  };

  // ── KYC Verified Handler ──
  const handleKycVerified = useCallback(async (result: KycResult) => {
    setKycResult(result);

    // Cross-check DOB with Step 1. Year-only Aadhaars (common for young
    // children) come back as YYYY-01-01 — compare only the year for those,
    // so a real DOB like 2020-06-05 isn't wrongly flagged against a
    // "2020-01-01" Aadhaar value.
    if (result.dob && formData.dateOfBirth) {
      const formDob = new Date(formData.dateOfBirth).toISOString().split('T')[0];
      const kycIsYearOnly = /^\d{4}-01-01$/.test(result.dob);
      const mismatch = kycIsYearOnly
        ? formDob.slice(0, 4) !== result.dob.slice(0, 4)
        : formDob !== result.dob;
      setDobMismatch(mismatch);
    }

    const mergedFormData = {
      ...formData,
      kycVerified: true,
      kycVerifiedName: result.fullName,
      kycVerifiedDob: result.dob,
      kycVerifiedGender: result.gender,
      kycProfileImage: result.profileImage || '',
    };

    // NOTE: we deliberately DO NOT derive aadhaarNumber from the masked
    // KYC value anymore. The old code did
    //   aadhaarNumber: maskedAadhaar.replace(/X/g,'0')
    // which stored "00000000XXXX" for every student and caused the
    // duplicate-Aadhaar clash. The real 12-digit number now comes from
    // the typed field above.
    updateFormData({
      kycVerified: true,
      kycVerifiedName: result.fullName,
      kycVerifiedDob: result.dob,
      kycVerifiedGender: result.gender,
      kycProfileImage: result.profileImage || '',
    });

    // Save resume session — best-effort.
    setResumeSaving(true);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await api.post('/kyc/sessions', {
          fullName: result.fullName,
          dob: result.dob,
          gender: result.gender,
          profileImage: result.profileImage,
          phone: formData.phone || '',
          email: formData.email || '',
          formData: mergedFormData,
        });
        const token = res.data?.data?.token;
        if (token) setResumeUrl(`${window.location.origin}/register/student?resume=${token}`);
        break;
      } catch {
        if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt));
      }
    }
    setResumeSaving(false);
  }, [formData, updateFormData]);

  const copyResumeUrl = () => {
    if (!resumeUrl) return;
    navigator.clipboard.writeText(resumeUrl);
    setResumeCopied(true);
    toast.success('Resume link copied');
    setTimeout(() => setResumeCopied(false), 2500);
  };

  const shareResumeViaWhatsApp = () => {
    if (!resumeUrl) return;
    const name = kycResult?.fullName || 'the student';
    const msg = encodeURIComponent(
      `Hi! ${name}'s Aadhaar KYC for SSFI registration is done. ` +
      `Open this link on your phone to finish the registration (no re-verification needed): ${resumeUrl}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  // ── Profile Photo Choice from KYC ──
  const handleProfilePhotoChoice = useCallback((useAadhaar: boolean, base64?: string) => {
    setUseAadhaarPhoto(useAadhaar);
    if (useAadhaar && base64) {
      const dataUri = `data:image/jpeg;base64,${base64}`;
      setPhotoPreview(dataUri);
      setPreview('profilePhoto', dataUri);
      updateFormData({ profilePhoto: dataUri });
    }
  }, [setPreview, updateFormData]);

  // ── File Handling ──
  const handleFileSelect = (
    field: 'profilePhoto' | 'birthCertificate',
    setPreviewFn: (url: string | null) => void
  ) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImage(file);
      setPreviewFn(b64);
      setPreview(field as keyof typeof previews, b64);
      updateFormData({ [field]: b64 });
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = reader.result as string;
        setPreviewFn(b64);
        setPreview(field as keyof typeof previews, b64);
        updateFormData({ [field]: b64 });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = (field: 'profilePhoto' | 'birthCertificate', setPreviewFn: (url: string | null) => void) => {
    setPreviewFn(null);
    setPreview(field as keyof typeof previews, null);
    updateFormData({ [field]: '' });
    if (field === 'profilePhoto') setUseAadhaarPhoto(false);
  };

  // ── Upload Box ──
  const uploadBox = (
    preview: string | null,
    onRemove: () => void,
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    accept: string,
    icon: React.ReactNode,
    label: string
  ) => (
    <div className="aspect-square rounded-xl border-2 border-dashed overflow-hidden relative transition-colors bg-gray-50 border-gray-200 hover:border-green-300 hover:bg-green-50">
      {preview ? (
        <>
          {preview.startsWith('data:application/pdf') ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-emerald-50 gap-2">
              <FileText className="w-10 h-10 text-emerald-500" />
              <span className="text-xs text-emerald-700 font-medium">PDF uploaded</span>
            </div>
          ) : (
            <img src={preview} alt={label} className="w-full h-full object-cover" />
          )}
          <button type="button" onClick={onRemove} className="absolute top-2 right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <label className="flex flex-col items-center justify-center h-full cursor-pointer gap-2 p-2">
          <div className="text-gray-400">{icon}</div>
          <span className="text-xs text-gray-500 text-center">{label}</span>
          <input type="file" accept={accept} className="hidden" onChange={onFileChange} />
        </label>
      )}
    </div>
  );

  // ── Validation / gating ──
  const aadhaarValid = aadhaar.length === 12;
  const aadhaarMatchesKyc = method !== 'surepass' || !kycLast4 || aadhaar.slice(-4) === kycLast4;

  const identityDone =
    method === 'surepass'
      ? !!kycResult?.verified && !dobMismatch
      : !!certPreview; // birth cert uploaded

  // Submit gate. Mirrors the ORIGINAL flow (identity verified + terms)
  // and only ADDS the new compulsory-Aadhaar requirement. Profile photo
  // is intentionally NOT a hard gate here — the original flow didn't
  // block on it (the Aadhaar photo / kycProfileImage serves as a
  // fallback), and adding a new block could stop registrations that
  // worked before. The photo box still shows its required marker.
  // Aadhaar is required + must match DigiLocker on the SurePass path, but
  // OPTIONAL on the birth-certificate path (young children may not have
  // an Aadhaar — they're verified by the certificate).
  const aadhaarOk = method === 'surepass' ? (aadhaarValid && aadhaarMatchesKyc) : true;
  const canSubmit =
    identityDone &&
    aadhaarOk &&
    termsAccepted &&
    !isSubmitting;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    // CRITICAL: on the birth-certificate path we must send NO KYC data.
    // Otherwise a stale DigiLocker DOB — from an earlier DigiLocker
    // attempt in this session, or rehydrated from a resume link (e.g. a
    // sibling's DOB 2010-09-13) — leaks through and trips the backend's
    // DOB cross-check, blocking a legitimate birth-cert registration.
    // The cross-check is DigiLocker-only by design; gating these fields
    // on the method keeps the two paths fully independent.
    const usingSurepass = method === 'surepass';
    const mappedData: Partial<StudentRegistrationData> = {
      aadhaarNumber: aadhaar,
      verificationMethod: method,
      profilePhoto: photoPreview || formData.profilePhoto || '',
      birthCertificate: certPreview || formData.birthCertificate || '',
      kycVerified: usingSurepass ? true : false,
      kycVerifiedName: usingSurepass ? (kycResult?.fullName || '') : '',
      kycVerifiedDob: usingSurepass ? (kycResult?.dob || '') : '',
      kycVerifiedGender: usingSurepass ? (kycResult?.gender || '') : '',
      kycProfileImage: usingSurepass ? (kycResult?.profileImage || '') : '',
      termsAccepted: true,
    };

    updateFormData({
      termsAccepted: true,
      // Also clear any stale KYC fields in the store on the birth-cert
      // path, so the submit payload (read from the store) can't carry a
      // leftover DigiLocker DOB.
      ...(usingSurepass ? {} : { kycVerified: false, kycVerifiedDob: '', kycVerifiedName: '', kycVerifiedGender: '', kycProfileImage: '' }),
    });
    onComplete(mappedData);
    onSubmit();
  };

  const tabCls = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
      active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
    }`;

  return (
    <form id="step-6-form" onSubmit={handleFormSubmit} className="space-y-5">
      {/* ── Compulsory typed Aadhaar ── */}
      <div className="rounded-xl border border-gray-200 p-4 bg-white">
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Aadhaar Number{' '}
          {method === 'surepass'
            ? <span className="text-red-500">*</span>
            : <span className="text-gray-400 font-normal">(optional)</span>}
        </label>
        <input
          inputMode="numeric"
          value={aadhaarGrouped}
          onChange={e => onAadhaarChange(e.target.value)}
          placeholder="1234 5678 9012"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg font-mono tracking-wider focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-[11px] text-gray-400">{aadhaar.length}/12 digits</p>
          {method === 'surepass' && kycLast4 && aadhaar.length === 12 && !aadhaarMatchesKyc && (
            <p className="text-[11px] text-red-500 font-medium">Must end in {kycLast4} (from DigiLocker)</p>
          )}
        </div>
      </div>

      {/* ── Verification method selector ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Identity Verification</p>
        <div className="flex gap-3">
          <button type="button" className={tabCls(method === 'surepass')} onClick={() => switchMethod('surepass')}>
            <ShieldCheck className="w-4 h-4" /> DigiLocker (Aadhaar)
          </button>
          <button type="button" className={tabCls(method === 'birth_certificate')} onClick={() => switchMethod('birth_certificate')}>
            <ScrollText className="w-4 h-4" /> Birth Certificate
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {method === 'surepass'
            ? 'Verify instantly with DigiLocker. Having trouble? Switch to Birth Certificate.'
            : 'Upload a birth certificate to confirm date of birth. Our team verifies it after payment.'}
        </p>
      </div>

      {/* ── SurePass path ── */}
      {method === 'surepass' && (
        <>
          <AadhaarKYCVerification
            onVerified={handleKycVerified}
            onProfilePhotoChoice={handleProfilePhotoChoice}
            showProfilePhotoChoice={true}
            colorScheme="green"
            initialResult={kycResult}
          />

          {kycResult?.verified && (resumeSaving || resumeUrl) && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              {resumeSaving && !resumeUrl ? (
                <div className="flex items-center gap-2 text-sky-700 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving so you can hand off to the student…
                </div>
              ) : resumeUrl ? (
                <>
                  <p className="text-sm font-semibold text-sky-900 mb-1">Continuing on the student&apos;s device?</p>
                  <p className="text-xs text-sky-700 mb-3">
                    Share this link — they&apos;ll open it and pick up exactly where you left off.
                    The Aadhaar verification doesn&apos;t need to be redone. Valid for 7 days.
                  </p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={resumeUrl}
                      className="flex-1 px-3 py-2 bg-white border border-sky-200 rounded-lg text-xs text-gray-700 truncate" />
                    <button type="button" onClick={copyResumeUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-medium">
                      {resumeCopied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                    <button type="button" onClick={shareResumeViaWhatsApp}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium">
                      <Share2 className="w-3.5 h-3.5" /> WhatsApp
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {dobMismatch && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Date of Birth Mismatch</p>
                <p className="text-xs text-red-600 mt-1">
                  Step 1 DOB ({formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString('en-IN') : '—'})
                  doesn&apos;t match the DigiLocker record ({kycResult?.dob ? new Date(kycResult.dob).toLocaleDateString('en-IN') : '—'}).
                </p>
                <p className="text-xs text-red-700 mt-1.5 font-medium">
                  If the DigiLocker login was done by a parent or sibling (not the child), switch to
                  the <strong>Birth Certificate</strong> option above — that&apos;s the right path for a
                  child whose Aadhaar isn&apos;t linked to a mobile number. Otherwise, go back to Step 1
                  and correct the date.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Birth certificate path ── */}
      {method === 'birth_certificate' && (
        <div className="rounded-xl border border-gray-200 p-4 bg-white space-y-3">
          <label className="block text-xs font-medium text-gray-700">
            Birth Certificate <span className="text-red-500">*</span>
          </label>
          <div className="w-40">
            {uploadBox(
              certPreview,
              () => removeFile('birthCertificate', setCertPreview),
              handleFileSelect('birthCertificate', setCertPreview),
              'image/*,application/pdf',
              <FileText className="w-7 h-7" />,
              'Upload birth certificate'
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            Clear photo or PDF. We auto-convert images to WebP. Your declared date of birth will be verified
            against this document by our team.
          </p>
        </div>
      )}

      {/* ── Document uploads (profile photo) + birth cert (optional on SurePass path) ── */}
      {identityDone && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Profile Photo <span className="text-red-400">*</span>
                {useAadhaarPhoto && <span className="text-green-600 ml-1">(from Aadhaar)</span>}
              </label>
              {uploadBox(
                photoPreview,
                () => removeFile('profilePhoto', setPhotoPreview),
                handleFileSelect('profilePhoto', setPhotoPreview),
                'image/*',
                <Camera className="w-7 h-7" />,
                'Passport photo'
              )}
            </div>
            {method === 'surepass' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Birth Certificate <span className="text-gray-400">(Optional)</span>
                </label>
                {uploadBox(
                  certPreview,
                  () => removeFile('birthCertificate', setCertPreview),
                  handleFileSelect('birthCertificate', setCertPreview),
                  'image/*,application/pdf',
                  <FileText className="w-7 h-7" />,
                  'Birth cert'
                )}
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-medium text-amber-800 mb-1">Photo Guidelines</p>
            <ul className="text-xs text-amber-700 space-y-0.5">
              <li>• Passport-size photo with plain background</li>
              <li>• Max 5MB per file</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Terms ── */}
      {identityDone && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => { setTermsAccepted(e.target.checked); updateFormData({ termsAccepted: e.target.checked }); }}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-500 focus:ring-green-500/20"
            />
            <p className="text-sm text-gray-700">
              I hereby declare that all information provided is true and correct. I agree to the{' '}
              <a href="/terms" className="text-green-600 hover:underline">Terms &amp; Conditions</a> and{' '}
              <a href="/privacy" className="text-green-600 hover:underline">Privacy Policy</a> of SSFI.
            </p>
          </label>
        </div>
      )}

      {/* ── Submit ── */}
      {identityDone && (
        <>
          <motion.button
            type="submit"
            disabled={!canSubmit}
            whileHover={{ scale: canSubmit ? 1.01 : 1 }}
            className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
              canSubmit
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</> : <><Check className="w-5 h-5" /> Submit Registration</>}
          </motion.button>

          {method === 'surepass' && !aadhaarValid && (
            <p className="text-center text-xs text-amber-600">Enter your full 12-digit Aadhaar number to submit</p>
          )}
          {method === 'surepass' && aadhaarValid && !aadhaarMatchesKyc && (
            <p className="text-center text-xs text-red-600 font-medium">Aadhaar must end in {kycLast4} to match DigiLocker</p>
          )}
          {aadhaarOk && !termsAccepted && (
            <p className="text-center text-xs text-amber-600">Please accept the terms and conditions to submit</p>
          )}
        </>
      )}
    </form>
  );
}
