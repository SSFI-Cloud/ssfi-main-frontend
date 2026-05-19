'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Camera, X, Check, Loader2, AlertTriangle, Copy, Share2 } from 'lucide-react';
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

export default function DocumentsStep({ onComplete, onSubmit, isSubmitting }: DocumentsStepProps) {
  const { formData, updateFormData, setPreview, previews } = useRegistrationStore();

  // KYC state
  const [kycResult, setKycResult] = useState<KycResult | null>(
    formData.kycVerified
      ? {
          verified: true,
          fullName: formData.kycVerifiedName || '',
          dob: formData.kycVerifiedDob || '',
          gender: formData.kycVerifiedGender || '',
          maskedAadhaar: formData.aadhaarNumber ? `XXXX XXXX ${formData.aadhaarNumber.slice(-4)}` : '',
          profileImage: formData.kycProfileImage,
        }
      : null
  );
  const [dobMismatch, setDobMismatch] = useState(false);

  // Resume-link state — populated when handleKycVerified successfully
  // creates a kyc_sessions row on the backend. Lets the teacher hand
  // off to the student via a shareable URL.
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeSaving, setResumeSaving] = useState(false);
  const [resumeCopied, setResumeCopied] = useState(false);

  // File state
  const [termsAccepted, setTermsAccepted] = useState(formData.termsAccepted || false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(previews.profilePhoto || null);
  const [certPreview, setCertPreview] = useState<string | null>(previews.birthCertificate || null);
  const [useAadhaarPhoto, setUseAadhaarPhoto] = useState(false);

  // ── KYC Verified Handler ──
  //
  // After SurePass returns a successful KYC payload, we ALSO call
  // POST /kyc/sessions to persist the entire wizard state (KYC + every
  // form field filled so far). The backend returns a short token and
  // we build a resume URL the teacher can share with the student.
  // This is what cures the "started on teacher's device, can't continue
  // on student's device" complaint — the student opens the URL, the
  // form rehydrates, no re-verification needed.
  const handleKycVerified = useCallback(async (result: KycResult) => {
    setKycResult(result);

    // Cross-check DOB with form data (Step 1)
    if (result.dob && formData.dateOfBirth) {
      const formDob = new Date(formData.dateOfBirth).toISOString().split('T')[0];
      const kycDob = result.dob; // already in YYYY-MM-DD
      if (formDob !== kycDob) {
        setDobMismatch(true);
      } else {
        setDobMismatch(false);
      }
    }

    // Build the wizard formData snapshot that will be stuffed into the
    // resume session. Includes the freshly-arrived KYC payload so the
    // student opens directly into Step 6 with the green ✓ pill, not the
    // DigiLocker launch button.
    const mergedFormData = {
      ...formData,
      kycVerified: true,
      kycVerifiedName: result.fullName,
      kycVerifiedDob: result.dob,
      kycVerifiedGender: result.gender,
      kycProfileImage: result.profileImage || '',
    };

    // Store KYC data in form (local state)
    updateFormData({
      aadhaarNumber: result.maskedAadhaar?.replace(/\s/g, '').replace(/X/g, '0') || '', // Will be overridden by backend
      kycVerified: true,
      kycVerifiedName: result.fullName,
      kycVerifiedDob: result.dob,
      kycVerifiedGender: result.gender,
      kycProfileImage: result.profileImage || '',
    });

    // Save resume session — best-effort, retry 3x. If it fails we
    // simply don't show the resume URL; the local flow continues.
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
        if (token) {
          const url = `${window.location.origin}/register/student?resume=${token}`;
          setResumeUrl(url);
        }
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
      // Fallback to raw base64 if compression fails
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

  // ── Upload Box Component ──
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
          <img src={preview} alt={label} className="w-full h-full object-cover" />
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

  // ── Submit ──
  const canSubmit = kycResult?.verified && !dobMismatch && termsAccepted && !isSubmitting;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const mappedData: Partial<StudentRegistrationData> = {
      profilePhoto: photoPreview || formData.profilePhoto || '',
      birthCertificate: certPreview || formData.birthCertificate || '',
      kycVerified: true,
      kycVerifiedName: kycResult?.fullName || '',
      kycVerifiedDob: kycResult?.dob || '',
      kycVerifiedGender: kycResult?.gender || '',
      kycProfileImage: kycResult?.profileImage || '',
      termsAccepted: true,
    };

    updateFormData({ termsAccepted: true });
    onComplete(mappedData);
    onSubmit();
  };

  return (
    <form id="step-6-form" onSubmit={handleFormSubmit} className="space-y-5">
      {/* Step 1: Aadhaar KYC Verification */}
      <AadhaarKYCVerification
        onVerified={handleKycVerified}
        onProfilePhotoChoice={handleProfilePhotoChoice}
        showProfilePhotoChoice={true}
        colorScheme="green"
        initialResult={kycResult}
      />

      {/* Resume Link — appears after KYC succeeds. Teachers / parents
          who completed KYC on their device can share this URL with the
          student to finish on a different device without re-doing the
          Aadhaar OTP / DigiLocker flow. */}
      {kycResult?.verified && (resumeSaving || resumeUrl) && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          {resumeSaving && !resumeUrl ? (
            <div className="flex items-center gap-2 text-sky-700 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving so you can hand off to the student…
            </div>
          ) : resumeUrl ? (
            <>
              <p className="text-sm font-semibold text-sky-900 mb-1">
                Continuing on the student&apos;s device?
              </p>
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
              <p className="text-xs text-sky-600 mt-2">
                Or just continue filling on this device — both paths work.
              </p>
            </>
          ) : null}
        </div>
      )}

      {/* DOB Mismatch Warning */}
      {dobMismatch && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Date of Birth Mismatch</p>
            <p className="text-xs text-red-600 mt-1">
              The date of birth you entered in Step 1 ({formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString('en-IN') : '—'}) does not match your Aadhaar records ({kycResult?.dob ? new Date(kycResult.dob).toLocaleDateString('en-IN') : '—'}).
            </p>
            <p className="text-xs text-red-600 mt-1 font-medium">
              Please go back to Step 1 and correct your date of birth before submitting.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Document Uploads (Profile Photo + Birth Certificate) */}
      {kycResult?.verified && (
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

      {/* Step 3: Terms & Conditions */}
      {kycResult?.verified && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => {
                setTermsAccepted(e.target.checked);
                updateFormData({ termsAccepted: e.target.checked });
              }}
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

      {/* Submit Button */}
      {kycResult?.verified && (
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
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Submitting...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" /> Submit Registration
              </>
            )}
          </motion.button>

          {dobMismatch && (
            <p className="text-center text-xs text-red-600 font-medium">
              Fix the date of birth mismatch before submitting
            </p>
          )}
          {!termsAccepted && !dobMismatch && (
            <p className="text-center text-xs text-amber-600">
              Please accept the terms and conditions to submit
            </p>
          )}
        </>
      )}
    </form>
  );
}
