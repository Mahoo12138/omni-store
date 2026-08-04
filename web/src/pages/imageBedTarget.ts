export interface ImageBedTargetLike {
  key: string
}

export function resolveImageBedTarget(
  selectedKey: string,
  defaultKey: string,
  targets: ImageBedTargetLike[],
): string {
  const availableKeys = new Set(targets.map((target) => target.key))
  if (selectedKey && availableKeys.has(selectedKey)) return selectedKey
  if (defaultKey && availableKeys.has(defaultKey)) return defaultKey
  return targets[0]?.key || ''
}
