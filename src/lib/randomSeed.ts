// Generates a short random seed for the "random" movie sort. The seed is
// sent to the API so pagination stays stable across scroll-triggered
// fetches (same seed -> same shuffle order), and only changes when the
// user (re)selects random sort.
export function generateRandomSeed(): string {
  return Math.random().toString(36).slice(2);
}
