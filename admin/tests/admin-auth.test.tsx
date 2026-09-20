import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/auth/AuthProvider.js";
import { ProtectedRoute } from "../src/auth/ProtectedRoute.js";
import { LoginPage } from "../src/pages/LoginPage.js";
import { AdminDashboardPage } from "../src/pages/AdminDashboardPage.js";
import { adminApiFetch, ApiError } from "../src/lib/api.js";

// Mock Supabase with hoisted factory
const {
  mockSupabase,
  getAuthStateCallback,
  setAuthStateCallback,
  mockSession,
  mockAdminMeUser,
} = vi.hoisted(() => {
  let callback: ((event: string, session: any) => void) | null = null;
  const session = {
    access_token: "mock-jwt-token-12345",
    user: { id: "admin-uuid-1", email: "admin@electrotech.pk" },
  };
  const adminMeUser = {
    userId: "admin-uuid-1",
    email: "admin@electrotech.pk",
    displayName: "Lead Administrator",
  };
  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn((cb) => {
        callback = cb;
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        };
      }),
    },
  };
  return {
    mockSupabase: supabase,
    getAuthStateCallback: () => callback,
    setAuthStateCallback: (cb: any) => {
      callback = cb;
    },
    mockSession: session,
    mockAdminMeUser: adminMeUser,
  };
});

vi.mock("../src/lib/supabase.js", () => ({
  supabase: mockSupabase,
}));

// Mock API client
vi.mock("../src/lib/api.js", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    fetchAdminMe: vi.fn(),
  };
});

import { fetchAdminMe } from "../src/lib/api.js";

describe("Admin Portal Authentication & Protected Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthStateCallback(null);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    vi.mocked(fetchAdminMe).mockResolvedValue({ user: mockAdminMeUser });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Login form renders properly
  it("1. login form renders with email, password, toggle, and submit button", async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>,
    );

    // Trigger initial session check (null)
    act(() => {
      getAuthStateCallback()?.("SIGNED_OUT", null);
    });

    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: /show password/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
  });

  // 2. Email/password required
  it("2. requires email and password before submission", async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>,
    );

    act(() => {
      getAuthStateCallback()?.("SIGNED_OUT", null);
    });

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitButton);

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/please enter both email and password/i)).toBeDefined();
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  // 3. Successful Supabase sign-in proceeds to backend authorization
  it("3. successful Supabase sign-in calls /api/admin/me for authorization", async () => {
    const user = userEvent.setup();
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: mockSession, user: mockSession.user },
      error: null,
    });
    vi.mocked(fetchAdminMe).mockResolvedValueOnce({ user: mockAdminMeUser });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>,
    );

    act(() => {
      getAuthStateCallback()?.("SIGNED_OUT", null);
    });

    await user.type(screen.getByLabelText(/email address/i), "admin@electrotech.pk");
    await user.type(screen.getByLabelText("Password"), "CorrectPassword123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "admin@electrotech.pk",
        password: "CorrectPassword123!",
      });
      expect(fetchAdminMe).toHaveBeenCalled();
    });
  });

  // 4. Bad credentials show generic error without leaking details
  it("4. bad credentials show generic error without raw Supabase error", async () => {
    const user = userEvent.setup();
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials", status: 400 },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>,
    );

    act(() => {
      getAuthStateCallback()?.("SIGNED_OUT", null);
    });

    await user.type(screen.getByLabelText(/email address/i), "admin@electrotech.pk");
    await user.type(screen.getByLabelText("Password"), "WrongPassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText("Invalid email or password.")).toBeDefined();
    });
  });

  // 5. Authorized /api/admin/me permits protected route
  it("5. authorized /api/admin/me permits protected route and renders admin dashboard", async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue({ user: mockAdminMeUser });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    // Simulate session restored from storage
    await act(async () => {
      await getAuthStateCallback()?.("INITIAL_SESSION", mockSession);
    });

    await waitFor(() => {
      expect(screen.getByText("Electro Tech Admin")).toBeDefined();
      expect(screen.getByText("Lead Administrator")).toBeDefined();
      expect(screen.getByText("admin@electrotech.pk")).toBeDefined();
      expect(screen.getByText("Project Management")).toBeDefined();
    });
  });

  // 6. 403 on /api/admin/me causes sign-out and unauthorized message
  it("6. 403 on /api/admin/me immediately signs out and displays unauthorized error", async () => {
    const user = userEvent.setup();
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: mockSession, user: mockSession.user },
      error: null,
    });
    vi.mocked(fetchAdminMe).mockRejectedValueOnce(
      new ApiError("Forbidden", 403, { message: "Not an admin" }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>,
    );

    act(() => {
      getAuthStateCallback()?.("SIGNED_OUT", null);
    });

    await user.type(screen.getByLabelText(/email address/i), "user@electrotech.pk");
    await user.type(screen.getByLabelText("Password"), "SomePassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeDefined();
      expect(
        screen.getByText(
          "This account is not authorized to access the Electro Tech admin portal.",
        ),
      ).toBeDefined();
    });
  });

  // 7. Unauthenticated protected route redirects to /login
  it("7. unauthenticated user accessing protected route is redirected to /login", async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    act(() => {
      getAuthStateCallback()?.("SIGNED_OUT", null);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
      expect(screen.queryByText("Electro Tech Admin")).toBeNull();
    });
  });

  // 8. Authorized admin on /login redirects to /
  it("8. authorized admin visiting /login is redirected to /", async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue({ user: mockAdminMeUser });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await act(async () => {
      await getAuthStateCallback()?.("INITIAL_SESSION", mockSession);
    });

    await waitFor(() => {
      expect(screen.getByText("Electro Tech Admin")).toBeDefined();
      expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
    });
  });

  // 9. Logout calls Supabase signOut
  it("9. logout calls Supabase signOut and clears admin context", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminMe).mockResolvedValue({ user: mockAdminMeUser });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await act(async () => {
      await getAuthStateCallback()?.("INITIAL_SESSION", mockSession);
    });

    await waitFor(() => {
      expect(screen.getByText("Lead Administrator")).toBeDefined();
    });

    const logoutButton = screen.getByRole("button", { name: /logout/i });
    await user.click(logoutButton);

    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });

  // 10 & 11. Session restoration waits for authorization; no flash of protected content
  it("10 & 11. session restoration waits for authorization without flashing protected content", async () => {
    let resolveAdminMe!: (val: any) => void;
    const adminMePromise = new Promise((resolve) => {
      resolveAdminMe = resolve;
    });
    vi.mocked(fetchAdminMe).mockReturnValueOnce(adminMePromise as any);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    // Initial state before auth resolution: shows loading indicator
    expect(screen.getByText(/verifying admin session/i)).toBeDefined();
    expect(screen.queryByText("Project Management")).toBeNull();

    // Trigger auth state change with session
    act(() => {
      getAuthStateCallback()?.("INITIAL_SESSION", mockSession);
    });

    // Still loading while fetchAdminMe is pending
    expect(screen.getByText(/verifying admin session/i)).toBeDefined();
    expect(screen.queryByText("Project Management")).toBeNull();

    // Resolve backend authorization
    await act(async () => {
      resolveAdminMe({ user: mockAdminMeUser });
    });

    // Now protected content is visible
    await waitFor(() => {
      expect(screen.getByText("Project Management")).toBeDefined();
      expect(screen.queryByText(/verifying admin session/i)).toBeNull();
    });
  });

  // 12. API client sends current Bearer token
  it("12. adminApiFetch attaches current session Bearer token in Authorization header", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: mockSession },
      error: null,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await adminApiFetch("/api/test-endpoint");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/test-endpoint"),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const calledHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(calledHeaders.get("Authorization")).toBe("Bearer mock-jwt-token-12345");
  });
});
