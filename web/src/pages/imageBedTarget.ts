export interface ImageBedTargetLike {
  source_id: string
}

export function resolveImageBedTarget(
  selectedSourceId: string,
  defaultSourceId: string,
  targets: ImageBedTargetLike[],
): string {
  const availableIds = new Set(targets.map((target) => target.source_id))
  if (selectedSourceId && availableIds.has(selectedSourceId)) return selectedSourceId
  if (defaultSourceId && availableIds.has(defaultSourceId)) return defaultSourceId
  return targets[0]?.source_id || ''
}
