'use client';

/**
 * Aadhaar / DigiLocker verification guide modal.
 *
 * Renders a step-by-step illustrated walk-through that opens from the
 * AadhaarKYCVerification card. Solves the high drop-off rate where
 * parents close the DigiLocker popup mid-flow, pick the wrong login
 * method, or panic at the consent screen. Three-step layout matches
 * what the user actually experiences:
 *
 *   1. Click Verify → popup opens
 *   2. Sign in to DigiLocker  (new vs existing user, 3 login methods)
 *   3. Tap "Allow" on the consent screen
 *
 * Plus a "common mistakes" panel at the end with the four issues that
 * account for ~90% of failed sessions.
 *
 * Pure Tailwind + lucide icons — no images, ships instantly.
 */

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Smartphone, UserCircle, CreditCard, ShieldCheck, MousePointerClick,
  AlertTriangle, Sparkles, CheckCircle2, Info, ArrowRight, ExternalLink,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KycHelpGuide({ open, onClose }: Props) {
  // Lock background scroll while the modal is open — without this the
  // page underneath drifts when the student scrolls inside the modal
  // on mobile.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc closes — common shortcut keyboard users expect.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-2xl max-h-[92vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">How Aadhaar Verification Works</h2>
                  <p className="text-xs text-gray-600">3 steps · takes ~60 seconds · 100% safe (Govt of India DigiLocker)</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-500" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-7">

              {/* What is this? — primer */}
              <section className="rounded-xl bg-sky-50 border border-sky-200 p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-sky-900 mb-1">What is DigiLocker?</p>
                    <p className="text-xs text-sky-800 leading-relaxed">
                      DigiLocker is a free Govt of India service that holds your Aadhaar securely.
                      SSFI uses DigiLocker to confirm your identity — we never see your Aadhaar number,
                      only your name &amp; DOB. The whole flow happens on a Govt website, not ours.
                    </p>
                  </div>
                </div>
              </section>

              {/* STEP 1 */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <StepBadge n={1} />
                  <h3 className="text-base font-bold text-gray-900">Click "Verify with DigiLocker"</h3>
                </div>
                <div className="ml-12 rounded-xl bg-gray-50 border border-gray-200 p-4">
                  <p className="text-sm text-gray-700 mb-3">
                    A small pop-up window will open and take you to DigiLocker.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>If your browser blocks the pop-up, allow it for this site and try again.</span>
                  </div>
                </div>
              </section>

              {/* STEP 2 — Sign in */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <StepBadge n={2} />
                  <h3 className="text-base font-bold text-gray-900">Sign in to DigiLocker</h3>
                </div>

                <div className="ml-12 space-y-4">
                  {/* New vs existing fork */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <p className="text-sm font-semibold text-emerald-900">Already have DigiLocker?</p>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        Sign in using one of the 3 methods below.
                      </p>
                    </div>
                    <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-amber-600" />
                        <p className="text-sm font-semibold text-amber-900">New to DigiLocker?</p>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Tap <span className="font-semibold">&quot;Sign up&quot;</span> at the bottom of the popup.
                        Create an account with your mobile (1 minute), then come back to sign in.
                      </p>
                    </div>
                  </div>

                  {/* Three login methods */}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">
                    Three ways to sign in
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <LoginMethodCard
                      icon={<Smartphone className="w-5 h-5" />}
                      title="Mobile"
                      badge="Easiest"
                      badgeColor="emerald"
                      desc="Enter the 10-digit phone number linked to your Aadhaar."
                      detail="DigiLocker sends an OTP to that number. Enter it to sign in."
                    />
                    <LoginMethodCard
                      icon={<UserCircle className="w-5 h-5" />}
                      title="Username"
                      desc="Enter the DigiLocker username you chose when signing up."
                      detail="Then complete OTP on your registered mobile / email."
                    />
                    <LoginMethodCard
                      icon={<CreditCard className="w-5 h-5" />}
                      title="Other ID"
                      desc="Pick Aadhaar, PAN, or Driving License from the dropdown, then enter the number."
                      detail="OTP comes to the mobile linked to that ID."
                    />
                  </div>

                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                    <p className="text-xs text-blue-800 leading-relaxed">
                      <span className="font-semibold">Tip:</span> &nbsp;Mobile is the fastest method. Use the same number that&apos;s registered with Aadhaar.
                      Leave the <span className="font-mono">PIN-less authentication</span> and <span className="font-mono">terms of use</span> checkboxes ticked.
                    </p>
                  </div>
                </div>
              </section>

              {/* STEP 3 — Allow */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <StepBadge n={3} />
                  <h3 className="text-base font-bold text-gray-900">Tap "Allow" on the consent screen</h3>
                </div>
                <div className="ml-12 space-y-3">
                  <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <MousePointerClick className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-emerald-900 mb-1">This is the most important step.</p>
                        <p className="text-xs text-emerald-800 leading-relaxed">
                          After signing in, DigiLocker shows a screen asking <em>&quot;Allow SSFI to access your Aadhaar?&quot;</em>
                          <br />
                          Tap the green <span className="font-bold">Allow</span> button. The popup will close automatically and you&apos;ll return here with a green ✓.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-xs text-red-800 leading-relaxed flex items-start gap-2">
                      <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        <span className="font-semibold">Don&apos;t close the popup window</span> before tapping Allow.
                        If you do, the system shows &quot;DigiLocker window closed before you tapped Allow&quot; — just tap <span className="font-semibold">Try Again</span> and complete the consent.
                      </span>
                    </p>
                  </div>
                </div>
              </section>

              {/* COMMON MISTAKES */}
              <section className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-bold text-amber-900">If verification fails, check these</h3>
                </div>
                <div className="space-y-2.5">
                  <Pitfall
                    issue="Popup closed before tapping Allow"
                    fix="Tap Try Again, complete sign-in, then wait for the &quot;Allow SSFI to access your Aadhaar?&quot; screen and tap Allow."
                  />
                  <Pitfall
                    issue="Aadhaar not linked to your DigiLocker account"
                    fix={
                      <>
                        Open the DigiLocker app or <a href="https://digilocker.gov.in" target="_blank" rel="noopener noreferrer" className="underline font-medium">digilocker.gov.in <ExternalLink className="inline w-3 h-3 -mt-0.5" /></a>, go to <em>Issued Documents</em>, link Aadhaar, then come back here.
                      </>
                    }
                  />
                  <Pitfall
                    issue="Mobile OTP didn't arrive"
                    fix="Use the phone number that's registered with your Aadhaar. Wait 30 seconds and tap Resend on the OTP screen."
                  />
                  <Pitfall
                    issue="Date of birth mismatch"
                    fix="The DOB you entered in Step 1 of registration must match your Aadhaar exactly. Go back, correct it, then retry verification."
                  />
                </div>
              </section>

              {/* Final reassurance */}
              <section className="text-center py-2">
                <p className="text-xs text-gray-500">
                  Still stuck? Tap <span className="font-semibold">Try Again</span> on the verification screen — the process can always be restarted, nothing is charged or recorded until payment.
                </p>
              </section>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end flex-shrink-0">
              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                Got it — start verification
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ──

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
      <span className="text-base font-bold">{n}</span>
    </div>
  );
}

function LoginMethodCard({
  icon, title, badge, badgeColor, desc, detail,
}: {
  icon: React.ReactNode; title: string;
  badge?: string; badgeColor?: 'emerald';
  desc: string; detail: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        {badge && (
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            badgeColor === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-700 leading-relaxed mb-1.5">{desc}</p>
      <p className="text-[11px] text-gray-500 leading-relaxed">{detail}</p>
    </div>
  );
}

function Pitfall({ issue, fix }: { issue: string; fix: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white border border-amber-200 p-3">
      <p className="text-xs font-semibold text-amber-900 mb-1 flex items-start gap-1.5">
        <span className="text-red-500">✗</span>
        <span>{issue}</span>
      </p>
      <p className="text-xs text-gray-700 leading-relaxed pl-5">
        <span className="text-emerald-600 font-semibold">→ </span>
        {fix}
      </p>
    </div>
  );
}
