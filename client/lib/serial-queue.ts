/**
 * Runs async tasks one at a time, in the order they were added. For
 * read-modify-write cycles on one stored list, where two cycles side by
 * side both read the old list and the later write drops the earlier one.
 * A failed task rejects for its own caller and the queue carries on.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
