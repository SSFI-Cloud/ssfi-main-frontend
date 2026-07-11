'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Medal, Trophy, Calendar, MapPin, Loader2, Award } from 'lucide-react';
import { api } from '@/lib/api/client';

interface SkaterResult {
    studentId: number;
    studentName: string;
    membershipId: string | null;
    clubName: string | null;
    districtName: string | null;
    raceType: string;
    skateCategory: string;
    ageCategory: string;
    gender: string;
    position: number;
    timing: string | null;
}

interface EventGroup {
    event: { id: number; name: string; eventDate: string; eventLevel: string; venue?: string; city?: string };
    results: SkaterResult[];
}

interface Totals { events: number; results: number; gold: number; silver: number; bronze: number }

const medalStyle = (pos: number) => {
    switch (pos) {
        case 1: return 'bg-yellow-100 text-yellow-700 border-yellow-300';
        case 2: return 'bg-gray-100 text-gray-700 border-gray-300';
        case 3: return 'bg-orange-100 text-orange-700 border-orange-300';
        default: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
};

const positionLabel = (pos: number) => {
    switch (pos) {
        case 1: return 'Gold';
        case 2: return 'Silver';
        case 3: return 'Bronze';
        default: return `${pos}th place`;
    }
};

export default function SkaterResultsPage() {
    const [events, setEvents] = useState<EventGroup[]>([]);
    const [totals, setTotals] = useState<Totals>({ events: 0, results: 0, gold: 0, silver: 0, bronze: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get('/results/my-skaters')
            .then(res => {
                const d = res.data?.data;
                setEvents(Array.isArray(d?.events) ? d.events : []);
                if (d?.totals) setTotals(d.totals);
            })
            .catch(() => setError('Failed to load skater results. Please try again.'))
            .finally(() => setIsLoading(false));
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading skater results...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-emerald-500" /> Skater Results
                </h1>
                <p className="text-sm text-gray-500 mt-1">Published results of your skaters across all events</p>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: 'Events', value: totals.events, cls: 'text-emerald-600' },
                    { label: 'Results', value: totals.results, cls: 'text-gray-900' },
                    { label: 'Gold', value: totals.gold, cls: 'text-yellow-500' },
                    { label: 'Silver', value: totals.silver, cls: 'text-gray-500' },
                    { label: 'Bronze', value: totals.bronze, cls: 'text-orange-600' },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                        <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">{s.label}</p>
                    </div>
                ))}
            </div>

            {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

            {!error && events.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">
                    <Award className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    No published results for your skaters yet. Results appear here once an event organiser publishes them.
                </div>
            )}

            {events.map((group, gi) => (
                <motion.div
                    key={group.event.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(gi * 0.05, 0.3) }}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                    <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="font-bold text-gray-900">{group.event.name}</h2>
                            <p className="text-xs text-gray-500 flex items-center gap-3 mt-1">
                                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(group.event.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                {(group.event.venue || group.event.city) && (
                                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[group.event.venue, group.event.city].filter(Boolean).join(', ')}</span>
                                )}
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">{group.event.eventLevel}</span>
                            </p>
                        </div>
                        <span className="text-xs text-gray-500">{group.results.length} result(s)</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#f5f6f8]/60 text-gray-500 text-xs uppercase font-bold tracking-wider">
                                <tr>
                                    <th className="px-5 py-3">Skater</th>
                                    <th className="px-5 py-3">UID</th>
                                    <th className="px-5 py-3">Race</th>
                                    <th className="px-5 py-3">Category</th>
                                    <th className="px-5 py-3 text-center">Position</th>
                                    <th className="px-5 py-3 text-center">Timing</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {group.results.map((r, i) => (
                                    <tr key={`${r.studentId}-${r.raceType}-${i}`} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-5 py-3 font-medium text-gray-900">
                                            {r.studentName}
                                            {(r.clubName || r.districtName) && (
                                                <span className="block text-xs text-gray-400">{r.clubName || r.districtName}</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{r.membershipId || '—'}</td>
                                        <td className="px-5 py-3 text-gray-700">{r.raceType}</td>
                                        <td className="px-5 py-3 text-gray-500 text-xs">{r.skateCategory} · {r.ageCategory} · {r.gender}</td>
                                        <td className="px-5 py-3 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${medalStyle(r.position)}`}>
                                                {r.position <= 3 && <Medal className="w-3.5 h-3.5" />}
                                                {positionLabel(r.position)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-center font-mono text-xs text-gray-600">{r.timing || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
