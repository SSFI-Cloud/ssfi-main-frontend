'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Award, ArrowLeft, Users, Calendar, MapPin, IndianRupee, Download,
  CheckCircle2, Star, Search, Loader2, Eye, Edit2, X, Save,
  FileSpreadsheet
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';
import DownloadButton from '@/components/shared/DownloadButton';

interface Registration {
  id: number; registrationNumber: string; fullName: string; fatherName: string;
  gender: string; dateOfBirth: string; phone: string; email: string;
  state: string; district: string; city: string; bloodGroup: string | null;
  skatingExperience: number | null; tshirtSize: string | null;
  paymentStatus: string; amount: string; status: string;
  isCompleted: boolean; rating: string | null; remarks: string | null;
  certificateNumber: string | null; createdAt: string;
  // Admin-side fields — surfaced in the edit modal. Present on the
  // detail response, optional here because the list endpoint trims them.
  address?: string | null;
  pincode?: string | null;
  aadhaarNumber?: string | null;
  photo?: string | null;
  aadhaarCard?: string | null;
}

interface Program {
  id: number; level: number; title: string; description: string | null;
  startDate: string; endDate: string; lastDateToApply: string;
  venue: string; city: string; state: string; price: string;
  totalSeats: number; filledSeats: number; status: string;
  organizedBy: string | null; approvedBy: string | null;
  _count?: { registrations: number };
}

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'bg-emerald-100 text-emerald-700', PAYMENT_PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700', ATTENDED: 'bg-teal-100 text-teal-700',
  COMPLETED: 'bg-teal-100 text-teal-700', FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};
const PAY_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700', PAID: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700', REFUNDED: 'bg-gray-100 text-gray-600',
};

export default function ProgramDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [regLoading, setRegLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [completeModal, setCompleteModal] = useState<Registration | null>(null);
  const [rating, setRating] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });

  // Edit modal — admin can correct any participant-filled field and
  // download the photo / Aadhaar scan the applicant uploaded.
  const [editModal, setEditModal] = useState<Registration | null>(null);
  const [editForm, setEditForm] = useState<Partial<Registration>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = async (reg: Registration) => {
    setEditModal(reg);
    setEditForm(reg); // seed from list row, then replace with server detail
    setEditLoading(true);
    try {
      const res = await api.get('/coach-cert/registrations/' + reg.id);
      const full = res.data?.data as Registration;
      if (full) {
        setEditModal(full);
        setEditForm(full);
      }
    } catch {
      toast.error('Failed to load participant details');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    setEditSaving(true);
    try {
      const payload: any = {
        fullName: editForm.fullName,
        fatherName: editForm.fatherName,
        gender: editForm.gender,
        dateOfBirth: editForm.dateOfBirth ? String(editForm.dateOfBirth).split('T')[0] : undefined,
        phone: editForm.phone,
        email: editForm.email,
        address: editForm.address,
        city: editForm.city,
        district: editForm.district,
        state: editForm.state,
        pincode: editForm.pincode,
        bloodGroup: editForm.bloodGroup,
        skatingExperience: editForm.skatingExperience,
        tshirtSize: editForm.tshirtSize,
        aadhaarNumber: editForm.aadhaarNumber,
      };
      await api.put('/coach-cert/registrations/' + editModal.id, payload);
      toast.success('Participant details updated');
      setEditModal(null);
      fetchRegistrations();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  const fetchProgram = useCallback(async () => {
    try {
      const res = await api.get('/coach-cert/programs/' + id);
      setProgram(res.data?.data);
    } catch { toast.error('Failed to load program'); }
    finally { setLoading(false); }
  }, [id]);

  const fetchRegistrations = useCallback(async (page = 1) => {
    try {
      setRegLoading(true);
      const params: any = { page: String(page), limit: '50' };
      if (filterStatus) params.status = filterStatus;
      if (search) params.search = search;
      const res = await api.get('/coach-cert/programs/' + id + '/registrations', { params });
      setRegistrations(res.data?.data?.registrations || []);
      setMeta(res.data?.data?.meta || { total: 0, page: 1, totalPages: 1 });
    } catch { console.error('Failed to fetch registrations'); }
    finally { setRegLoading(false); }
  }, [id, filterStatus, search]);

  useEffect(() => { fetchProgram(); }, [fetchProgram]);
  useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);

  const handleExport = async () => {
    try {
      const res = await api.get('/coach-cert/programs/' + id + '/registrations/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const a = document.createElement('a'); a.href = url;
      a.download = 'coach-cert-registrations-' + id + '.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch { toast.error('Export failed'); }
  };

  const handleMarkComplete = async () => {
    if (!completeModal) return;
    setSaving(true);
    try {
      await api.put('/coach-cert/registrations/' + completeModal.id + '/mark-complete', {
        rating: rating || undefined, remarks: remarks || undefined,
      });
      toast.success('Marked as completed');
      setCompleteModal(null); setRating(0); setRemarks('');
      fetchRegistrations(); fetchProgram();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (regId: number, status: string) => {
    try {
      await api.put('/coach-cert/registrations/' + regId + '/status', { status });
      toast.success('Status updated');
      fetchRegistrations();
    } catch { toast.error('Failed to update status'); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-gray-600 animate-spin" /></div>;
  if (!program) return <div className="text-center py-20 text-gray-600">Program not found</div>;

  const stats = {
    total: meta.total,
    confirmed: registrations.filter(r => r.status === 'CONFIRMED' || r.status === 'ATTENDED' || r.status === 'COMPLETED').length,
    completed: registrations.filter(r => r.isCompleted).length,
    paid: registrations.filter(r => r.paymentStatus === 'PAID').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/coach-certification" className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{program.title}</h1>
          <p className="text-gray-600 text-sm mt-0.5">Level {program.level} &bull; {program.venue}, {program.city}</p>
        </div>
        <Link href={'/dashboard/coach-certification/create?edit=' + program.id}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-gray-600 text-sm transition-all">
          <Edit2 className="w-4 h-4" /> Edit
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Registered', value: stats.total, icon: Users, color: 'text-emerald-700' },
          { label: 'Paid', value: stats.paid, icon: IndianRupee, color: 'text-emerald-700' },
          { label: 'Confirmed', value: stats.confirmed, icon: CheckCircle2, color: 'text-teal-700' },
          { label: 'Completed', value: stats.completed, icon: Award, color: 'text-amber-700' },
        ].map((s, i) => (
          <div key={i} className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-600">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Program Info */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-600 block">Date</span><span className="text-gray-900">{new Date(program.startDate).toLocaleDateString('en-IN')} &mdash; {new Date(program.endDate).toLocaleDateString('en-IN')}</span></div>
          <div><span className="text-gray-600 block">Last Apply</span><span className="text-gray-900">{new Date(program.lastDateToApply).toLocaleDateString('en-IN')}</span></div>
          <div><span className="text-gray-600 block">Fee</span><span className="text-gray-900">&#8377;{Number(program.price).toLocaleString()}</span></div>
          <div><span className="text-gray-600 block">Seats</span><span className="text-gray-900">{program.filledSeats} / {program.totalSeats}</span></div>
        </div>
      </div>

      {/* Registrations */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 flex-1">Registrations</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm w-52 focus:outline-none" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none ">
              <option value="">All Status</option>
              <option value="REGISTERED">Registered</option><option value="CONFIRMED">Confirmed</option>
              <option value="ATTENDED">Attended</option><option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option><option value="CANCELLED">Cancelled</option>
            </select>
            <button onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-sm transition-all">
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
          </div>
        </div>

        {regLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-gray-600 animate-spin" /></div>
        ) : registrations.length === 0 ? (
          <div className="text-center py-12 text-gray-600">No registrations found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 text-gray-600 font-medium">#</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Reg No</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Name</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Phone</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">State</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Payment</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Status</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Rating</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{r.registrationNumber}</td>
                    <td className="px-4 py-3 text-gray-900">{r.fullName}</td>
                    <td className="px-4 py-3 text-gray-500">{r.phone}</td>
                    <td className="px-4 py-3 text-gray-500">{r.state}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${PAY_COLORS[r.paymentStatus] || 'bg-gray-100 text-gray-600'}`}>{r.paymentStatus}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.isCompleted && r.rating ? (
                        <span className="flex items-center gap-1 text-amber-700 text-xs"><Star className="w-3 h-3 fill-amber-400" />{Number(r.rating).toFixed(1)}</span>
                      ) : <span className="text-gray-500">&mdash;</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* View / edit — always available, even for
                            completed participants so the admin can
                            still pull their submitted attachments. */}
                        <button onClick={() => openEdit(r)}
                          className="p-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-700 transition-all" title="View / Edit details">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!r.isCompleted && (
                          <>
                            <button onClick={() => { setCompleteModal(r); setRating(0); setRemarks(''); }}
                              className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-all" title="Mark Complete">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <select value={r.status} onChange={e => handleStatusChange(r.id, e.target.value)}
                              className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-gray-900 text-xs focus:outline-none"
                              disabled={r.status === 'PAYMENT_PENDING'}>
                              {r.status === 'PAYMENT_PENDING' && <option value="PAYMENT_PENDING">Payment Pending</option>}
                              <option value="REGISTERED">Registered</option><option value="CONFIRMED">Confirmed</option>
                              <option value="ATTENDED">Attended</option><option value="CANCELLED">Cancelled</option>
                              <option value="FAILED">Failed</option>
                            </select>
                          </>
                        )}
                        {r.isCompleted && <span className="text-xs text-teal-400">&#10003; Certified</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 flex justify-center gap-2">
            {Array.from({ length: meta.totalPages }, (_, i) => (
              <button key={i} onClick={() => fetchRegistrations(i + 1)}
                className={`px-3 py-1 rounded-lg text-sm ${meta.page === i + 1 ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mark Complete Modal */}
      <AnimatePresence>
        {completeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-gray-200 bg-[#0f1729] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Mark as Completed</h3>
                <button onClick={() => setCompleteModal(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-500">Certifying: <span className="text-gray-900 font-medium">{completeModal.fullName}</span></p>
              <div>
                <label className="block text-sm text-gray-600 mb-2">Rating (1-5 stars)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setRating(n)}
                      className={`p-2 rounded-lg transition-all ${rating >= n ? 'text-amber-500 bg-amber-100' : 'text-gray-500 bg-white hover:bg-gray-50'}`}>
                      <Star className={`w-5 h-5 ${rating >= n ? 'fill-amber-400' : ''}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-2">Remarks (optional)</label>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none" placeholder="Any remarks..." />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setCompleteModal(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm">Cancel</button>
                <button onClick={handleMarkComplete} disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Mark Complete &amp; Certify
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View / Edit Participant Modal.
          Loads full record via GET /coach-cert/registrations/:id so fields
          like address / aadhaarNumber / photo / aadhaarCard (which the
          list endpoint trims) are available to edit + download. Save PUTs
          only the whitelisted set — see coach-cert.service.updateRegistration. */}
      <AnimatePresence>
        {editModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => !editSaving && setEditModal(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Edit Participant Details</h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{editModal.registrationNumber}</p>
                </div>
                <button onClick={() => setEditModal(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-5 h-5" /></button>
              </div>

              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
                {editLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
                ) : (
                  <>
                    {/* Attachments — shown first so the admin sees them
                        before scrolling through form fields. File upload
                        itself isn't wired into this modal yet; admins who
                        need to replace a photo can do it via the public
                        re-registration flow. */}
                    <section>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Attachments</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Photo</p>
                          {editForm.photo ? (
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={editForm.photo.startsWith('http') || editForm.photo.startsWith('data:')
                                  ? editForm.photo
                                  : 'https://api.ssfiskate.com/' + editForm.photo.replace(/^\//, '')}
                                alt="Participant photo"
                                className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                              <DownloadButton url={editForm.photo}
                                filename={(editForm.fullName || 'participant') + '-photo'}
                                label="Download" />
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">No photo uploaded</p>
                          )}
                        </div>
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Aadhaar Card</p>
                          {editForm.aadhaarCard ? (
                            <DownloadButton url={editForm.aadhaarCard}
                              filename={(editForm.fullName || 'participant') + '-aadhaar'}
                              label="Download Aadhaar" />
                          ) : (
                            <p className="text-xs text-gray-500">No Aadhaar card uploaded</p>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Form fields — same whitelist as backend */}
                    <section>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Personal Details</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Full Name *" value={editForm.fullName}
                          onChange={v => setEditForm(f => ({ ...f, fullName: v }))} />
                        <Field label="Father's Name" value={editForm.fatherName}
                          onChange={v => setEditForm(f => ({ ...f, fatherName: v }))} />
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Gender</label>
                          <select value={editForm.gender ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900">
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <Field label="Date of Birth" type="date"
                          value={editForm.dateOfBirth ? String(editForm.dateOfBirth).split('T')[0] : ''}
                          onChange={v => setEditForm(f => ({ ...f, dateOfBirth: v }))} />
                        <Field label="Phone *" value={editForm.phone}
                          onChange={v => setEditForm(f => ({ ...f, phone: v }))} />
                        <Field label="Email" type="email" value={editForm.email}
                          onChange={v => setEditForm(f => ({ ...f, email: v }))} />
                        <Field label="Aadhaar Number" value={editForm.aadhaarNumber}
                          onChange={v => setEditForm(f => ({ ...f, aadhaarNumber: v }))} />
                        <Field label="Blood Group" value={editForm.bloodGroup}
                          onChange={v => setEditForm(f => ({ ...f, bloodGroup: v }))} />
                      </div>
                    </section>

                    <section>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Address</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <Field label="Address" value={editForm.address}
                            onChange={v => setEditForm(f => ({ ...f, address: v }))} />
                        </div>
                        <Field label="City" value={editForm.city}
                          onChange={v => setEditForm(f => ({ ...f, city: v }))} />
                        <Field label="District" value={editForm.district}
                          onChange={v => setEditForm(f => ({ ...f, district: v }))} />
                        <Field label="State" value={editForm.state}
                          onChange={v => setEditForm(f => ({ ...f, state: v }))} />
                        <Field label="Pincode" value={editForm.pincode}
                          onChange={v => setEditForm(f => ({ ...f, pincode: v }))} />
                      </div>
                    </section>

                    <section>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Skating</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Field label="Experience (Years)" type="number"
                          value={editForm.skatingExperience != null ? String(editForm.skatingExperience) : ''}
                          onChange={v => setEditForm(f => ({ ...f, skatingExperience: v === '' ? null : Number(v) }))} />
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">T-Shirt Size</label>
                          <select value={editForm.tshirtSize ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, tshirtSize: e.target.value || null }))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900">
                            <option value="">—</option>
                            <option value="S">S</option><option value="M">M</option><option value="L">L</option>
                            <option value="XL">XL</option><option value="XXL">XXL</option>
                          </select>
                        </div>
                      </div>
                    </section>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
                <button onClick={() => setEditModal(null)} disabled={editSaving}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleEditSave} disabled={editSaving || editLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold disabled:opacity-50">
                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Small text-input helper so the edit modal stays readable. Kept local
// to this file — nothing else currently needs it.
function Field({ label, value, onChange, type = 'text' }: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
    </div>
  );
}
