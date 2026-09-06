import type { LauncherGroup } from "./types";

export function resolveRootLandingView(
  rootId: string,
  groups: LauncherGroup[],
  lastViewByRoot: Record<string, string>,
) {
  const rememberedId = lastViewByRoot[rootId];
  const rememberedGroup = groups.find((group) => group.id === rememberedId);
  if (
    rememberedGroup
    && (rememberedGroup.id === rootId || rememberedGroup.parentId === rootId)
  ) {
    return rememberedGroup.id;
  }

  return groups.find((group) => group.parentId === rootId)?.id ?? rootId;
}
