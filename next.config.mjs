import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const isDockerBuild = process.env.DOCKER_BUILD === 'true';
const isCloudflarePages =
  process.env.CF_PAGES === '1' ||
  process.env.CLOUDFLARE_PAGES === '1' ||
  Boolean(process.env.CF_PAGES_BRANCH);
const isVercel = process.env.VERCEL === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Skip lint trong build để tránh lỗi vòng lặp plugin; có thể bật lại bằng NEXT_FORCE_ESLINT=true
    ignoreDuringBuilds:
      process.env.NEXT_FORCE_ESLINT === 'true'
        ? false
        : true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude server-side modules from client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
      
      // ✅ FIX: Next.js đã tự xử lý React và jsx-runtime
      // Không cần alias React vì có thể gây xung đột với jsx-runtime
      // Chỉ giữ lại fallback cho server-side modules
    }
    
    // Cho phép optional dependencies như firebase-admin được resolve ở runtime
    // Không bundle chúng vào webpack, sẽ load bằng require() khi cần
    if (isServer) {
      const originalExternals = config.externals || [];
      const isFunction = typeof originalExternals === 'function';
      const externalsArray = Array.isArray(originalExternals) ? originalExternals : [];
      
      config.externals = [
        ...externalsArray,
        ({ context, request }, callback) => {
          // firebase-admin là optional dependency, không bắt buộc
          if (request === 'firebase-admin') {
            return callback(null, `commonjs ${request}`);
          }
          // Call original externals function nếu có
          if (isFunction) {
            return originalExternals({ context, request }, callback);
          }
          callback();
        },
      ];
    }
    
    return config;
  },
  images: {
    remotePatterns: [
      // ✅ SECURITY FIX: Whitelist cụ thể thay vì wildcard (chống SSRF)
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.firebasestorage.app',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.vercel.app',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'files.catbox.moe',
      },
    ],
    // ✅ FIX: Tắt Image Optimization — nhiều CDN (catbox.moe, etc.) block server-side fetch
    // gây lỗi "Input Buffer is empty" → crash 500. Browser sẽ load ảnh trực tiếp từ URL gốc.
    unoptimized: true,
  },
  // ✅ FIX: Next.js tự động expose NEXT_PUBLIC_* variables
  // env: {},
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/icons/{{member}}',
    },
    'date-fns': {
      transform: 'date-fns/{{member}}',
    },
  },
  // ✅ SECURITY: Thêm security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  // ✅ FIX: Redirects để xử lý các requests không tồn tại
  async rewrites() {
    return [
      {
        source: '/icon-192.png',
        destination: '/logoqtusdev.png',
      },
    ]
  },
  // Skip static generation for admin routes
  generateBuildId: async () => {
    if (isCloudflarePages) {
      return process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) || 'cf-build';
    }
    return 'build-' + Date.now();
  },
  // Disable static optimization for all pages (use dynamic rendering)
  // ✅ FIX: Conditional output - standalone cho Docker, undefined cho Netlify
  // Netlify plugin tự động xử lý Next.js output, không cần standalone
  output: isDockerBuild && !isCloudflarePages ? 'standalone' : undefined,
}

export default nextConfig;