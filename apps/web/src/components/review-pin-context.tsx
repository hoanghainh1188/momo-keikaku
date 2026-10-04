'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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

/** Review page registers the snapshot id it loaded so the top-bar pin can offer Re-pin. */
export function ReviewPinRegistrar({ snapshotId }: { readonly snapshotId: string }) {
  const { setReviewPinnedSnapshotId } = useReviewPin();
  useEffect(() => {
    setReviewPinnedSnapshotId(snapshotId);
    return () => setReviewPinnedSnapshotId(null);
  }, [snapshotId, setReviewPinnedSnapshotId]);
  return null;
}
