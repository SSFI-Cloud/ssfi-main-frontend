import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageClient from './CmsPageClient';

/**
 * Catch-all renderer for CMS "Pages" (admin-editable static content).
 *
 * Before this existed, the CMS Static Pages module was write-only: admins
 * could create/edit pages in the dashboard but nothing on the public site
 * ever rendered them (a newly created slug simply 404'd). Hardcoded routes
 * (about, privacy, terms, …) take precedence over this dynamic segment, so
 * existing pages are unaffected; this renders every OTHER published slug.
 *
 * DRAFT pages stay invisible — the API's /cms/pages/slug/:slug already
 * returns 404 for anything not PUBLISHED.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.ssfiskate.com/api/v1';

interface Props {
    params: Promise<{ slug: string }>;
}

async function getPage(slug: string) {
    try {
        const res = await fetch(`${API_URL}/cms/pages/slug/${encodeURIComponent(slug)}`, {
            next: { revalidate: 300 },
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data ?? null;
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const page = await getPage(slug);
    if (!page) return { title: 'Page Not Found' };
    return {
        title: page.metaTitle || `${page.title} | SSFI`,
        description: page.metaDescription || page.excerpt || undefined,
        keywords: page.metaKeywords || undefined,
    };
}

export default async function CmsPage({ params }: Props) {
    const { slug } = await params;
    const page = await getPage(slug);
    if (!page) notFound();
    return <CmsPageClient page={page} />;
}
