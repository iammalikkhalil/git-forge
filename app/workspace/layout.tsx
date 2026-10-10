import { Suspense, type ReactNode } from "react";
import { getServerSession } from "next-auth";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { WorkspaceShell } from "./workspace-shell";
import "./workspace.css";

async function ConnectedWorkspace({ children }: { children: ReactNode }) {
  await connection();
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  return (
    <WorkspaceShell
      name={session.user.name || "GitHub user"}
      image={session.user.image}
    >
      {children}
    </WorkspaceShell>
  );
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="workspace workspace-loading" role="status">
          Loading your workspace…
        </div>
      }
    >
      <ConnectedWorkspace>{children}</ConnectedWorkspace>
    </Suspense>
  );
}
