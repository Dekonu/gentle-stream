import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSessionUserIdMock = vi.fn();
const getOrCreateUserProfileMock = vi.fn();
const updateUserDisplayMock = vi.fn();

vi.mock("@/lib/api/sessionUser", () => ({
  getSessionUserId: getSessionUserIdMock,
}));

vi.mock("@/lib/db/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/users")>("@/lib/db/users");
  return {
    ...actual,
    getOrCreateUserProfile: getOrCreateUserProfileMock,
    updateUserDisplay: updateUserDisplayMock,
  };
});

describe("/api/user/profile PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUserIdMock.mockResolvedValueOnce(null);
    const { PATCH } = await import("@/app/api/user/profile/route");
    const request = new NextRequest("http://localhost/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Ada" }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when no fields are provided", async () => {
    getSessionUserIdMock.mockResolvedValueOnce("u1");
    getOrCreateUserProfileMock.mockResolvedValueOnce({ id: "u1" });

    const { PATCH } = await import("@/app/api/user/profile/route");
    const request = new NextRequest("http://localhost/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "ERR_MISSING_FIELD",
    });
  });

  it("updates username/avatar/displayName successfully", async () => {
    getSessionUserIdMock.mockResolvedValueOnce("u1");
    getOrCreateUserProfileMock.mockResolvedValueOnce({ id: "u1" });
    updateUserDisplayMock.mockResolvedValueOnce({
      userId: "u1",
      display_name: "Ada Lovelace",
      username: "ada_l",
      avatar_url: "https://example.com/avatar.png",
    });

    const { PATCH } = await import("@/app/api/user/profile/route");
    const request = new NextRequest("http://localhost/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: "Ada Lovelace",
        username: "Ada_L",
        avatarUrl: "https://example.com/avatar.png",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateUserDisplayMock).toHaveBeenCalledWith("u1", {
      displayName: "Ada Lovelace",
      username: "ada_l",
      avatarUrl: "https://example.com/avatar.png",
    });
  });
});
