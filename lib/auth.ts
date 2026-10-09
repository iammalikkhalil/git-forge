import "server-only";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      authorization: { params: { scope: "read:user user:email repo" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "github")
        token.githubAccessToken = account.access_token;
      return token;
    },
    async session({ session }) {
      // Never forward the GitHub token into the browser-visible session.
      return {
        user: {
          name: session.user?.name,
          email: session.user?.email,
          image: session.user?.image,
        },
        expires: session.expires,
      };
    },
  },
};
