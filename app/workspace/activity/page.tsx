import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { connection } from "next/server";
import { authOptions } from "@/lib/auth";
import { ActivityEditor } from "../activity-editor";

async function ConnectedActivity() {
  await connection();
  const session = await getServerSession(authOptions);
  return (
    <ActivityEditor
      name={session?.user?.name ?? ""}
      email={session?.user?.email ?? ""}
      timeZones={Intl.supportedValuesOf("timeZone")}
    />
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<p role="status">Loading activity settings…</p>}>
      <ConnectedActivity />
    </Suspense>
  );
}
