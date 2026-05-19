export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="text-center space-y-3">
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#60FDFF]">Avenue Z</p>
        <h1 className="text-2xl font-bold text-white">Access Denied</h1>
        <p className="text-[#8A8A8A] text-sm">
          This tool is restricted to @avenuez.com accounts.
        </p>
        <a
          href="/login"
          className="inline-block mt-4 text-sm text-[#60FDFF] underline underline-offset-4"
        >
          Back to sign in
        </a>
      </div>
    </div>
  )
}
