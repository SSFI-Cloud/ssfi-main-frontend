'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Shield,
    Search,
    CheckCircle,
    XCircle,
    Eye,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Clock,
    MapPin,
    Phone,
    Mail,
    Calendar,
    X,
    Check,
    AlertCircle,
    Building2,
    RefreshCw,
    AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { toast } from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Club {
    id: number;
    membership_id: string;
    club_name: string;
    contact_person: string;
    mobile_number: string;
    email_address: string;
    registration_number: string;
    established_year: string;
    district_name: string;
    state_name: string;
    club_address: string;
    logo_path: string;
    created_at: string;
    status: string;
    request_status: string;
}

interface Meta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

const STATUS_FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClubApprovalsPage() {
    const [clubs, setClubs]                       = useState<Club[]>([]);
    const [meta, setMeta]                         = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [filter, setFilter]                     = useState<string>('PENDING');
    const [searchInput, setSearchInput]           = useState('');
    const [searchQuery, setSearchQuery]           = useState('');
    const [currentPage, setCurrentPage]           = useState(1);
    const [isLoading, setIsLoading]               = useState(true);
    const [error, setError]                       = useState<string | null>(null);
    const [viewingClub, setViewingClub]           = useState<Club | null>(null);
    const [processingId, setProcessingId]         = useState<number | null>(null);
    const [rejectReason, setRejectReason]         = useState('');
    const [showRejectModal, setShowRejectModal]   = useState(false);
    const [selectedForReject, setSelectedForReject] = useState<Club | null>(null);

    const LIMIT = 10;

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchClubs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: Record<string, any> = {
                page: currentPage,
                limit: LIMIT,
            };
            if (filter !== 'ALL') params.status = filter;
            if (searchQuery) params.search = searchQuery;

            const res = await api.get('/clubs', { params });
            const payload = (res.data as any).data ?? res.data;
            setClubs(payload.clubs ?? []);
            setMeta(payload.meta ?? { total: 0, page: 1, limit: LIMIT, totalPages: 1 });
        } catch (err: any) {
            if (err.response?.status === 404) {
                setClubs([]);
            } else {
                setError(err.response?.data?.message ?? 'Failed to load clubs');
            }
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, searchQuery, filter]);

    useEffect(() => {
        fetchClubs();
    }, [fetchClubs]);

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => {
            setCurrentPage(1);
            setSearchQuery(searchInput);
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    // ── Actions ────────────────────────────────────────────────────────────────

    const handleApprove = async (club: Club) => {
        setProcessingId(club.id);
        try {
            await api.put(`/clubs/${club.id}/status`, { status: 'APPROVED' });
            toast.success(`${club.club_name} approved`);
            setViewingClub(null);
            fetchClubs();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to approve club');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async () => {
        if (!selectedForReject) return;
        setProcessingId(selectedForReject.id);
        try {
            await api.put(`/clubs/${selectedForReject.id}/status`, {
                status: 'REJECTED',
                remarks: rejectReason || undefined,
            });
            toast.success(`${selectedForReject.club_name} rejected`);
            setShowRejectModal(false);
            setSelectedForReject(null);
            setRejectReason('');
            setViewingClub(null);
            fetchClubs();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to reject club');
        } finally {
            setProcessingId(null);
        }
    };

    const openRejectModal = (club: Club) => {
        setSelectedForReject(club);
        setShowRejectModal(true);
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Club Approvals</h1>
                    <p className="text-gray-500 mt-1">Manage club registrations</p>
                </div>
                <div className="flex items-center gap-3">
                    {filter === 'PENDING' && (
                        <div className="px-4 py-2 bg-amber-100 text-amber-600 rounded-lg flex items-center gap-2 text-sm font-medium">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Clock className="w-4 h-4" /><span>{meta.total} Pending</span></>}
                        </div>
                    )}
                    <button
                        onClick={fetchClubs}
                        className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
                {STATUS_FILTERS.map(l => (
                    <button
                        key={l}
                        onClick={() => { setFilter(l); setCurrentPage(1); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            filter === l
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                    >
                        {l === 'ALL' ? 'All' : l.charAt(0) + l.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-100 border border-red-500/30 text-red-600 p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                    <button onClick={fetchClubs} className="ml-auto text-xs underline">Retry</button>
                </div>
            )}

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                <input
                    type="text"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search by club name or contact…"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
            ) : clubs.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                    <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500">No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}club{filter === 'PENDING' ? ' approvals' : 's found'}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {clubs.map((club, i) => (
                        <motion.div
                            key={club.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="bg-white rounded-2xl p-5 border border-gray-200 flex flex-col md:flex-row justify-between md:items-center gap-4"
                        >
                            <div className="space-y-2 min-w-0 flex-1">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h3 className="text-lg font-semibold text-gray-900">{club.club_name}</h3>
                                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono">{club.membership_id}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                                        club.request_status === 'APPROVED' ? 'bg-green-100 text-green-600 border-green-500/20'
                                        : club.request_status === 'REJECTED' ? 'bg-red-100 text-red-600 border-red-500/20'
                                        : 'bg-yellow-100 text-yellow-600 border-yellow-500/20'
                                    }`}>
                                        {club.request_status}
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-500">
                                    {club.contact_person && club.contact_person !== 'N/A' && (
                                        <div className="flex items-center gap-2"><Building2 className="w-4 h-4" /> {club.contact_person}</div>
                                    )}
                                    {club.email_address && club.email_address !== 'N/A' && (
                                        <div className="flex items-center gap-2"><Mail className="w-4 h-4" /> {club.email_address}</div>
                                    )}
                                    {club.mobile_number && club.mobile_number !== 'N/A' && (
                                        <div className="flex items-center gap-2"><Phone className="w-4 h-4" /> {club.mobile_number}</div>
                                    )}
                                    <div className="flex items-center gap-2 text-gray-900 font-medium">
                                        <MapPin className="w-4 h-4 text-gray-600" />
                                        {club.district_name}, {club.state_name}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4" /> Applied: {new Date(club.created_at).toLocaleDateString('en-IN')}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setViewingClub(club)}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                                >
                                    <Eye className="w-4 h-4" /> View
                                </button>
                                {club.request_status === 'PENDING' && (
                                    <>
                                        <button
                                            onClick={() => handleApprove(club)}
                                            disabled={processingId === club.id}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg border border-green-500/30 text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            {processingId === club.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => openRejectModal(club)}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg border border-red-500/30 text-sm font-medium transition-colors"
                                        >
                                            <XCircle className="w-4 h-4" /> Reject
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {meta.totalPages > 1 && (
                <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
                    <p className="text-sm text-gray-500">
                        Showing {((currentPage - 1) * LIMIT) + 1}–{Math.min(currentPage * LIMIT, meta.total)} of {meta.total}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-gray-700 text-sm font-medium px-2">Page {currentPage} of {meta.totalPages}</span>
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

            {/* ── Detail Modal ── */}
            <AnimatePresence>
                {viewingClub && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                        onClick={() => setViewingClub(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl max-w-2xl w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                                        {viewingClub.logo_path ? (
                                            <img
                                                src={viewingClub.logo_path.startsWith('http') || viewingClub.logo_path.startsWith('data:') ? viewingClub.logo_path : `https://api.ssfiskate.com/${viewingClub.logo_path}`}
                                                alt={viewingClub.club_name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Shield className="w-6 h-6 text-emerald-500" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">{viewingClub.club_name}</h2>
                                        <p className="text-emerald-600 font-mono text-xs">{viewingClub.membership_id}</p>
                                    </div>
                                </div>
                                <button onClick={() => setViewingClub(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    {[
                                        { label: 'Contact Person', value: viewingClub.contact_person },
                                        { label: 'Mobile', value: viewingClub.mobile_number },
                                        { label: 'Email', value: viewingClub.email_address },
                                        { label: 'Reg. Number', value: viewingClub.registration_number },
                                        { label: 'Est. Year', value: viewingClub.established_year },
                                        { label: 'Location', value: `${viewingClub.district_name}, ${viewingClub.state_name}` },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="bg-gray-50 rounded-xl p-4">
                                            <p className="text-xs text-gray-500 mb-1">{label}</p>
                                            <p className="font-medium text-gray-900 text-sm break-all">{value || '—'}</p>
                                        </div>
                                    ))}
                                </div>
                                {viewingClub.request_status === 'PENDING' && (
                                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                                        <button
                                            onClick={() => handleApprove(viewingClub)}
                                            disabled={processingId === viewingClub.id}
                                            className="flex-1 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                                        >
                                            {processingId === viewingClub.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Approve</>}
                                        </button>
                                        <button
                                            onClick={() => openRejectModal(viewingClub)}
                                            className="flex-1 py-3 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-medium flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <X className="w-5 h-5" /> Reject
                                        </button>
                                    </div>
                                )}
                                {viewingClub.request_status !== 'PENDING' && (
                                    <div className="pt-4 border-t border-gray-200 text-center">
                                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                                            viewingClub.request_status === 'APPROVED' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                        }`}>
                                            {viewingClub.request_status === 'APPROVED' ? <><CheckCircle className="w-4 h-4" /> Approved</> : <><XCircle className="w-4 h-4" /> Rejected</>}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Reject Modal ── */}
            <AnimatePresence>
                {showRejectModal && selectedForReject && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                        onClick={() => setShowRejectModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl max-w-md w-full p-6"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-6 h-6 text-gray-900" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Reject Club</h3>
                            <p className="text-gray-500 text-center text-sm mb-6">
                                Rejecting <span className="text-gray-900 font-medium">{selectedForReject.club_name}</span>
                            </p>
                            <textarea
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Reason for rejection (optional)…"
                                rows={3}
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none mb-4"
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReject}
                                    disabled={processingId === selectedForReject.id}
                                    className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                                >
                                    {processingId === selectedForReject.id ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Reject'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
