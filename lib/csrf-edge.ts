/**
 * CSRF verify tương thích Edge (middleware) — cùng thuật toán với lib/csrf.ts (SHA-256 hex)
 */

function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET || process.env.NEXTAUTH_SECRET || 'dev-csrf-secret-only'
  return secret
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input))
  const bytes = new Uint8Array(buf)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) return null
    out[i] = byte
  }
  return out
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = hexToBytes(a)
  const bb = hexToBytes(b)
  if (!ba || !bb || ba.length !== bb.length) return false
  let out = 0
  for (let i = 0; i < ba.length; i++) out |= ba[i]! ^ bb[i]!
  return out === 0
}

/** Dùng trong middleware (Edge) */
export async function verifyCsrfTokenEdge(token: string, hashedCookie: string): Promise<boolean> {
  const secret = getCsrfSecret()
  if (!secret && process.env.NODE_ENV === 'production') return false
  if (!token || !hashedCookie) return false
  const expected = await sha256Hex(token + secret)
  return timingSafeEqualHex(expected, hashedCookie)
}
