let sharingAvailable = true;

export async function isAvailableAsync(): Promise<boolean> {
  return sharingAvailable;
}

export async function shareAsync(
  _url: string,
  _options?: { mimeType?: string; dialogTitle?: string; UTI?: string }
): Promise<void> {
}

export function __setSharingAvailable(available: boolean) {
  sharingAvailable = available;
}
