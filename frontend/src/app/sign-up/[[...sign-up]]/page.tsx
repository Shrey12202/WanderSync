import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
      <div className="flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-teal-500 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20">
            🌍
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)] m-0 leading-tight">WanderSync</h1>
            <p className="text-xs text-[var(--color-text-secondary)] m-0">Start your travel journal</p>
          </div>
        </div>
        <SignUp
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl rounded-2xl",
              headerTitle: "text-[var(--color-text)]",
              headerSubtitle: "text-[var(--color-text-secondary)]",
              formButtonPrimary: "bg-amber-500 hover:bg-amber-400 text-[#0a0e1a] font-bold",
            }
          }}
        />
      </div>
    </div>
  );
}
