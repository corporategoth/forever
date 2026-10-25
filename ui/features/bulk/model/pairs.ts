import { sameRef, type SavedRef } from './saved_refs';

// A pair's two refs, an absent side read as the current one.
export type PairSides<P> = (pair: P) => readonly [SavedRef, SavedRef];

export const CURRENT_REF: SavedRef = { name: '', preset: false };

export interface PairSide {
	isCurrent: boolean;
	name: string;
}

const isCurrentRef = (ref: SavedRef) => ref.name === '';

const samePair = <P>(sides: PairSides<P>, a: P, b: P) => {
	const [aFirst, aSecond] = sides(a);
	const [bFirst, bSecond] = sides(b);
	return sameRef(aFirst, bFirst) && sameRef(aSecond, bSecond);
};

// The current pair runs anyway, so it counts as listed. Two pairs are the same by their refs, not by what the entries
// hold.
export const pairInList = <P>(pairs: readonly P[], pair: P, sides: PairSides<P>): boolean =>
	sides(pair).every(isCurrentRef) || pairs.some(stored => samePair(sides, stored, pair));

// Equal for two pairs exactly when their refs are, so it keys a list row.
export const pairKey = <P>(pair: P, sides: PairSides<P>): string => JSON.stringify(sides(pair).map(ref => [ref.name, ref.preset]));

// Null when Add is blocked, so nothing is written.
export const pairsAfterAdd = <P extends { checked: boolean }>(pairs: readonly P[], pair: P, sides: PairSides<P>): P[] | null =>
	pairInList(pairs, pair, sides) ? null : [...pairs, { ...pair, checked: true }];

export const pairsAfterRemove = <P>(pairs: readonly P[], pair: P, sides: PairSides<P>): P[] => pairs.filter(stored => !samePair(sides, stored, pair));

export const pairsAfterChecked = <P extends { checked: boolean }>(pairs: readonly P[], pair: P, checked: boolean, sides: PairSides<P>): P[] =>
	pairs.map(stored => (samePair(sides, stored, pair) ? { ...stored, checked } : stored));

// Null for the current one; undefined when no entry has the ref any more.
const sideEntry = <E extends { ref: SavedRef }>(entries: readonly E[], ref: SavedRef): E | null | undefined =>
	isCurrentRef(ref) ? null : entries.find(entry => sameRef(entry.ref, ref));

// The stored pairs whose two sides resolve, in stored order, with their entries (null for a current side). A pair whose
// entry was deleted or renamed is left out but stays stored, so it is back once an entry of that name is.
export const resolvedPairs = <P, A extends { ref: SavedRef }, B extends { ref: SavedRef }>(
	pairs: readonly P[],
	sides: PairSides<P>,
	first: readonly A[],
	second: readonly B[],
): Array<{ pair: P; first: A | null; second: B | null }> =>
	pairs.flatMap(pair => {
		const [firstRef, secondRef] = sides(pair);
		const firstEntry = sideEntry(first, firstRef);
		const secondEntry = sideEntry(second, secondRef);
		return firstEntry === undefined || secondEntry === undefined ? [] : [{ pair, first: firstEntry, second: secondEntry }];
	});

export const pairSide = (entry: { name: string } | null): PairSide => ({ isCurrent: entry === null, name: entry?.name ?? '' });

export const pairSideOptions = <E extends { ref: SavedRef; name: string }>(
	entries: readonly E[],
	label: (side: PairSide) => string,
): Array<{ ref: SavedRef; label: string }> => [
	{ ref: CURRENT_REF, label: label(pairSide(null)) },
	...entries.map(entry => ({ ref: entry.ref, label: label(pairSide(entry)) })),
];
