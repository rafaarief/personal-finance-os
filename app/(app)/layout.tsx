import { getCurrentSession } from "@/lib/auth/currentUser";
import { NavBar } from "@/components/NavBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();

  return (
    <div className="min-h-screen">
      <NavBar role={session?.role ?? "OWNER"} />
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
