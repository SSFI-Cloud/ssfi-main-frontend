'use client';

/**
 * Blocking Aadhaar re-collection pop-up.
 *
 * Shown to students whose stored Aadhaar is the corrupted "00000000XXXX"
 * masked form (the old DigiLocker X→0 conversion bug never captured the
 * real full number). On first dashboard visit they must enter their full
 * 12-digit Aadhaar. Once saved, the backend locks the field and
 * /auth/me returns aadhaarNeedsConfirmation=false, so it never shows
 * again. Admins can still edit it later if needed.
 *
 * Self-contained: fetches /auth/me on mount to decide whether to render.
 * Mounted once in the dashboard layout for STUDENT accounts.
 */

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api/client';

export default function AadhaarConfirmModal() {
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(true);
  const [last4Hint, setLast4Hint] = useState<string | null>(null);
  const [canSkip, setCanSkip] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Decide whether to show the modal by reading the fresh profile.
  const checkStatus = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      const d = res.data?.data?.user || res.data?.data || res.data;
      const needs = d?.aadhaarNeedsConfirmation === true && d?.aadhaarLocked !== true;
      if (needs) {
        // The masked Aadhaar (e.g. "XXXX-XXXX-1540") carries the real
        // last-4 — surface it as a hint and to gate the input.
        const masked: string | undefined = d?.profile?.aadhaarNumber;
        const m = masked ? masked.replace(/\D/g, '').slice(-4) : '';
        const last4 = m && m.length === 4 ? m : null;
        setLast4Hint(last4);

        // Skip is offered to under-5 children, OR any student with no
        // Aadhaar last-4 on file (they registered via birth certificate
        // and may not have an Aadhaar). Students 5+ who clearly have an
        // Aadhaar (a known last-4) must confirm it — no skip.
        const dobStr: string | undefined = d?.profile?.dateOfBirth;
        let age = 99;
        if (dobStr) {
          const dob = new Date(dobStr);
          if (!Number.isNaN(dob.getTime())) {
            const now = new Date();
            age = now.getFullYear() - dob.getFullYear();
            const mm = now.getMonth() - dob.getMonth();
            if (mm < 0 || (mm === 0 && now.getDate() < dob.getDate())) age--;
          }
        }
        setCanSkip(age < 5 || !last4);

        setShow(true);
      }
    } catch {
      // If the check fails (network blip), don't block the dashboard.
    } finally {
      setChecking(false);
    }
  }, []);

  const handleSkip = async () => {
    setError(null);
    setSkipping(true);
    try {
      await api.post('/students/me/skip-aadhaar');
      setShow(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not skip. Please try again.');
    } finally {
      setSkipping(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Keep only digits, cap at 12.
  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 12);
    setValue(digits);
    setError(null);
  };

  const grouped = value.replace(/(\d{4})(?=\d)/g, '$1 '); // "1234 5678 9012"

  const handleSubmit = async () => {
    setError(null);
    if (value.length !== 12) {
      setError('Aadhaar must be exactly 12 digits.');
      return;
    }
    if (last4Hint && value.slice(-4) !== last4Hint) {
      setError(`The number must end in ${last4Hint} — that's the Aadhaar on your SSFI record.`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/students/me/confirm-aadhaar', { aadhaarNumber: value });
      setDone(true);
      // Brief success state, then dismiss.
      setTimeout(() => setShow(false), 1400);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not save your Aadhaar. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking || !show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Confirm your Aadhaar number</h2>
              <p className="text-emerald-100 text-xs mt-0.5">One-time step to complete your SSFI record</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {done ? (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
              <p className="text-lg font-semibold text-gray-900">Aadhaar saved</p>
              <p className="text-sm text-gray-500">Thank you — your record is now complete.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                {canSkip ? (
                  <>If the skater has an Aadhaar, please enter the full <strong>12-digit number</strong>.
                  Young children who don&apos;t have an Aadhaar yet can skip this step.</>
                ) : (
                  <>For verification, please enter your full <strong>12-digit Aadhaar number</strong>.
                  This is required once and will be securely saved to your profile.</>
                )}
                {last4Hint && (
                  <> Your Aadhaar on file ends in <span className="font-mono font-semibold text-gray-900">{last4Hint}</span>.</>
                )}
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Aadhaar Number {canSkip && <span className="text-gray-400 normal-case font-normal">(optional)</span>}
                </label>
                <input
                  inputMode="numeric"
                  autoFocus
                  value={grouped}
                  onChange={e => onChange(e.target.value)}
                  placeholder="1234 5678 9012"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-mono tracking-wider focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
                <p className="text-[11px] text-gray-400 mt-1">{value.length}/12 digits</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || skipping || value.length !== 12}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</> : <>Confirm &amp; Save</>}
              </button>

              {canSkip && (
                <button
                  onClick={handleSkip}
                  disabled={submitting || skipping}
                  className="w-full py-2.5 text-gray-500 hover:text-gray-700 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {skipping ? <><Loader2 className="w-4 h-4 animate-spin" /> Skipping…</> : <>Skip — no Aadhaar yet</>}
                </button>
              )}

              <p className="text-[11px] text-gray-400 text-center">
                Your Aadhaar is stored securely and used only for SSFI membership verification.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
