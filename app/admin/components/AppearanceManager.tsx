"use client"

import { useState, useEffect, useCallback } from "react"
import { logger } from "@/lib/logger-client"

// ========================= ICONS =========================
const icons = {
    save: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
    ),
    refresh: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
    ),
    palette: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>
    ),
    type: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
    ),
    layout: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
    ),
    globe: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
    ),
    share: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
    ),
    image: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
    ),
    brand: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
    ),
    footer: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15h18" /></svg>
    ),
    code: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
    ),
    check: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    ),
    eye: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
    ),
    reset: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
    ),
}

// ========================= TYPES =========================
interface SiteSettings {
    // Branding
    siteName: string
    siteTagline: string
    logoUrl: string
    faviconUrl: string
    // Colors
    primaryColor: string
    secondaryColor: string
    accentColor: string
    backgroundColor: string
    surfaceColor: string
    textColor: string
    mutedTextColor: string
    borderColor: string
    successColor: string
    warningColor: string
    errorColor: string
    // Typography
    headingFont: string
    bodyFont: string
    baseFontSize: string
    headingWeight: string
    // Hero
    heroTitle: string
    heroSubtitle: string
    heroButtonText: string
    heroButtonLink: string
    heroBgType: string
    heroBgColor: string
    heroBgImage: string
    heroOverlayOpacity: string
    // Layout
    layoutMode: string
    sidebarPosition: string
    containerWidth: string
    navStyle: string
    cardStyle: string
    borderRadius: string
    // Footer
    contactEmail: string
    contactPhone: string
    contactAddress: string
    footerText: string
    footerStyle: string
    // Social Links
    facebookUrl: string
    twitterUrl: string
    instagramUrl: string
    youtubeUrl: string
    telegramUrl: string
    githubUrl: string
    tiktokUrl: string
    // SEO
    metaTitle: string
    metaDescription: string
    metaKeywords: string
    ogImage: string
    // Advanced
    customCss: string
    customHeaderHtml: string
    customFooterHtml: string
    analyticsId: string
    maintenanceMode: boolean
    maintenanceMessage: string
}

const DEFAULT_SETTINGS: SiteSettings = {
    siteName: "QtusDev Market",
    siteTagline: "Digital Products Marketplace",
    logoUrl: "",
    faviconUrl: "",
    primaryColor: "#8B5CF6",
    secondaryColor: "#EC4899",
    accentColor: "#06B6D4",
    backgroundColor: "#0F172A",
    surfaceColor: "#1E293B",
    textColor: "#F8FAFC",
    mutedTextColor: "#94A3B8",
    borderColor: "#334155",
    successColor: "#22C55E",
    warningColor: "#F59E0B",
    errorColor: "#EF4444",
    headingFont: "Inter",
    bodyFont: "Inter",
    baseFontSize: "16",
    headingWeight: "700",
    heroTitle: "Mã nguồn chất lượng cao",
    heroSubtitle: "Kho mã nguồn được curate bởi đội ngũ kiến trúc sư phần mềm.",
    heroButtonText: "Khám phá ngay",
    heroButtonLink: "/products",
    heroBgType: "gradient",
    heroBgColor: "#1a1a2e",
    heroBgImage: "",
    heroOverlayOpacity: "50",
    layoutMode: "dark",
    sidebarPosition: "left",
    containerWidth: "1280",
    navStyle: "floating",
    cardStyle: "glass",
    borderRadius: "12",
    contactEmail: "admin@qtusdev.com",
    contactPhone: "0999.888.777",
    contactAddress: "TP. Hồ Chí Minh, Việt Nam",
    footerText: "© 2025 QtusDev Market. All rights reserved.",
    footerStyle: "modern",
    facebookUrl: "",
    twitterUrl: "",
    instagramUrl: "",
    youtubeUrl: "",
    telegramUrl: "",
    githubUrl: "",
    tiktokUrl: "",
    metaTitle: "QtusDev Market - Digital Products Marketplace",
    metaDescription: "Kho mã nguồn chất lượng cao, được curate bởi đội ngũ kiến trúc sư phần mềm chuyên nghiệp.",
    metaKeywords: "source code, marketplace, web templates, digital products",
    ogImage: "",
    customCss: "",
    customHeaderHtml: "",
    customFooterHtml: "",
    analyticsId: "",
    maintenanceMode: false,
    maintenanceMessage: "Website đang bảo trì. Vui lòng quay lại sau.",
}

const FONT_OPTIONS = [
    "Inter", "Roboto", "Open Sans", "Montserrat", "Poppins", "Raleway",
    "Lato", "Nunito", "Source Sans Pro", "Ubuntu", "Outfit", "DM Sans",
    "Plus Jakarta Sans", "Manrope", "Lexend", "Be Vietnam Pro",
]

const TABS = [
    { id: "branding", label: "Thương hiệu", icon: icons.brand },
    { id: "colors", label: "Màu sắc", icon: icons.palette },
    { id: "typography", label: "Chữ viết", icon: icons.type },
    { id: "hero", label: "Hero Section", icon: icons.image },
    { id: "layout", label: "Bố cục", icon: icons.layout },
    { id: "footer", label: "Footer & Liên hệ", icon: icons.footer },
    { id: "social", label: "Mạng xã hội", icon: icons.share },
    { id: "seo", label: "SEO", icon: icons.globe },
    { id: "advanced", label: "Nâng cao", icon: icons.code },
] as const

type TabId = typeof TABS[number]["id"]

// ========================= COMPONENTS =========================

function ColorPicker({ label, value, onChange, name }: {
    label: string; value: string; onChange: (name: string, val: string) => void; name: string
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="relative group">
                <input
                    type="color"
                    value={value || "#000000"}
                    onChange={(e) => onChange(name, e.target.value)}
                    className="w-10 h-10 rounded-lg border-2 border-white/10 cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {value}
                </div>
            </div>
            <div className="flex-1">
                <div className="text-sm font-medium text-gray-200">{label}</div>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(name, e.target.value)}
                    className="text-xs text-gray-400 bg-transparent border-none outline-none w-20 font-mono"
                    placeholder="#000000"
                />
            </div>
        </div>
    )
}

function FormField({ label, desc, children }: {
    label: string; desc?: string; children: React.ReactNode
}) {
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-200">{label}</label>
            {desc && <p className="text-xs text-gray-500">{desc}</p>}
            {children}
        </div>
    )
}

function SelectField({ label, desc, value, options, onChange }: {
    label: string; desc?: string; value: string; options: { value: string; label: string }[]; onChange: (val: string) => void
}) {
    return (
        <FormField label={label} desc={desc}>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </FormField>
    )
}

function InputField({ label, desc, value, onChange, name, type = "text", placeholder }: {
    label: string; desc?: string; value: string; onChange: (name: string, val: string) => void; name: string; type?: string; placeholder?: string
}) {
    return (
        <FormField label={label} desc={desc}>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(name, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all placeholder:text-gray-600"
            />
        </FormField>
    )
}

function TextareaField({ label, desc, value, onChange, name, rows = 3, mono = false }: {
    label: string; desc?: string; value: string; onChange: (name: string, val: string) => void; name: string; rows?: number; mono?: boolean
}) {
    return (
        <FormField label={label} desc={desc}>
            <textarea
                value={value}
                onChange={(e) => onChange(name, e.target.value)}
                rows={rows}
                className={`w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all resize-y placeholder:text-gray-600 ${mono ? "font-mono text-xs" : ""}`}
            />
        </FormField>
    )
}

function ToggleField({ label, desc, value, onChange }: {
    label: string; desc?: string; value: boolean; onChange: (val: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between py-2">
            <div>
                <div className="text-sm font-medium text-gray-200">{label}</div>
                {desc && <p className="text-xs text-gray-500">{desc}</p>}
            </div>
            <button
                type="button"
                onClick={() => onChange(!value)}
                className={`relative w-11 h-6 rounded-full transition-colors ${value ? "bg-purple-600" : "bg-gray-700"}`}
            >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${value ? "translate-x-5" : ""}`} />
            </button>
        </div>
    )
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
    return (
        <div className="mb-5">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {desc && <p className="text-sm text-gray-400 mt-1">{desc}</p>}
        </div>
    )
}

// ========================= PRESET THEMES =========================
const PRESETS = [
    {
        name: "Dark Purple",
        colors: { primaryColor: "#8B5CF6", secondaryColor: "#EC4899", accentColor: "#06B6D4", backgroundColor: "#0F172A", surfaceColor: "#1E293B", textColor: "#F8FAFC", borderColor: "#334155" },
    },
    {
        name: "Midnight Blue",
        colors: { primaryColor: "#3B82F6", secondaryColor: "#8B5CF6", accentColor: "#14B8A6", backgroundColor: "#0A0E27", surfaceColor: "#131A3D", textColor: "#E2E8F0", borderColor: "#1E2A52" },
    },
    {
        name: "Emerald Dark",
        colors: { primaryColor: "#10B981", secondaryColor: "#06B6D4", accentColor: "#F59E0B", backgroundColor: "#0D1117", surfaceColor: "#161B22", textColor: "#F0FDF4", borderColor: "#30363D" },
    },
    {
        name: "Rose Gold",
        colors: { primaryColor: "#F43F5E", secondaryColor: "#FB923C", accentColor: "#A855F7", backgroundColor: "#18181B", surfaceColor: "#27272A", textColor: "#FAFAFA", borderColor: "#3F3F46" },
    },
    {
        name: "Cyber Neon",
        colors: { primaryColor: "#00FF88", secondaryColor: "#FF0080", accentColor: "#00D4FF", backgroundColor: "#0A0A0A", surfaceColor: "#141414", textColor: "#EDEDED", borderColor: "#2A2A2A" },
    },
    {
        name: "Light Clean",
        colors: { primaryColor: "#6366F1", secondaryColor: "#EC4899", accentColor: "#06B6D4", backgroundColor: "#FFFFFF", surfaceColor: "#F8FAFC", textColor: "#1E293B", borderColor: "#E2E8F0" },
    },
]

// ========================= MAIN COMPONENT =========================

export function AppearanceManager() {
    const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [activeTab, setActiveTab] = useState<TabId>("branding")
    const [hasChanges, setHasChanges] = useState(false)
    const [savedSettings, setSavedSettings] = useState<SiteSettings>(DEFAULT_SETTINGS)
    const [showPreview, setShowPreview] = useState(false)
    const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null)

    const showToast = useCallback((type: "success" | "error", msg: string) => {
        setToast({ type, msg })
        setTimeout(() => setToast(null), 3000)
    }, [])

    const loadSettings = useCallback(async () => {
        setIsLoading(true)
        try {
            const { apiGet } = await import("@/lib/api-client")
            const result = await apiGet("/api/settings")
            if (result?.settings) {
                const merged = { ...DEFAULT_SETTINGS, ...result.settings }
                setSettings(merged)
                setSavedSettings(merged)
            }
        } catch (error) {
            logger.error("Failed to load settings", error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadSettings()
    }, [loadSettings])

    useEffect(() => {
        setHasChanges(JSON.stringify(settings) !== JSON.stringify(savedSettings))
    }, [settings, savedSettings])

    const handleChange = useCallback((name: string, value: string | boolean) => {
        setSettings((prev) => ({ ...prev, [name]: value }))
    }, [])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const { apiPost } = await import("@/lib/api-client")
            const response = await apiPost("/api/settings", settings)
            if (response?.success) {
                setSavedSettings({ ...settings })
                setHasChanges(false)
                showToast("success", "Đã lưu cấu hình giao diện thành công!")
            } else {
                showToast("error", response?.error || "Đã có lỗi xảy ra.")
            }
        } catch (error: any) {
            showToast("error", "Lỗi kết nối: " + error.message)
            logger.error("Failed to save settings", error)
        } finally {
            setIsSaving(false)
        }
    }

    const applyPreset = (preset: typeof PRESETS[0]) => {
        setSettings((prev) => ({ ...prev, ...preset.colors }))
        showToast("success", `Đã áp dụng preset "${preset.name}"`)
    }

    const resetToDefault = () => {
        if (confirm("Khôi phục tất cả về mặc định?")) {
            setSettings(DEFAULT_SETTINGS)
            showToast("success", "Đã khôi phục mặc định")
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-3">
                    <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-gray-400">Đang tải cấu hình giao diện...</p>
                </div>
            </div>
        )
    }

    // ========================= TAB CONTENT =========================
    const renderTabContent = () => {
        switch (activeTab) {
            case "branding":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="Thương hiệu & Logo" desc="Cấu hình thông tin nhận diện thương hiệu" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <InputField label="Tên Website" name="siteName" value={settings.siteName} onChange={handleChange} placeholder="QtusDev Market" />
                            <InputField label="Slogan / Tagline" name="siteTagline" value={settings.siteTagline} onChange={handleChange} placeholder="Digital Products Marketplace" />
                            <InputField label="Logo URL" desc="URL hình ảnh logo (SVG hoặc PNG khuyến nghị)" name="logoUrl" value={settings.logoUrl} onChange={handleChange} placeholder="https://example.com/logo.svg" />
                            <InputField label="Favicon URL" desc="URL favicon (16x16 hoặc 32x32 ICO/PNG)" name="faviconUrl" value={settings.faviconUrl} onChange={handleChange} placeholder="https://example.com/favicon.ico" />
                        </div>
                        {(settings.logoUrl || settings.faviconUrl) && (
                            <div className="flex gap-6 pt-3">
                                {settings.logoUrl && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-500">Preview Logo</p>
                                        <div className="w-40 h-16 bg-gray-800 rounded-lg flex items-center justify-center p-2 border border-gray-700">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={settings.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                        </div>
                                    </div>
                                )}
                                {settings.faviconUrl && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-500">Preview Favicon</p>
                                        <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center p-1 border border-gray-700">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={settings.faviconUrl} alt="Favicon" className="max-h-full max-w-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )

            case "colors":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="Bảng màu" desc="Tùy chỉnh toàn bộ bảng màu hoặc chọn preset có sẵn" />
                        {/* Presets */}
                        <div>
                            <p className="text-sm font-medium text-gray-300 mb-3">Preset nhanh</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                                {PRESETS.map((p) => (
                                    <button
                                        key={p.name}
                                        onClick={() => applyPreset(p)}
                                        className="group relative p-3 rounded-xl border border-gray-700 hover:border-purple-500 transition-all bg-gray-800/40 hover:bg-gray-800/80"
                                    >
                                        <div className="flex gap-1 mb-2 justify-center">
                                            {[p.colors.primaryColor, p.colors.secondaryColor, p.colors.accentColor].map((c, i) => (
                                                <div key={i} className="w-5 h-5 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                                            ))}
                                        </div>
                                        <p className="text-xs text-gray-400 text-center group-hover:text-white transition-colors">{p.name}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Main Colors */}
                        <div>
                            <p className="text-sm font-medium text-gray-300 mb-3">Màu chính</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <ColorPicker label="Primary" name="primaryColor" value={settings.primaryColor} onChange={handleChange} />
                                <ColorPicker label="Secondary" name="secondaryColor" value={settings.secondaryColor} onChange={handleChange} />
                                <ColorPicker label="Accent" name="accentColor" value={settings.accentColor} onChange={handleChange} />
                            </div>
                        </div>
                        {/* Background & Surface */}
                        <div>
                            <p className="text-sm font-medium text-gray-300 mb-3">Nền & Bề mặt</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <ColorPicker label="Background" name="backgroundColor" value={settings.backgroundColor} onChange={handleChange} />
                                <ColorPicker label="Surface" name="surfaceColor" value={settings.surfaceColor} onChange={handleChange} />
                                <ColorPicker label="Border" name="borderColor" value={settings.borderColor} onChange={handleChange} />
                            </div>
                        </div>
                        {/* Text */}
                        <div>
                            <p className="text-sm font-medium text-gray-300 mb-3">Chữ viết</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <ColorPicker label="Text chính" name="textColor" value={settings.textColor} onChange={handleChange} />
                                <ColorPicker label="Text phụ" name="mutedTextColor" value={settings.mutedTextColor} onChange={handleChange} />
                            </div>
                        </div>
                        {/* Status */}
                        <div>
                            <p className="text-sm font-medium text-gray-300 mb-3">Trạng thái</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <ColorPicker label="Thành công" name="successColor" value={settings.successColor} onChange={handleChange} />
                                <ColorPicker label="Cảnh báo" name="warningColor" value={settings.warningColor} onChange={handleChange} />
                                <ColorPicker label="Lỗi" name="errorColor" value={settings.errorColor} onChange={handleChange} />
                            </div>
                        </div>
                        {/* Live preview bar */}
                        <div className="p-4 rounded-xl border border-gray-700" style={{ backgroundColor: settings.backgroundColor }}>
                            <p className="text-xs text-gray-500 mb-2">Preview nhanh</p>
                            <div className="flex gap-2 flex-wrap">
                                <span className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ backgroundColor: settings.primaryColor }}>Primary</span>
                                <span className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ backgroundColor: settings.secondaryColor }}>Secondary</span>
                                <span className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ backgroundColor: settings.accentColor }}>Accent</span>
                                <span className="px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: settings.surfaceColor, color: settings.textColor, border: `1px solid ${settings.borderColor}` }}>Surface</span>
                                <span className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ backgroundColor: settings.successColor }}>Success</span>
                                <span className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ backgroundColor: settings.errorColor }}>Error</span>
                            </div>
                        </div>
                    </div>
                )

            case "typography":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="Kiểu chữ" desc="Chọn font chữ và kích thước cho toàn bộ website" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <SelectField
                                label="Font tiêu đề (Heading)"
                                desc="Áp dụng cho h1, h2, h3..."
                                value={settings.headingFont}
                                options={FONT_OPTIONS.map((f) => ({ value: f, label: f }))}
                                onChange={(val) => handleChange("headingFont", val)}
                            />
                            <SelectField
                                label="Font nội dung (Body)"
                                desc="Áp dụng cho paragraph, span, div..."
                                value={settings.bodyFont}
                                options={FONT_OPTIONS.map((f) => ({ value: f, label: f }))}
                                onChange={(val) => handleChange("bodyFont", val)}
                            />
                            <SelectField
                                label="Cỡ chữ gốc"
                                desc="Base font-size (px)"
                                value={settings.baseFontSize}
                                options={["13", "14", "15", "16", "17", "18"].map((v) => ({ value: v, label: `${v}px` }))}
                                onChange={(val) => handleChange("baseFontSize", val)}
                            />
                            <SelectField
                                label="Độ đậm tiêu đề"
                                value={settings.headingWeight}
                                options={[
                                    { value: "500", label: "Medium (500)" },
                                    { value: "600", label: "Semibold (600)" },
                                    { value: "700", label: "Bold (700)" },
                                    { value: "800", label: "Extrabold (800)" },
                                    { value: "900", label: "Black (900)" },
                                ]}
                                onChange={(val) => handleChange("headingWeight", val)}
                            />
                        </div>
                        {/* Font Preview */}
                        <div className="p-5 rounded-xl border border-gray-700 bg-gray-800/40 space-y-3">
                            <p className="text-xs text-gray-500">Preview</p>
                            <h2 style={{ fontFamily: settings.headingFont, fontWeight: parseInt(settings.headingWeight), fontSize: `${parseInt(settings.baseFontSize) + 8}px` }} className="text-white">
                                Tiêu đề mẫu — {settings.headingFont}
                            </h2>
                            <p style={{ fontFamily: settings.bodyFont, fontSize: `${settings.baseFontSize}px` }} className="text-gray-300">
                                Đây là đoạn văn bản mẫu với font {settings.bodyFont} cỡ {settings.baseFontSize}px. Trải nghiệm xem trước phông chữ trực tiếp trước khi lưu cấu hình.
                            </p>
                        </div>
                    </div>
                )

            case "hero":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="Hero Section" desc="Tùy chỉnh banner chính hiển thị trên trang chủ" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <InputField label="Tiêu đề chính (H1)" name="heroTitle" value={settings.heroTitle} onChange={handleChange} placeholder="Mã nguồn chất lượng cao" />
                            <InputField label="Nút CTA Text" name="heroButtonText" value={settings.heroButtonText} onChange={handleChange} placeholder="Khám phá ngay" />
                        </div>
                        <TextareaField label="Mô tả phụ (Subtitle)" name="heroSubtitle" value={settings.heroSubtitle} onChange={handleChange} rows={2} />
                        <InputField label="Nút CTA Link" desc="URL khi click vào nút" name="heroButtonLink" value={settings.heroButtonLink} onChange={handleChange} placeholder="/products" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <SelectField
                                label="Kiểu nền Hero"
                                value={settings.heroBgType}
                                options={[
                                    { value: "gradient", label: "Gradient (mặc định)" },
                                    { value: "solid", label: "Màu đơn sắc" },
                                    { value: "image", label: "Hình ảnh" },
                                    { value: "video", label: "Video Background" },
                                ]}
                                onChange={(val) => handleChange("heroBgType", val)}
                            />
                            {settings.heroBgType === "solid" && (
                                <ColorPicker label="Màu nền Hero" name="heroBgColor" value={settings.heroBgColor} onChange={handleChange} />
                            )}
                            {(settings.heroBgType === "image" || settings.heroBgType === "video") && (
                                <InputField label="URL Hình/Video" name="heroBgImage" value={settings.heroBgImage} onChange={handleChange} placeholder="https://..." />
                            )}
                        </div>
                        <SelectField
                            label="Overlay Opacity"
                            desc="Độ mờ lớp phủ tối trên hero"
                            value={settings.heroOverlayOpacity}
                            options={["0", "10", "20", "30", "40", "50", "60", "70", "80", "90"].map((v) => ({ value: v, label: `${v}%` }))}
                            onChange={(val) => handleChange("heroOverlayOpacity", val)}
                        />
                    </div>
                )

            case "layout":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="Bố cục & UI" desc="Cấu hình bố cục tổng thể, kiểu thanh điều hướng, card, bo góc" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <SelectField
                                label="Chế độ sáng/tối"
                                value={settings.layoutMode}
                                options={[
                                    { value: "dark", label: "Dark Mode" },
                                    { value: "light", label: "Light Mode" },
                                    { value: "auto", label: "Theo hệ thống" },
                                ]}
                                onChange={(val) => handleChange("layoutMode", val)}
                            />
                            <SelectField
                                label="Kiểu Navigation"
                                value={settings.navStyle}
                                options={[
                                    { value: "floating", label: "Floating (nổi)" },
                                    { value: "fixed", label: "Fixed Top (cố định)" },
                                    { value: "sticky", label: "Sticky" },
                                    { value: "hidden", label: "Ẩn đi (landing page)" },
                                ]}
                                onChange={(val) => handleChange("navStyle", val)}
                            />
                            <SelectField
                                label="Sidebar Admin"
                                value={settings.sidebarPosition}
                                options={[
                                    { value: "left", label: "Bên trái" },
                                    { value: "right", label: "Bên phải" },
                                    { value: "collapsed", label: "Thu gọn mặc định" },
                                ]}
                                onChange={(val) => handleChange("sidebarPosition", val)}
                            />
                            <SelectField
                                label="Kiểu Card"
                                value={settings.cardStyle}
                                options={[
                                    { value: "glass", label: "Glassmorphism" },
                                    { value: "solid", label: "Solid (không trong suốt)" },
                                    { value: "outlined", label: "Outlined (viền)" },
                                    { value: "shadow", label: "Shadow (đổ bóng)" },
                                    { value: "flat", label: "Flat (phẳng)" },
                                ]}
                                onChange={(val) => handleChange("cardStyle", val)}
                            />
                            <InputField
                                label="Container Width"
                                desc="Max width nội dung chính (px)"
                                name="containerWidth"
                                value={settings.containerWidth}
                                onChange={handleChange}
                                type="number"
                                placeholder="1280"
                            />
                            <InputField
                                label="Border Radius"
                                desc="Bo góc mặc định (px)"
                                name="borderRadius"
                                value={settings.borderRadius}
                                onChange={handleChange}
                                type="number"
                                placeholder="12"
                            />
                        </div>
                        {/* Visual preview */}
                        <div className="p-4 rounded-xl border border-gray-700 bg-gray-800/40">
                            <p className="text-xs text-gray-500 mb-3">Preview Card Style</p>
                            <div
                                className="p-4 max-w-xs"
                                style={{
                                    borderRadius: `${settings.borderRadius}px`,
                                    border: settings.cardStyle === "outlined" ? `1px solid ${settings.borderColor}` : "none",
                                    backgroundColor: settings.cardStyle === "glass" ? "rgba(255,255,255,0.05)" : settings.surfaceColor,
                                    backdropFilter: settings.cardStyle === "glass" ? "blur(10px)" : "none",
                                    boxShadow: settings.cardStyle === "shadow" ? "0 10px 30px rgba(0,0,0,0.3)" : "none",
                                }}
                            >
                                <h4 className="text-white font-semibold text-sm mb-1">Card mẫu</h4>
                                <p className="text-gray-400 text-xs">Đây là preview kiểu card với border radius {settings.borderRadius}px</p>
                            </div>
                        </div>
                    </div>
                )

            case "footer":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="Footer & Liên hệ" desc="Cấu hình thông tin hiển thị ở chân trang" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <InputField label="Email Hỗ trợ" name="contactEmail" value={settings.contactEmail} onChange={handleChange} type="email" placeholder="admin@qtusdev.com" />
                            <InputField label="Hotline" name="contactPhone" value={settings.contactPhone} onChange={handleChange} placeholder="0999.888.777" />
                        </div>
                        <InputField label="Địa chỉ" name="contactAddress" value={settings.contactAddress} onChange={handleChange} placeholder="TP. Hồ Chí Minh, Việt Nam" />
                        <TextareaField label="Footer Copyright Text" name="footerText" value={settings.footerText} onChange={handleChange} rows={2} />
                        <SelectField
                            label="Kiểu Footer"
                            value={settings.footerStyle}
                            options={[
                                { value: "modern", label: "Modern (nhiều cột)" },
                                { value: "minimal", label: "Minimal (1 dòng)" },
                                { value: "full", label: "Full (logo + link + contact)" },
                                { value: "centered", label: "Centered (giữa trang)" },
                            ]}
                            onChange={(val) => handleChange("footerStyle", val)}
                        />
                    </div>
                )

            case "social":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="Mạng xã hội" desc="Thêm link mạng xã hội hiển thị trên website" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <InputField label="Facebook" name="facebookUrl" value={settings.facebookUrl} onChange={handleChange} placeholder="https://facebook.com/..." />
                            <InputField label="Twitter / X" name="twitterUrl" value={settings.twitterUrl} onChange={handleChange} placeholder="https://x.com/..." />
                            <InputField label="Instagram" name="instagramUrl" value={settings.instagramUrl} onChange={handleChange} placeholder="https://instagram.com/..." />
                            <InputField label="YouTube" name="youtubeUrl" value={settings.youtubeUrl} onChange={handleChange} placeholder="https://youtube.com/..." />
                            <InputField label="Telegram" name="telegramUrl" value={settings.telegramUrl} onChange={handleChange} placeholder="https://t.me/..." />
                            <InputField label="GitHub" name="githubUrl" value={settings.githubUrl} onChange={handleChange} placeholder="https://github.com/..." />
                            <InputField label="TikTok" name="tiktokUrl" value={settings.tiktokUrl} onChange={handleChange} placeholder="https://tiktok.com/@..." />
                        </div>
                    </div>
                )

            case "seo":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="SEO & Open Graph" desc="Tối ưu hóa cho công cụ tìm kiếm và chia sẻ mạng xã hội" />
                        <InputField label="Meta Title" desc="Tiêu đề hiển thị trên tab trình duyệt và kết quả Google" name="metaTitle" value={settings.metaTitle} onChange={handleChange} placeholder="QtusDev Market - Digital Products Marketplace" />
                        <TextareaField label="Meta Description" desc="Mô tả trang (khuyến nghị 150-160 ký tự)" name="metaDescription" value={settings.metaDescription} onChange={handleChange} rows={3} />
                        <InputField label="Meta Keywords" desc="Từ khóa (cách nhau bằng dấu phẩy)" name="metaKeywords" value={settings.metaKeywords} onChange={handleChange} placeholder="source code, marketplace, web templates" />
                        <InputField label="OG Image URL" desc="Hình ảnh khi share link lên mạng xã hội (1200x630px)" name="ogImage" value={settings.ogImage} onChange={handleChange} placeholder="https://example.com/og-image.jpg" />
                        {/* SEO preview */}
                        <div className="p-4 rounded-xl border border-gray-700 bg-gray-800/40 space-y-1">
                            <p className="text-xs text-gray-500 mb-2">Preview trên Google</p>
                            <p className="text-blue-400 text-base hover:underline cursor-pointer">{settings.metaTitle || "Tiêu đề trang"}</p>
                            <p className="text-green-400 text-xs">qtusdev.com</p>
                            <p className="text-gray-400 text-sm line-clamp-2">{settings.metaDescription || "Mô tả trang web..."}</p>
                        </div>
                    </div>
                )

            case "advanced":
                return (
                    <div className="space-y-6">
                        <SectionHeader title="Cài đặt nâng cao" desc="Custom CSS, HTML injection, Analytics, Maintenance mode" />
                        <ToggleField
                            label="Chế độ bảo trì (Maintenance Mode)"
                            desc="Bật để hiển thị trang bảo trì cho khách truy cập"
                            value={settings.maintenanceMode}
                            onChange={(val) => handleChange("maintenanceMode", val)}
                        />
                        {settings.maintenanceMode && (
                            <TextareaField label="Thông báo bảo trì" name="maintenanceMessage" value={settings.maintenanceMessage} onChange={handleChange} rows={2} />
                        )}
                        <InputField label="Google Analytics ID" desc="VD: G-XXXXXXXXXX hoặc UA-XXXXXXX-X" name="analyticsId" value={settings.analyticsId} onChange={handleChange} placeholder="G-XXXXXXXXXX" />
                        <TextareaField label="Custom CSS" desc="CSS tùy chỉnh sẽ inject vào thẻ <style> trên toàn site" name="customCss" value={settings.customCss} onChange={handleChange} rows={6} mono />
                        <TextareaField label="Custom Header HTML" desc="HTML inject vào cuối thẻ <head>" name="customHeaderHtml" value={settings.customHeaderHtml} onChange={handleChange} rows={4} mono />
                        <TextareaField label="Custom Footer HTML" desc="HTML inject trước thẻ </body>" name="customFooterHtml" value={settings.customFooterHtml} onChange={handleChange} rows={4} mono />
                    </div>
                )

            default:
                return null
        }
    }

    // ========================= RENDER =========================
    return (
        <div className="relative min-h-screen">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-in slide-in-from-top-2 ${toast.type === "success" ? "bg-emerald-600/90 text-white" : "bg-red-600/90 text-white"
                    }`}>
                    {toast.type === "success" ? icons.check : "⚠️"} {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        {icons.palette}
                        Tùy chỉnh giao diện
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">Chỉnh sửa toàn bộ giao diện website: màu sắc, font chữ, bố cục, SEO...</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={resetToDefault}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all flex items-center gap-1.5"
                    >
                        {icons.reset} Reset
                    </button>
                    <button
                        onClick={() => setShowPreview(!showPreview)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all flex items-center gap-1.5 ${showPreview
                                ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                                : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                            }`}
                    >
                        {icons.eye} {showPreview ? 'Ẩn Preview' : 'Xem trước'}
                    </button>
                    <button
                        onClick={loadSettings}
                        disabled={isSaving}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all flex items-center gap-1.5"
                    >
                        <span className={isSaving ? "animate-spin" : ""}>{icons.refresh}</span> Tải lại
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges}
                        className={`px-5 py-2 text-sm rounded-lg font-medium flex items-center gap-2 transition-all ${hasChanges
                            ? "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20"
                            : "bg-gray-800 text-gray-500 cursor-not-allowed"
                            }`}
                    >
                        {isSaving ? (
                            <span className="animate-spin">{icons.refresh}</span>
                        ) : (
                            icons.save
                        )}
                        {isSaving ? "Đang lưu..." : hasChanges ? "Lưu thay đổi" : "Đã lưu"}
                    </button>
                </div>
            </div>

            {/* Unsaved changes indicator */}
            {hasChanges && (
                <div className="mb-4 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                    Có thay đổi chưa được lưu
                </div>
            )}

            {/* Main layout */}
            <div className="flex gap-6">
                {/* Sidebar Tabs */}
                <div className="w-56 shrink-0">
                    <nav className="space-y-1 sticky top-4">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id
                                    ? "bg-purple-600/20 text-purple-400 border border-purple-500/30"
                                    : "text-gray-400 hover:text-white hover:bg-gray-800/60"
                                    }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                        {renderTabContent()}
                    </div>
                </div>
            </div>

            {/* ═══════════ LIVE WEBSITE PREVIEW ═══════════ */}
            {showPreview && (
                <div className="mt-6 border border-gray-700 rounded-2xl overflow-hidden bg-gray-900/80">
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700">
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                <div className="w-3 h-3 rounded-full bg-green-500" />
                            </div>
                            <span className="text-[11px] text-gray-500 ml-2">Live Preview — {settings.siteName}</span>
                        </div>
                        <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-white text-xs">✕ Đóng</button>
                    </div>

                    {/* Preview Content */}
                    <div style={{ backgroundColor: settings.backgroundColor, color: settings.textColor, fontFamily: settings.bodyFont, fontSize: `${settings.baseFontSize}px` }} className="min-h-[400px]">
                        {/* Navbar Preview */}
                        <nav style={{ backgroundColor: settings.surfaceColor, borderBottom: `1px solid ${settings.borderColor}` }} className="px-6 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${settings.primaryColor}, ${settings.secondaryColor})` }}>
                                    <span className="text-white text-xs font-bold">Q</span>
                                </div>
                                <span style={{ fontFamily: settings.headingFont, fontWeight: parseInt(settings.headingWeight), color: settings.textColor }} className="text-base">
                                    {settings.siteName}
                                </span>
                            </div>
                            <div className="flex gap-4" style={{ color: settings.mutedTextColor }}>
                                <span className="text-xs hover:opacity-80 cursor-default">Trang chủ</span>
                                <span className="text-xs hover:opacity-80 cursor-default">Sản phẩm</span>
                                <span className="text-xs hover:opacity-80 cursor-default">Danh mục</span>
                                <span className="text-xs hover:opacity-80 cursor-default">Hỗ trợ</span>
                            </div>
                        </nav>

                        {/* Hero Preview */}
                        <div className="px-8 py-12 text-center" style={{
                            background: settings.heroBgType === 'gradient'
                                ? `linear-gradient(135deg, ${settings.primaryColor}22, ${settings.secondaryColor}22, ${settings.accentColor}11)`
                                : settings.heroBgType === 'solid' ? settings.heroBgColor : undefined,
                        }}>
                            <h1 style={{ fontFamily: settings.headingFont, fontWeight: parseInt(settings.headingWeight), color: settings.textColor, fontSize: `${parseInt(settings.baseFontSize) + 12}px` }} className="mb-3">
                                {settings.heroTitle || 'Tiêu đề Hero'}
                            </h1>
                            <p style={{ color: settings.mutedTextColor }} className="mb-5 max-w-lg mx-auto text-sm">
                                {settings.heroSubtitle || 'Mô tả subtitle của hero section'}
                            </p>
                            <button className="px-5 py-2.5 rounded-lg text-white text-sm font-medium" style={{
                                background: `linear-gradient(135deg, ${settings.primaryColor}, ${settings.secondaryColor})`,
                                borderRadius: `${settings.borderRadius}px`,
                            }}>
                                {settings.heroButtonText || 'CTA Button'}
                            </button>
                        </div>

                        {/* Cards Preview */}
                        <div className="px-8 py-6">
                            <h3 style={{ fontFamily: settings.headingFont, fontWeight: parseInt(settings.headingWeight), color: settings.textColor }} className="text-sm mb-4">Sản phẩm nổi bật</h3>
                            <div className="grid grid-cols-3 gap-3">
                                {['Website Template', 'Dashboard UI', 'Mobile App'].map((title, i) => (
                                    <div key={i} style={{
                                        backgroundColor: settings.cardStyle === 'glass' ? `${settings.surfaceColor}CC` : settings.surfaceColor,
                                        border: `1px solid ${settings.borderColor}`,
                                        borderRadius: `${settings.borderRadius}px`,
                                        backdropFilter: settings.cardStyle === 'glass' ? 'blur(8px)' : 'none',
                                        boxShadow: settings.cardStyle === 'shadow' ? '0 4px 20px rgba(0,0,0,0.2)' : 'none',
                                    }} className="p-3">
                                        <div className="w-full h-16 rounded-md mb-2" style={{ background: `linear-gradient(135deg, ${settings.primaryColor}33, ${settings.accentColor}33)` }} />
                                        <p style={{ color: settings.textColor, fontFamily: settings.headingFont }} className="text-xs font-medium">{title}</p>
                                        <p style={{ color: settings.mutedTextColor }} className="text-[10px] mt-1">{[299000, 499000, 199000][i].toLocaleString('vi-VN')}đ</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer Preview */}
                        <div style={{ backgroundColor: settings.surfaceColor, borderTop: `1px solid ${settings.borderColor}` }} className="px-8 py-4 flex justify-between items-center">
                            <p style={{ color: settings.mutedTextColor }} className="text-[10px]">{settings.footerText}</p>
                            <div className="flex gap-3">
                                <span style={{ color: settings.mutedTextColor }} className="text-[10px]">{settings.contactEmail}</span>
                                <span style={{ color: settings.mutedTextColor }} className="text-[10px]">{settings.contactPhone}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
