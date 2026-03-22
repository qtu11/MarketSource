import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import dynamic from "next/dynamic"

const ThemeAwareBackground = dynamic(
  async () => {
    const mod = await import("@/components/theme-aware-background")
    return { default: mod.ThemeAwareBackground }
  },
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-blue-50 dark:bg-[#0B0C10]" />
  }
)

export default function CookiesPage() {
  return (
    <div className="bg-transparent min-h-screen relative overflow-x-hidden pt-20 transition-colors duration-300">
      <ThemeAwareBackground />
      <FloatingHeader />

      <main className="container mx-auto px-4 py-24 relative z-10 min-h-[60vh]">
        <div className="max-w-3xl mx-auto bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-2xl rounded-3xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Chính sách <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Cookie</span>
          </h1>
          <div className="space-y-4 text-gray-600 dark:text-gray-400 leading-relaxed">
            <p>Trang chính sách Cookie đang được cập nhật.</p>
            <p>Tuy nhiên, xin lưu ý rằng QtusDev Market có sử dụng cookie và các công nghệ theo dõi tương tự để:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Duy trì trạng thái đăng nhập của bạn (xác thực người dùng).</li>
              <li>Ghi nhớ các tùy chọn sử dụng (giao diện sáng/tối).</li>
              <li>Hỗ trợ phòng chống gian lận và các cuộc tấn công CSRF.</li>
              <li>Phân tích lưu lượng truy cập để cải thiện trải nghiệm người dùng.</li>
            </ul>
            <p className="pt-4 border-t border-gray-200 dark:border-gray-800">
              Bằng cách tiếp tục sử dụng trang web, bạn đồng ý với việc sử dụng cookie của chúng tôi. Nếu có bất kỳ thắc mắc nào, vui lòng chuyển tới mục Hỗ Trợ.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
