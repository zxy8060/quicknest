import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  launcher,
  moveItems,
  saveLauncher,
  setItemsFavorite,
} from "./launcher";
import { DEFAULT_STATE, plainClone, type LauncherState } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
  Object.assign(launcher, plainClone(DEFAULT_STATE));
  vi.stubGlobal("window", {
    clearTimeout: vi.fn(),
    setTimeout: vi.fn(() => 1),
  });
});

describe("launcher persistence queue", () => {
  it("serializes writes and persists the latest queued snapshot", async () => {
    const releases: Array<() => void> = [];
    let inFlight = 0;
    let maximumInFlight = 0;
    invokeMock.mockImplementation((command) => {
      expect(command).toBe("save_state");
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      return new Promise((resolve) => {
        releases.push(() => {
          inFlight -= 1;
          resolve(undefined);
        });
      });
    });

    launcher.settings.hotkey = "Shift+Q";
    const firstSave = saveLauncher();
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    launcher.settings.hotkey = "Alt+Q";
    const secondSave = saveLauncher();
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    releases.shift()?.();
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    const latest = (
      invokeMock.mock.calls[1][1] as { state: LauncherState }
    ).state;
    expect(latest.settings.hotkey).toBe("Alt+Q");

    releases.shift()?.();
    await Promise.all([firstSave, secondSave]);
    expect(maximumInFlight).toBe(1);
  });
});

describe("batch item operations", () => {
  it("moves selected items and updates favorites without touching targets", () => {
    const source = launcher.groups[0];
    const destination = launcher.groups[1];
    const item = source.items[1];
    const originalTarget = item.target;
    const selection = [{ groupId: source.id, itemId: item.id }];

    expect(moveItems(selection, destination.id)).toBe(1);
    expect(source.items.some((entry) => entry.id === item.id)).toBe(false);
    const moved = destination.items.find((entry) => entry.id === item.id);
    expect(moved?.target).toBe(originalTarget);

    expect(setItemsFavorite(
      [{ groupId: destination.id, itemId: item.id }],
      true,
    )).toBe(1);
    expect(moved?.favorite).toBe(true);
  });
});
