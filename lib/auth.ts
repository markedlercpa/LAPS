import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

// Delegated Graph scopes needed to send mail, read replies, and read calendars
// as the signed-in rep.
const GRAPH_SCOPES =
  "openid profile email offline_access User.Read Mail.Send Mail.Read Calendars.Read";

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
  providers.push(
    MicrosoftEntraID({
      authorization: { params: { scope: GRAPH_SCOPES } },
      // Single-tenant internal app: link a Microsoft login to an existing user
      // with the same (Microsoft-verified) email, so reps keep their records.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

// Local development fallback: password-less sign-in as any seeded user.
// Never enable in production.
if (process.env.ALLOW_DEV_LOGIN === "true") {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev Login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        if (!email) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  );
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  // Required when self-hosting behind a proxy (non-Vercel deploys).
  trustHost: true,
  // Env-gated: set AUTH_DEBUG=true in the host to surface the exact cause of
  // OAuth callback failures (the reason is only logged at debug level). Leave
  // unset in normal production operation.
  debug: process.env.AUTH_DEBUG === "true",
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        // role is present on the credentials user; look it up for OAuth users
        token.role = (user as { role?: string }).role;
      }
      if (token.uid && !token.role) {
        const db = await prisma.user.findUnique({
          where: { id: String(token.uid) },
          select: { role: true },
        });
        token.role = db?.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? "");
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
