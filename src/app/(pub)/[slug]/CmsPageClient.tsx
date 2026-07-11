'use client';

import DOMPurify from 'dompurify';
import { useEffect, useState } from 'react';

interface CmsPage {
    title: string;
    content: string;
    excerpt?: string | null;
    featuredImage?: string | null;
}

/**
 * Renders sanitized CMS page HTML. Sanitization runs client-side with
 * DOMPurify (same pattern as NewsDetailClient) so admin-entered HTML can
 * never inject scripts.
 */
export default function CmsPageClient({ page }: { page: CmsPage }) {
    const [html, setHtml] = useState('');

    useEffect(() => {
        setHtml(DOMPurify.sanitize(page.content || '', { ADD_ATTR: ['target', 'rel'] }));
    }, [page.content]);

    return (
        <div className="min-h-screen bg-white">
            {/* Header band */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 py-14 px-4">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-3xl md:text-4xl font-bold text-white">{page.title}</h1>
                    {page.excerpt && <p className="text-emerald-50 mt-2">{page.excerpt}</p>}
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-10">
                {page.featuredImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={page.featuredImage}
                        alt={page.title}
                        className="w-full max-h-96 object-cover rounded-2xl mb-8"
                    />
                )}
                <article
                    className="prose prose-emerald max-w-none prose-headings:font-bold prose-a:text-emerald-600"
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            </div>
        </div>
    );
}
