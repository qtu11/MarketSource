/**
 * Markdown [label](url) → HTML <a> với href chỉ http(s)/mailto/đường dẫn tương đối an toàn.
 * Tránh javascript:, data:, vbscript:, v.v. trước khi DOMPurify.
 */

export function safeHrefForMarkdownLink(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return null
  }
  try {
    if (t.startsWith('/') && !t.startsWith('//')) {
      if (!/^\/[\w\-./?#=&%+:]*$/i.test(t)) return null
      return t
    }
    const u = new URL(t)
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
      return u.href
    }
  } catch {
    return null
  }
  return null
}

/**
 * Thay thế chuỗi Markdown [text](href) bằng <a>; nếu href không an toàn, chỉ giữ text (không tạo link).
 */
export function replaceMarkdownLinksWithSafeAnchors(
  raw: string,
  anchorAttrs: string
): string {
  return raw.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, label, url) => {
    const href = safeHrefForMarkdownLink(String(url))
    if (!href) {
      return String(label)
    }
    const safeLabel = String(label)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<a href=${JSON.stringify(href)} ${anchorAttrs}>${safeLabel}</a>`
  })
}
