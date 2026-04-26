import { gunzipSync, unzipSync } from 'fflate';

export interface ExtractedFile {
    /** Path relative to the archive root, lowercased. */
    path: string;
    data: Uint8Array;
}

export function detectFormat(bytes: Uint8Array): 'gzip' | 'zip' | 'tar' | 'unknown' {
    if (bytes.length < 4) return 'unknown';
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
    // POSIX tar: "ustar" magic at offset 257
    if (bytes.length >= 512) {
        const slice = bytes.subarray(257, 263);
        const txt = new TextDecoder().decode(slice);
        if (txt.startsWith('ustar')) return 'tar';
    }
    return 'unknown';
}

const textDecoder = new TextDecoder();

function parseTar(bytes: Uint8Array): ExtractedFile[] {
    const entries: ExtractedFile[] = [];
    let offset = 0;
    while (offset + 512 <= bytes.length) {
        const header = bytes.subarray(offset, offset + 512);
        if (header[0] === 0) break;
        const rawName = textDecoder.decode(header.subarray(0, 100)).replace(/\0.*$/, '');
        const prefix = textDecoder.decode(header.subarray(345, 500)).replace(/\0.*$/, '');
        const name = prefix ? `${prefix}/${rawName}` : rawName;
        const sizeStr = textDecoder.decode(header.subarray(124, 136)).replace(/\0.*$/, '').trim();
        const size = parseInt(sizeStr, 8) || 0;
        const type = String.fromCharCode(header[156] || 0);
        offset += 512;
        if ((type === '0' || type === '' || type === '\0') && name) {
            entries.push({
                path: name.toLowerCase(),
                data: bytes.subarray(offset, offset + size),
            });
        }
        offset += Math.ceil(size / 512) * 512;
    }
    return entries;
}

function parseZip(bytes: Uint8Array): ExtractedFile[] {
    const raw = unzipSync(bytes);
    return Object.entries(raw).map(([path, data]) => ({
        path: path.toLowerCase(),
        data,
    }));
}

export async function extractArchive(
    bytes: Uint8Array,
    onProgress?: (fraction: number) => void,
): Promise<ExtractedFile[]> {
    const format = detectFormat(bytes);
    onProgress?.(0);
    let entries: ExtractedFile[];
    switch (format) {
        case 'gzip': {
            const tar = gunzipSync(bytes);
            entries = parseTar(tar);
            break;
        }
        case 'tar':
            entries = parseTar(bytes);
            break;
        case 'zip':
            entries = parseZip(bytes);
            break;
        default:
            throw new Error('Unsupported archive format (expected .tar.gz or .zip)');
    }
    onProgress?.(1);
    return entries;
}
