import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"
import FacebookProvider from "next-auth/providers/facebook"
import { logger } from "@/lib/logger"
import dns from "node:dns"

// ✅ FIX: Force IPv4 resolution to prevent NextAuth Google OAuth timeout (3500ms)
dns.setDefaultResultOrder("ipv4first");

export const runtime = 'nodejs'

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? [GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET || "",
      httpOptions: { timeout: 10000 },
    })] : []),
    ...(process.env.GITHUB_CLIENT_ID || process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ? [GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || process.env.NEXT_PUBLIC_GITHUB_CLIENT_SECRET || "",
      httpOptions: { timeout: 10000 },
    })] : []),
    ...(process.env.FACEBOOK_CLIENT_ID || process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID || process.env.FACEBOOK_APP_ID ? [FacebookProvider({
      // ✅ FIX: In .env, FACEBOOK_APP_ID is mistakenly used as the secret, and CLIENT_ID is used as the client ID.
      clientId: process.env.FACEBOOK_CLIENT_ID || process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID || "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || process.env.FACEBOOK_APP_ID || "",
      httpOptions: { timeout: 10000 },
    })] : []),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Allow sign in
      return true;
    },
    async jwt({ token, user, account, profile }) {
      // Initial sign in
      if (account && user) {
        token.id = user.id || (user as any).uid || account.providerAccountId;
        token.provider = account.provider;
        token.role = (user as any).role || "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).provider = token.provider as string;
        (session.user as any).role = token.role as string;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      // Log sign in events if needed
      if (isNewUser) {
        logger.info("New user signed in", { email: user.email });
      }
    },
  },
  debug: process.env.NODE_ENV === "development",
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
