// The request board (adult track A2.3, docs/adult-a2-plan.md section 11): what a request asks for, what it pays and how the board runs. Every number is
// `[tune]`. The rules are in game/requests.ts; this file is only the list and the numbers, and none of it is saved (a saved request names its type, and
// what the type needs and pays is read from here when it counts and when it pays).

export type RequestType = "feed" | "field" | "job" | "fight" | "buy";
export const requestTypes: RequestType[] = ["feed", "field", "job", "fight", "buy"];

export const requestTuning = {
  // Open requests plus waiting slots are never more than this.
  slots: 3,
  // Minutes after a request is done before the next one is drawn for its slot.
  refillMinutes: 15,
  // The oldest open request pays this much more once it has been open this many days (rounded up).
  staleDays: 3,
  staleBonus: 0.25,
  // Every this-many-th request drawn also pays an item (the 4th, 8th, ...).
  itemEvery: 4,
  // What counts as done: meals of the named food, minutes in the named field, finished jobs, won fights, purchases.
  need: { feed: 2, field: 20, job: 1, fight: 1, buy: 1 } as Record<RequestType, number>,
  // What each pays, before the stale bonus.
  coins: { feed: 2, field: 3, job: 3, fight: 4, buy: 5 } as Record<RequestType, number>,
  // The most a saved "what it paid" may say (a saved game is not trusted).
  paidMax: 1000,
};
