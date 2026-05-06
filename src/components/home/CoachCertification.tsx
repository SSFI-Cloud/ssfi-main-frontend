'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Calendar, MapPin, Clock, CheckCircle2, GraduationCap } from 'lucide-react';
const benefits = [
  'Official SSFI Coach Certification',
  'Comprehensive technique & safety training',
  'Access to national-level coaching roles',
  'Listed in Affiliated Coaches directory',
  'Continuous development workshops',
  'Insurance coverage during events',
];

const fallbackBatch = {
  title: 'Coach Certification Program',
  date: 'Coming Soon',
  location: 'TBA',
  spotsLeft: 0,
  totalSpots: 50,
  fee: '₹5,000',
  deadline: 'TBA',
  id: null as number | null,
  // Effective status — backed by backend utils/programStatus.ts when
  // available, falls back to "no program" when the homepage has nothing
  // to show.
  registrationOpen: false,
  statusLabel: 'COMING SOON',
};

interface CoachCertificationProps {
  programs?: any[];
}

export default function CoachCertification({ programs }: CoachCertificationProps) {
  const [batch, setBatch] = useState(fallbackBatch);

  // Accept programs from parent (aggregate endpoint). We prefer the
  // first program whose backend-derived registrationStatus is OPEN —
  // that way the homepage hero never advertises an expired batch as
  // "Registration Open".
  useEffect(() => {
    if (Array.isArray(programs) && programs.length > 0) {
      const open = programs.find(x => x?.registrationStatus?.open) || programs[0];
      const p = open;
      // Fall back to a client-side compute on stale responses where the
      // backend hasn't been redeployed yet.
      const fallbackOpen = (() => {
        if (!p.isActive || p.status === 'CANCELLED') return false;
        const dl = p.lastDateToApply ? new Date(p.lastDateToApply) : null;
        if (dl) dl.setHours(23, 59, 59, 999);
        if (dl && dl < new Date()) return false;
        if (p.totalSeats > 0 && p.filledSeats >= p.totalSeats) return false;
        return ['PUBLISHED', 'REGISTRATION_OPEN'].includes(p.status);
      })();
      const isOpen = p.registrationStatus?.open ?? fallbackOpen;
      const label = (p.registrationStatus?.label || (isOpen ? 'Registration Open' : 'Registration Closed')).toUpperCase();
      setBatch({
        title: p.title,
        date: new Date(p.startDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) + ' - ' + new Date(p.endDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
        location: p.city + ', ' + p.state,
        spotsLeft: Math.max(0, p.totalSeats - p.filledSeats),
        totalSpots: p.totalSeats,
        fee: '₹' + Number(p.price).toLocaleString(),
        deadline: new Date(p.lastDateToApply).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
        id: p.id,
        registrationOpen: isOpen,
        statusLabel: label,
      });
    }
  }, [programs]);

  return (
    <section className="relative py-16 sm:py-20 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl bg-gray-950 shadow-2xl overflow-hidden px-6 py-14 sm:px-10 sm:py-16 lg:px-16 lg:py-20">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[150px]" />

          <div className="relative z-10 grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
              <GraduationCap className="w-4 h-4" />
              Certification Program
            </span>
            <h2 className="text-4xl md:text-5xl font-headline font-bold text-white mb-6 tracking-tight leading-tight">
              Become a Certified{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">SSFI Coach</span>
            </h2>
            <p className="text-lg text-white/45 mb-10 leading-relaxed max-w-lg">
              Our rigorous certification program prepares you to coach at every level — from grassroots to national championships.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-10">
              {benefits.map((b, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -15 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.05 }} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="text-white/60 text-sm">{b}</span>
                </motion.div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              <Link href="/coach-certification" className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-105 transition-all duration-300">
                Apply Now <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/affiliated-coaches" className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-white font-semibold hover:bg-white/10 transition-all duration-300">
                View Affiliated Coaches
              </Link>
            </div>
          </motion.div>

          {/* Right - Batch Card */}
          <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.15 }} className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/10 via-transparent to-teal-500/10 rounded-3xl blur-2xl" />
            <div className="relative rounded-2xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.1] overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 px-8 py-5 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Upcoming Batch</p>
                      <h3 className="text-white font-headline font-bold">{batch.title}</h3>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    batch.registrationOpen
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                  }`}>
                    {batch.statusLabel}
                  </span>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-white/60"><Calendar className="w-5 h-5 text-emerald-400" /><span className="text-sm">{batch.date}</span></div>
                  <div className="flex items-center gap-3 text-white/60"><MapPin className="w-5 h-5 text-emerald-400" /><span className="text-sm">{batch.location}</span></div>
                  <div className="flex items-center gap-3 text-white/60"><Clock className="w-5 h-5 text-teal-400" /><span className="text-sm">Deadline: {batch.deadline}</span></div>
                </div>
                <div className={`flex items-center justify-between p-4 rounded-xl border ${
                  batch.registrationOpen
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-slate-500/10 border-slate-500/20'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${batch.registrationOpen ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                    <p className={`text-sm font-bold ${batch.registrationOpen ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {batch.registrationOpen ? 'Registration Open' : (batch.statusLabel || 'Registration Closed')}
                    </p>
                  </div>
                </div>
                {batch.registrationOpen ? (
                  <Link href="/coach-certification" className="group w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all duration-300">
                    Reserve Your Spot <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                ) : (
                  // Closed batches: keep the CTA visible (so users still
                  // discover the program) but make it clear the link
                  // points to the listing, not a registration form.
                  <Link href="/coach-certification" className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/80 hover:text-white border border-white/10 font-semibold transition-all duration-300">
                    View All Programs <ArrowRight className="w-5 h-5" />
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}