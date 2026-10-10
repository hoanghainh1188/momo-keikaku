'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ensureReviewTrackerPinAction } from '@/app/p/[projectId]/snapshot-actions';
import type { ReviewTrackerPinCookie } from '@/lib/review-tracker-pin-cookie';

interface ReviewPinContextValue {
  readonly reviewPinnedSnapshotId: string | null;
  readonly setReviewPinnedSnapshotId: (id: string | null) => void;
}

const ReviewPinContext = createContext<ReviewPinContextValue>({
  reviewPinnedSnapshotId: null,
  setReviewPinnedSnapshotId: () => {},
});

export function ReviewPinProvider({ children }: { readonly children: ReactNode }) {
  const [reviewPinnedSnapshotId, setReviewPinnedSnapshotId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ reviewPinnedSnapshotId, setReviewPinnedSnapshotId }),
    [reviewPinnedSnapshotId],
  );
  return <ReviewPinContext.Provider value={value}>{children}</ReviewPinContext.Provider>;
}

export function useReviewPin(): ReviewPinContextValue {
  return useContext(ReviewPinContext);
}

/**
 * Review page registers the snapshot id it loaded so the top-bar pin can offer Re-pin,
 * and persists the Tracker freeze via Server Action (Story 6.7 / Q1→C — not from RSC).
 */
export function ReviewPinRegistrar({
  snapshotId,
  projectId,
  trackerPin,
}: {
  readonly snapshotId: string;
  readonly projectId: string;
  /** Pin actually used for this load (live capture when cookie freeze was missing/invalid). */
  readonly trackerPin: ReviewTrackerPinCookie | null;
}) {
  const { setReviewPinnedSnapshotId } = useReviewPin();
  useEffect(() => {
    setReviewPinnedSnapshotId(snapshotId);
    if (trackerPin) {
      void ensureReviewTrackerPinAction({ projectId, pin: trackerPin });
    }
    return () => setReviewPinnedSnapshotId(null);
  }, [snapshotId, projectId, trackerPin, setReviewPinnedSnapshotId]);
  return null;
}
