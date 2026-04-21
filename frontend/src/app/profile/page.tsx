"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useState } from "react";

export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwStatus, setPwStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="glass rounded-2xl p-8 animate-pulse">Loading profile...</div>
      </div>
    );
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwStatus({ type: "error", msg: "New passwords do not match." });
      return;
    }
    if (newPw.length < 8) {
      setPwStatus({ type: "error", msg: "Password must be at least 8 characters." });
      return;
    }
    setSaving(true);
    setPwStatus(null);
    try {
      await user?.updatePassword({ currentPassword: currentPw, newPassword: newPw });
      setPwStatus({ type: "success", msg: "Password updated successfully!" });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setChangingPassword(false);
    } catch (err: any) {
      setPwStatus({ type: "error", msg: err?.errors?.[0]?.message || "Failed to update password." });
    } finally {
      setSaving(false);
    }
  };

  const fullName = user?.fullName || "—";
  const email = user?.primaryEmailAddress?.emailAddress || "—";
  const username = user?.username || user?.firstName || "Traveller";
  const createdAt = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text)] m-0">Profile</h1>
        <p className="text-[var(--color-text-secondary)] mt-2 text-sm">Manage your account settings</p>
      </div>

      {/* Avatar + Name */}
      <div className="glass border border-[var(--color-border)] rounded-3xl p-6 mb-6 flex items-center gap-6">
        <div className="relative">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="Profile" className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-500/40" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-teal-500 flex items-center justify-center text-3xl font-bold text-[#0a0e1a]">
              {username[0]?.toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-teal-500 rounded-full border-2 border-[var(--color-bg)]" title="Active" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)] m-0">{fullName}</h2>
          <p className="text-[var(--color-text-secondary)] text-sm m-0 mt-1">Member since {createdAt}</p>
        </div>
      </div>

      {/* Account Info */}
      <div className="glass border border-[var(--color-border)] rounded-3xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-widest m-0 mb-4">Account Details</h3>
        <div className="flex flex-col gap-4">
          {[
            { label: "Full Name", value: fullName, icon: "👤" },
            { label: "Username", value: username, icon: "🏷️" },
            { label: "Email", value: email, icon: "📧" },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-4 py-3 border-b border-[var(--color-border)] last:border-0">
              <span className="text-lg w-8 text-center">{icon}</span>
              <div className="flex-1">
                <p className="text-xs text-[var(--color-text-secondary)] m-0 mb-1">{label}</p>
                <p className="text-sm font-medium text-[var(--color-text)] m-0">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Password */}
      <div className="glass border border-[var(--color-border)] rounded-3xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-widest m-0">Security</h3>
          {!changingPassword && (
            <button
              onClick={() => { setChangingPassword(true); setPwStatus(null); }}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-all"
            >
              Change Password
            </button>
          )}
        </div>

        {!changingPassword && (
          <div className="flex items-center gap-4 py-3">
            <span className="text-lg w-8 text-center">🔒</span>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)] m-0 mb-1">Password</p>
              <p className="text-sm font-medium text-[var(--color-text)] m-0">••••••••</p>
            </div>
          </div>
        )}

        {changingPassword && (
          <form onSubmit={handlePasswordChange} className="flex flex-col gap-3">
            {pwStatus && (
              <div className={`p-3 rounded-xl text-sm border ${pwStatus.type === "success" ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                {pwStatus.msg}
              </div>
            )}
            {[
              { id: "currentPw", label: "Current Password", value: currentPw, setter: setCurrentPw },
              { id: "newPw", label: "New Password", value: newPw, setter: setNewPw },
              { id: "confirmPw", label: "Confirm New Password", value: confirmPw, setter: setConfirmPw },
            ].map(({ id, label, value, setter }) => (
              <div key={id}>
                <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">{label}</label>
                <input
                  id={id}
                  type="password"
                  value={value}
                  onChange={e => setter(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50"
                />
              </div>
            ))}
            <div className="flex gap-3 mt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-[#0a0e1a] font-bold text-sm hover:bg-amber-400 transition-all disabled:opacity-50"
              >
                {saving ? "Saving..." : "Update Password"}
              </button>
              <button
                type="button"
                onClick={() => { setChangingPassword(false); setPwStatus(null); }}
                className="px-4 py-2.5 rounded-xl bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] text-sm hover:bg-[var(--color-surface-hover)] transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Sign Out */}
      <button
        onClick={() => signOut({ redirectUrl: "/sign-in" })}
        className="w-full py-3 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 font-semibold text-sm hover:bg-red-500/20 transition-all"
      >
        Sign Out
      </button>
    </div>
  );
}
