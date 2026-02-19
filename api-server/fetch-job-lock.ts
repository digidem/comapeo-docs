interface FetchJobLockState {
  jobId: string | null;
  acquiredAt: number | null;
}

const state: FetchJobLockState = {
  jobId: null,
  acquiredAt: null,
};

export function isFetchJobLockHeld(): boolean {
  return state.jobId !== null;
}

export function getFetchJobLockHolder(): string | null {
  return state.jobId;
}

export function tryAcquireFetchJobLock(jobId: string): boolean {
  if (state.jobId !== null) {
    return false;
  }

  state.jobId = jobId;
  state.acquiredAt = Date.now();
  return true;
}

export function releaseFetchJobLock(jobId: string): void {
  if (state.jobId !== jobId) {
    return;
  }

  state.jobId = null;
  state.acquiredAt = null;
}

export function resetFetchJobLock(): void {
  state.jobId = null;
  state.acquiredAt = null;
}
