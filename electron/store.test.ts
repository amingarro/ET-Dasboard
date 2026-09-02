import { describe, expect, it } from "vitest";
import { migrateLayout, type LegacyLayoutState } from "./store";
import type { ServiceConfig } from "./store";

function service(id: string, order: number, enabled = true): ServiceConfig {
  return { id, enabled, order, notificationsEnabled: true, lastUrl: null };
}

describe("migrateLayout", () => {
  it("builds one solo group per enabled service, ordered by `order`, when layout is undefined", () => {
    const services = [service("gmail", 1), service("github", 0), service("bitbucket", 2, false)];

    const result = migrateLayout(services, undefined);

    expect(result).toEqual({
      groups: [
        { id: "github", serviceIds: ["github"], splitDirection: "horizontal", splitSizes: {} },
        { id: "gmail", serviceIds: ["gmail"], splitDirection: "horizontal", splitSizes: {} },
      ],
      activeGroupId: "github",
    });
  });

  it("returns null activeGroupId with an empty groups list when there are no enabled services", () => {
    const services = [service("gmail", 0, false)];

    const result = migrateLayout(services, undefined);

    expect(result).toEqual({ groups: [], activeGroupId: null });
  });

  it("passes through an already-groups-based layout unchanged when fields are all present", () => {
    const services = [service("gmail", 0), service("github", 1)];
    const layout: LegacyLayoutState = {
      groups: [
        { id: "gmail", serviceIds: ["gmail"], splitDirection: "vertical", splitSizes: { gmail: 100 } },
      ],
      activeGroupId: "gmail",
    };

    const result = migrateLayout(services, layout);

    expect(result).toEqual({
      groups: [{ id: "gmail", serviceIds: ["gmail"], splitDirection: "vertical", splitSizes: { gmail: 100 } }],
      activeGroupId: "gmail",
    });
  });

  it("backfills missing splitDirection/splitSizes on groups from an older groups-based layout", () => {
    const services = [service("gmail", 0), service("github", 1)];
    const layout = {
      groups: [
        { id: "merged", serviceIds: ["gmail", "github"] },
      ],
      activeGroupId: "merged",
    } as unknown as LegacyLayoutState;

    const result = migrateLayout(services, layout);

    expect(result).toEqual({
      groups: [{ id: "merged", serviceIds: ["gmail", "github"], splitDirection: "horizontal", splitSizes: {} }],
      activeGroupId: "merged",
    });
  });

  it("falls back to the first group's id when activeGroupId is missing on a groups-based layout", () => {
    const services = [service("gmail", 0)];
    const layout: LegacyLayoutState = {
      groups: [{ id: "gmail", serviceIds: ["gmail"], splitDirection: "horizontal", splitSizes: {} }],
    };

    const result = migrateLayout(services, layout);

    expect(result.activeGroupId).toBe("gmail");
  });

  it("converts a legacy split group (>=2 splitServiceIds) into a 'merged' ViewGroup, others solo", () => {
    const services = [service("gmail", 0), service("github", 1), service("bitbucket", 2), service("trello", 3)];
    const layout: LegacyLayoutState = {
      mode: "split",
      activeServiceId: null,
      splitServiceIds: ["github", "bitbucket"],
      splitDirection: "vertical",
      splitSizes: { github: 40, bitbucket: 60 },
    };

    const result = migrateLayout(services, layout);

    expect(result).toEqual({
      groups: [
        { id: "merged", serviceIds: ["github", "bitbucket"], splitDirection: "vertical", splitSizes: { github: 40, bitbucket: 60 } },
        { id: "gmail", serviceIds: ["gmail"], splitDirection: "horizontal", splitSizes: {} },
        { id: "trello", serviceIds: ["trello"], splitDirection: "horizontal", splitSizes: {} },
      ],
      activeGroupId: "merged",
    });
  });

  it("does not create a merged group when legacy splitServiceIds has fewer than 2 entries (and still excludes that lone id from a solo group, per the current `continue` logic)", () => {
    const services = [service("gmail", 0), service("github", 1)];
    const layout: LegacyLayoutState = {
      mode: "fullscreen",
      activeServiceId: "gmail",
      splitServiceIds: ["github"],
    };

    const result = migrateLayout(services, layout);

    expect(result).toEqual({
      groups: [{ id: "gmail", serviceIds: ["gmail"], splitDirection: "horizontal", splitSizes: {} }],
      activeGroupId: "gmail",
    });
  });

  it("uses legacy activeServiceId as activeGroupId when mode is fullscreen", () => {
    const services = [service("gmail", 0), service("github", 1)];
    const layout: LegacyLayoutState = {
      mode: "fullscreen",
      activeServiceId: "github",
      splitServiceIds: [],
    };

    const result = migrateLayout(services, layout);

    expect(result.activeGroupId).toBe("github");
  });
});
