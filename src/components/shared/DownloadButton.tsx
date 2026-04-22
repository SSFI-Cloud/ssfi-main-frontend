'use client';

import { Download } from 'lucide-react';
import { resolveImageUrl } from '@/lib/utils/resolveImageUrl';
import { downloadAttachment } from '@/lib/utils/downloadAttachment';

interface DownloadButtonProps {
    /**
     * The attachment URL. Can be a raw backend path (uploads/...), a
     * fully-qualified URL, or a data: URI. Resolved through resolveImageUrl
     * before download so relative backend paths work without extra wiring.
     */
    url?: string | null;
    /**
     * Suggested filename for the download. Defaults to the URL tail.
     */
    filename?: string;
    /**
     * Visual variant:
     *  - "overlay": a small pill floated at the top-right corner of a
     *    positioned parent (wrap the image in a `relative` container).
     *  - "inline":  a standalone button / link that flows in the normal
     *    document (for beside-the-image layouts).
     */
    variant?: 'overlay' | 'inline';
    /** Optional custom label; defaults to "Download" for inline. */
    label?: string;
    className?: string;
}

/**
 * Reusable download button for user-submitted attachments. Renders nothing
 * when `url` is empty, so callers can drop it in unconditionally.
 */
export default function DownloadButton({
    url,
    filename,
    variant = 'inline',
    label = 'Download',
    className = '',
}: DownloadButtonProps) {
    if (!url) return null;

    const resolved = resolveImageUrl(url);
    if (!resolved) return null;

    const handleClick = (e: React.MouseEvent) => {
        // Guard against the button being used inside a <Link> / clickable
        // card — clicking download should NOT navigate.
        e.preventDefault();
        e.stopPropagation();
        downloadAttachment(resolved, filename);
    };

    if (variant === 'overlay') {
        return (
            <button
                type="button"
                onClick={handleClick}
                title={label}
                className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-black/60 hover:bg-black/80 text-white shadow-sm backdrop-blur-sm transition-colors ${className}`}
            >
                <Download className="w-4 h-4" />
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors ${className}`}
        >
            <Download className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}
