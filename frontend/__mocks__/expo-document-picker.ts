type DocumentPickerResult = {
  canceled: boolean;
  assets?: { uri: string; name?: string; size?: number }[];
};

let mockResult: DocumentPickerResult = { canceled: true };

export async function getDocumentAsync(
  _options?: { type?: string; copyToCacheDirectory?: boolean }
): Promise<DocumentPickerResult> {
  return mockResult;
}

export function __setMockResult(result: DocumentPickerResult) {
  mockResult = result;
}

export function __resetPickerState() {
  mockResult = { canceled: true };
}
