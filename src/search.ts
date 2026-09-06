import type { LauncherGroup, LauncherItem } from "./types";

export type LauncherEntry = {
  item: LauncherItem;
  group: LauncherGroup;
};

export function searchAllSoftware(
  groups: LauncherGroup[],
  registryGroup: LauncherGroup,
  query: string,
): LauncherEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];

  return [
    ...groups.flatMap((group) =>
      group.items.map((item) => ({ item, group })),
    ),
    ...registryGroup.items.map((item) => ({ item, group: registryGroup })),
  ].filter(({ item }) =>
    [item.title, item.target, item.notes]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}
