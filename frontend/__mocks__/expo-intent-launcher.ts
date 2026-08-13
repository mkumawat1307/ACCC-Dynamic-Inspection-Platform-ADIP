let startActivityFailure: Error | null = null;

export const ActivityAction = {};

export async function startActivityAsync(
  _activityAction: string,
  _params?: { data?: string; type?: string; flags?: number }
): Promise<{ resultCode: number; data?: string }> {
  if (startActivityFailure) throw startActivityFailure;
  return { resultCode: 0 };
}

export function __setStartActivityFailure(error: Error | null) {
  startActivityFailure = error;
}
