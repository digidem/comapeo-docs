interface FetchJobLockState {
  jobId: string | null;
  acquiredAt: number | null;
}

const state: FetchJobLockState = {
  jobId: null,
  acquiredAt: null,
};

const DEFAULT_LOCK_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function isFetchJobLockHeld(): boolean {
  if (state.jobId !== null && state.acquiredAt !== null) {
    if (Date.now() - state.acquiredAt > DEFAULT_LOCK_TTL_MS) {
      resetFetchJobLock();
      return false;
    }
    return true;
  }
  return false;
}

export function getFetchJobLockHolder(): string | null {
  if (isFetchJobLockHeld()) {
    return state.jobId;
  }
  return null;
}

export function tryAcquireFetchJobLock(jobId: string): boolean {
  if (isFetchJobLockHeld()) {
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
