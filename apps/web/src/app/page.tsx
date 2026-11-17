import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-bold tracking-tight">Dynamic Survey Builder</h1>
      <p className="text-lg text-neutral-600">
        Build surveys with conditional logic, share a public link, and see
        analytics as responses come in.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
        >
          Admin login
        </Link>
      </div>
    </main>
  );
}
