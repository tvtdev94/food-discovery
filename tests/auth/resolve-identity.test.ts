import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Create mock Supabase server client with auth.getUser()
 */
function createMockSupabaseServerClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  };
}

/**
 * Create mock Request with optional x-device-id header
 */
function createMockRequest(deviceId?: string): Request {
  const headers = new Headers();
  if (deviceId) {
    headers.set("x-device-id", deviceId);
  }
  return new Request("http://localhost", { headers });
}

describe("resolveIdentity — auth.uid / device_id resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticated: auth.uid present → returns userId, ownerKey = userId", async () => {
    const mockClient = createMockSupabaseServerClient({ id: "user-123" });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any);

    const req = createMockRequest();
    const identity = await resolveIdentity(req as any);

    // userId set, ownerKey = userId
    expect(identity.userId).toBe("user-123");
    expect(identity.ownerKey).toBe("user-123");
    expect(identity.deviceId).toBeNull();
  });

  it("guest: only x-device-id header → returns deviceId, userId null", async () => {
    const mockClient = createMockSupabaseServerClient(null);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any);

    const req = createMockRequest("device-abc-def");
    const identity = await resolveIdentity(req);

    // deviceId set, userId null
    expect(identity.userId).toBeNull();
    expect(identity.deviceId).toBe("device-abc-def");
    expect(identity.ownerKey).toBe("device-abc-def");
  });

  it("both present: auth.uid AND x-device-id → prefers userId (auth wins)", async () => {
    const mockClient = createMockSupabaseServerClient({ id: "user-wins" });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any);

    const req = createMockRequest("device-ignored");
    const identity = await resolveIdentity(req);

    // Both present but userId wins
    expect(identity.userId).toBe("user-wins");
    expect(identity.deviceId).toBe("device-ignored");
    expect(identity.ownerKey).toBe("user-wins");
  });

  it("neither present: throws Identity required error", async () => {
    const mockClient = createMockSupabaseServerClient(null);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any);

    const req = createMockRequest(); // No device ID header
    const identity = resolveIdentity(req as any);

    // Should throw
    await expect(identity).rejects.toThrow("Identity required");
  });

  it("device-id header with whitespace: trims before returning", async () => {
    const mockClient = createMockSupabaseServerClient(null);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any);

    const req = new Request("http://localhost", {
      headers: { "x-device-id": "  device-with-spaces  " },
    });

    const identity = await resolveIdentity(req as any);

    // Whitespace trimmed
    expect(identity.deviceId).toBe("device-with-spaces");
    expect(identity.ownerKey).toBe("device-with-spaces");
  });

  it("empty device-id header: falls back to userId if present, else throws", async () => {
    const mockClient = createMockSupabaseServerClient(null);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any);

    // Empty header after trim
    const req = new Request("http://localhost", {
      headers: { "x-device-id": "   " },
    });

    const identity = resolveIdentity(req as any);

    // Empty header treated as absent → should throw
    await expect(identity).rejects.toThrow("Identity required");
  });
});
