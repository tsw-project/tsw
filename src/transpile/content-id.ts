function seededRandomBytes(seed: number, length: number): Uint8Array {
    if (seed === 0) seed = 1;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        seed = (seed * 16807) % 2147483647;
        bytes[i] = seed & 0xff;
    }
    return bytes;
}

function hashStringToNumber(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
}

export function generateContentId(seed: string): string {
    const rnds = seededRandomBytes(hashStringToNumber(seed), 16);
    rnds[6] = (rnds[6]! & 0x0f) | 0x40;
    rnds[8] = (rnds[8]! & 0x3f) | 0x80;
    const hex = Array.from(rnds).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
