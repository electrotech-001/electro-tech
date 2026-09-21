import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  supabase,
  getSupabaseAuthStorageKey,
  cleanLegacyLocalStorageAuth,
} from "@/lib/admin/supabase";

describe("Admin Supabase Auth Persistence & Storage Configuration", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("1. configures Supabase auth with sessionStorage in browser environment", () => {
    // Supabase auth client should use sessionStorage (not localStorage)
    const clientStorage = (supabase.auth as any).storage;
    expect(clientStorage).toBeDefined();

    // Verify storage points to sessionStorage
    clientStorage.setItem("test-session-key", "test-value");
    expect(sessionStorage.getItem("test-session-key")).toBe("test-value");
    expect(localStorage.getItem("test-session-key")).toBeNull();

    clientStorage.removeItem("test-session-key");
    expect(sessionStorage.getItem("test-session-key")).toBeNull();
  });

  it("2. preserves persistSession, autoRefreshToken, and detectSessionInUrl settings", () => {
    // The auth client settings
    expect((supabase.auth as any).persistSession).toBe(true);
    expect((supabase.auth as any).autoRefreshToken).toBe(true);
    expect((supabase.auth as any).detectSessionInUrl).toBe(true);
  });

  it("3. getSupabaseAuthStorageKey returns project-specific storage key", () => {
    const key = getSupabaseAuthStorageKey();
    expect(key).toBeDefined();
    expect(key.startsWith("sb-")).toBe(true);
    expect(key.endsWith("-auth-token")).toBe(true);
    expect(key).toBe("sb-pugoystdafgmmvnwyslo-auth-token");
  });

  it("4. cleanLegacyLocalStorageAuth removes legacy Supabase auth tokens and verifiers", () => {
    const storageKey = getSupabaseAuthStorageKey();

    // Populate legacy tokens in localStorage
    localStorage.setItem(storageKey, JSON.stringify({ access_token: "legacy-token" }));
    localStorage.setItem(`${storageKey}-code-verifier`, "legacy-verifier");
    localStorage.setItem(`${storageKey}-user`, JSON.stringify({ id: "legacy-user" }));

    cleanLegacyLocalStorageAuth();

    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(localStorage.getItem(`${storageKey}-code-verifier`)).toBeNull();
    expect(localStorage.getItem(`${storageKey}-user`)).toBeNull();
  });

  it("5. cleanLegacyLocalStorageAuth strictly preserves unrelated localStorage entries", () => {
    const storageKey = getSupabaseAuthStorageKey();

    // Add legacy auth token as well as unrelated user data
    localStorage.setItem(storageKey, JSON.stringify({ access_token: "legacy-token" }));
    localStorage.setItem("theme_preference", "dark");
    localStorage.setItem("cookie_consent_accepted", "true");
    localStorage.setItem("custom_analytics_session", "session-xyz-987");

    const clearSpy = vi.spyOn(Storage.prototype, "clear");

    cleanLegacyLocalStorageAuth();

    // localStorage.clear() must NEVER be invoked
    expect(clearSpy).not.toHaveBeenCalled();

    // Only auth tokens removed
    expect(localStorage.getItem(storageKey)).toBeNull();

    // Unrelated items MUST be completely intact
    expect(localStorage.getItem("theme_preference")).toBe("dark");
    expect(localStorage.getItem("cookie_consent_accepted")).toBe("true");
    expect(localStorage.getItem("custom_analytics_session")).toBe("session-xyz-987");
  });

  it("6. cleanLegacyLocalStorageAuth handles missing or restricted storage gracefully", () => {
    const removeItemSpy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementationOnce(() => {
        throw new Error("SecurityError: Access denied");
      });

    expect(() => cleanLegacyLocalStorageAuth()).not.toThrow();
    removeItemSpy.mockRestore();
  });
});
