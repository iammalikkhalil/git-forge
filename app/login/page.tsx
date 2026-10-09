import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { authOptions } from "@/lib/auth";
import { AuthButton } from "@/app/components/auth-button";
async function LoginContent({ searchParams }: PageProps<"/login">) {
  // NextAuth may generate crypto randomness before reading request cookies.
  await connection();
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-zinc-500">GIT FORGE</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome to Git Forge
      </h1>
      <p className="mt-3 mb-8 text-zinc-600">
        Sign in with your GitHub account to open your dashboard.
      </p>
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          GitHub sign-in could not be completed. Please try again.
        </p>
      )}
      <AuthButton />
    </section>
  );
}
export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-zinc-900">
      <Suspense fallback={<p role="status">Checking your session…</p>}>
        <LoginContent {...props} />
      </Suspense>
    </main>
  );
}
