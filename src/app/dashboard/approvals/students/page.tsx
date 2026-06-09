'use client';

/**
 * Registered Students
 *
 * Lists every student whose registration has been paid for (auto-approved
 * by verifyStudentPayment — User.approvalStatus = 'APPROVED'). No admin
 * approval step exists for student registrations anymore; successful
 * payment is the qualifier.
 *
 * (File lives under /dashboard/approvals/students/ for backwards-compat
 * with the old route. The UI is read-only — view details only.)
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    Search,
    Eye,
    ChevronLeft,
    ChevronRight,
    Loader2,
    User,
    X,
    AlertCircle,
    RefreshCw,
    CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
    id: number;
    ssfi_id: string;
    name: string;
    father_name: string;
    dob: string;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    mobile: string;
    email: string;
    club_name: string | null;
    club_id: number | null;
    school_name: string | null;
    district_name: string;
    state_name: string;
    coach_name: string;
    approval_status: string;
    profile_image: string | null;
    created_at: string;
    last_payment_date: string | null;
    last_payment_type: 'STUDENT_REGISTRATION' | 'RENEWAL_FEE' | null;
    aadhaar_number: string | null;
}

/**
 * School-mode registrants have no real Club row (clubId = null), so
 * club_name comes back blank. Fall back to the school name instead —
 * it's the identifier admins want to see. Returns label + badge type.
 */
function venueFor(s: Student): { label: string; kind: 'club' | 'school' | 'none' } {
    if (s.club_name && s.club_name.trim()) return { label: s.club_name, kind: 'club' };
    if (s.school_name && s.school_name.trim()) return { label: s.school_name, kind: 'school' };
    return { label: '—', kind: 'none' };
}

interface Meta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface Stats {
    total: number;
    verified: number;
    pending: number;
    male: number;
    female: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(dob: string) {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age;
}

function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisteredStudentsPage() {
    const [students, setStudents]             = useState<Student[]>([]);
    const [meta, setMeta]                     = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [stats, setStats]                   = useState<Stats | null>(null);
    const [searchQuery, setSearchQuery]       = useState('');
    const [searchInput, setSearchInput]       = useState('');
    const [currentPage, setCurrentPage]       = useState(1);
    const [isLoading, setIsLoading]           = useState(true);
    const [error, setError]                   = useState<string | null>(null);
    const [viewingStudent, setViewingStudent] = useState<Student | null>(null);

    const LIMIT = 10;

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchStudents = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: Record<string, any> = {
                // Require at least one COMPLETED Razorpay payment of
                // STUDENT_REGISTRATION or RENEWAL_FEE type. This keeps
                // legacy/migrated "APPROVED" students (no Payment row)
                // out of the list — we only want people who went through
                // the current paid-registration flow.
                hasCompletedPayment: 'true',
                page: currentPage,
                limit: LIMIT,
            };
            if (searchQuery) params.search = searchQuery;

            const res = await api.get('/students', { params });
            // backend: { status:'success', data:{ students, meta, stats } }
            const payload = (res.data as any).data ?? res.data;
            setStudents(payload.students ?? []);
            setMeta(payload.meta ?? { total: 0, page: 1, limit: LIMIT, totalPages: 1 });
            if (payload.stats) setStats(payload.stats);
        } catch (err: any) {
            const msg = err.response?.data?.message ?? 'Failed to load registered students';
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, searchQuery]);

    useEffect(() => {
        fetchStudents();
    }, [fetchStudents]);

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => {
            setCurrentPage(1);
            setSearchQuery(searchInput);
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Registered Students</h1>
                    <p className="text-gray-500 mt-1">Students who have completed payment and are active members</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="font-medium">{meta.total} Registered</span>
                    </div>
                    <button
                        onClick={fetchStudents}
                        className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-100 border border-red-500/30 text-red-600 p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                    <button onClick={fetchStudents} className="ml-auto text-xs underline">Retry</button>
                </div>
            )}

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                <input
                    type="text"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search by name, UID, or mobile..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Student</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Club</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Registered</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-16 text-center">
                                        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                                        <p className="text-gray-500 mt-2 text-sm">Loading registered students…</p>
                                    </td>
                                </tr>
                            ) : students.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-16 text-center">
                                        <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                        <p className="text-gray-500">No registered students yet</p>
                                        <p className="text-xs text-gray-400 mt-1">Students will appear here after they complete payment.</p>
                                    </td>
                                </tr>
                            ) : (
                                students.map((student, index) => (
                                    <motion.tr
                                        key={student.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.04 }}
                                        className="border-b border-gray-200/30 hover:bg-gray-50/60"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${student.gender === 'MALE' ? 'bg-cyan-100' : 'bg-teal-100'}`}>
                                                    <User className={`w-5 h-5 ${student.gender === 'MALE' ? 'text-cyan-600' : 'text-teal-600'}`} />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900">{student.name}</p>
                                                    <p className="text-xs text-gray-500 font-mono">{student.ssfi_id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {(() => {
                                                const v = venueFor(student);
                                                return (
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm text-gray-900">{v.label}</p>
                                                        {v.kind === 'school' && (
                                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                                                                School
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-gray-700">{student.district_name}</p>
                                            <p className="text-xs text-gray-600">{student.state_name}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-gray-900">
                                                {fmtDate(student.last_payment_date || student.created_at)}
                                            </p>
                                            <p className="text-[11px] text-gray-500">
                                                {student.last_payment_type === 'RENEWAL_FEE'
                                                    ? 'Renewed'
                                                    : student.last_payment_type === 'STUDENT_REGISTRATION'
                                                        ? 'Registered'
                                                        : ''}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setViewingStudent(student)}
                                                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                                                    title="View Details"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {meta.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                            Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm text-gray-500 px-2">
                                {currentPage} / {meta.totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(meta.totalPages, p + 1))}
                                disabled={currentPage === meta.totalPages}
                                className="p-2 bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Detail Modal (read-only) ── */}
            <AnimatePresence>
                {viewingStudent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                        onClick={() => setViewingStudent(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                                <div className="flex items-center gap-4">
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${viewingStudent.gender === 'MALE' ? 'bg-cyan-100' : 'bg-teal-100'}`}>
                                        <User className={`w-7 h-7 ${viewingStudent.gender === 'MALE' ? 'text-cyan-600' : 'text-teal-600'}`} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">{viewingStudent.name}</h2>
                                        <p className="text-emerald-600 font-mono text-sm">{viewingStudent.ssfi_id}</p>
                                    </div>
                                </div>
                                <button onClick={() => setViewingStudent(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { label: "Father's Name", value: viewingStudent.father_name || '—' },
                                        { label: 'Date of Birth', value: viewingStudent.dob ? `${fmtDate(viewingStudent.dob)} (${calcAge(viewingStudent.dob)} yrs)` : '—' },
                                        { label: 'Mobile', value: viewingStudent.mobile || '—' },
                                        { label: 'Email', value: viewingStudent.email || '—' },
                                        { label: 'Gender', value: viewingStudent.gender },
                                        { label: 'Coach', value: viewingStudent.coach_name || '—' },
                                        // Aadhaar shown in full so admins can compare two
                                        // suspected duplicate registrations (sibling/parent
                                        // shared-Aadhaar scenarios). Treat as sensitive PII —
                                        // this panel is global-admin gated by the surrounding
                                        // route.
                                        { label: 'Aadhaar', value: viewingStudent.aadhaar_number || '—' },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="bg-gray-50 rounded-xl p-4">
                                            <p className="text-xs text-gray-500 mb-1">{label}</p>
                                            <p className={`font-medium text-gray-900 text-sm break-all ${label === 'Aadhaar' ? 'font-mono tracking-wider' : ''}`}>{value}</p>
                                        </div>
                                    ))}
                                    <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                                        {(() => {
                                            const v = venueFor(viewingStudent);
                                            return (
                                                <>
                                                    <p className="text-xs text-gray-500 mb-1">
                                                        {v.kind === 'school' ? 'School' : 'Club'}
                                                    </p>
                                                    <p className="font-medium text-gray-900">{v.label}</p>
                                                    <p className="text-sm text-gray-500">{viewingStudent.district_name}, {viewingStudent.state_name}</p>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
