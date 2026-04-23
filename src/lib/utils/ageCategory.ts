/**
 * Compute an age category ("U-6", "U-10", "Above 16", "Masters 30+") from
 * a date of birth, using the Indian sports convention: the age is reckoned
 * as of **1 January** of the current year. A child who turns 10 on 2 Jan
 * still competes in U-10 for the entire year.
 *
 * SSFI buckets — keep in sync with:
 *   - backend/src/services/dashboard.service.ts
 *   - backend/src/services/affiliation.service.ts (lookupMember)
 *   - frontend/src/lib/hooks/useStudent.ts (getAgeCategoryFromAge)
 *
 * Correct ladder:
 *   U-4, U-6, U-8, U-10, U-12, U-14, U-16, Above 16, Masters 30+
 *
 * No U-17 / U-19 / "Seniors" — the previous implementation had those and
 * produced the wrong category for every skater aged 16–18. Fixed here so
 * the admin students table and every downstream display agree.
 */
export function getAgeCategoryFromDob(dob: string | Date | null | undefined): string {
    if (!dob) return '—';
    const birth = typeof dob === 'string' ? new Date(dob) : dob;
    if (Number.isNaN(birth.getTime())) return '—';

    // As-of 1 Jan of the current year. Using .getFullYear() / 0 / 1
    // builds the Date in local time, which is fine — we only compare
    // year+month+day, never an instant.
    const cutoff = new Date(new Date().getFullYear(), 0, 1);

    let age = cutoff.getFullYear() - birth.getFullYear();
    const mo = cutoff.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && cutoff.getDate() < birth.getDate())) age--;

    if (age < 0)  return '—';
    if (age < 4)  return 'U-4';
    if (age < 6)  return 'U-6';
    if (age < 8)  return 'U-8';
    if (age < 10) return 'U-10';
    if (age < 12) return 'U-12';
    if (age < 14) return 'U-14';
    if (age < 16) return 'U-16';
    if (age < 30) return 'Above 16';
    return 'Masters 30+';
}
