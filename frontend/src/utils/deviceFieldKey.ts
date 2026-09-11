export function deviceFieldKey(deviceType: string): string {
  return deviceType.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function deviceCountFieldKey(deviceType: string): string {
  return `${deviceFieldKey(deviceType)}_count`;
}

export function isCountField(fieldKey: string): boolean {
  return /^.+_count$/.test(fieldKey);
}

export function isCountFieldForDeviceType(fieldKey: string, deviceType: string | undefined): boolean {
  if (deviceType === undefined) return false;
  return fieldKey === deviceCountFieldKey(deviceType);
}

export function resolveFieldRequired(
  fieldKey: string,
  deviceType: string | undefined,
  requiredDeviceTypes: ReadonlySet<string>,
  fieldIsRequired: boolean
): boolean {
  if (isCountFieldForDeviceType(fieldKey, deviceType)) {
    return deviceType !== undefined && requiredDeviceTypes.has(deviceType);
  }
  return fieldIsRequired;
}

export function isCountEmpty(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  const str = String(raw).trim();
  if (str === "") return true;
  return Number.isNaN(Number(str));
}
