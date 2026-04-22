/**
 * Compute an age category ("U-6", "U-10", "Seniors", "Masters 30+", …)
 * from a date of birth, using the Indian sports convention: the age is
 * reckoned as of **1 January** of the current year. A child who turns 10
 * on 2 Jan still competes in U-10 for the entire year.
 *
 * This mirrors the logic in backend/src/services/dashboard.service.ts —
 * keep the two in sync or skaters will see different categories on the
 * registration page vs the dashboard (which is exactly the bug that
 * prompted this helper in the first place).
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

    if (age < 0) return '—';
    if (age < 4)  return 'U-4';
    if (age < 6)  return 'U-6';
    if (age < 8)  return 'U-8';
    if (age < 10) return 'U-10';
    if (age < 12) return 'U-12';
    if (age < 14) return 'U-14';
    if (age < 17) return 'U-17';
    if (age < 19) return 'U-19';
    if (age < 30) return 'Seniors';
    return 'Masters 30+';
}
