import { Suspense } from "react";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { authOptions } from "@/lib/auth";
import { AuthButton } from "@/app/components/auth-button";
import { ProjectForm } from "@/app/components/project-form";
import { activityDefaults } from "@/lib/project-schema";
async function DashboardContent() {
  // Session validation must run for the incoming request, never prerendering.
  await connection();
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const name = session.user.name || "GitHub user";
  return (
    <section className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="mb-6 text-sm font-semibold text-zinc-500">
        GIT FORGE / DASHBOARD
      </p>
      <div className="flex items-center gap-4">
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt={`${name}'s avatar`}
            width={80}
            height={80}
            className="rounded-full"
          />
        ) : (
          <span
            aria-label="Profile avatar"
            className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 text-2xl font-semibold"
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {name}
          </h1>
          <p className="mt-1 text-zinc-600">You’re signed in with GitHub.</p>
        </div>
      </div>
      <div className="mt-8">
        <AuthButton logout />
      </div>
      <ProjectForm
        timeZones={Intl.supportedValuesOf("timeZone")}
        defaults={activityDefaults()}
        name={session.user.name ?? ""}
        email={session.user.email ?? ""}
      />
    </section>
  );
}
export default function DashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-zinc-900">
      <Suspense fallback={<p role="status">Loading your dashboard…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
