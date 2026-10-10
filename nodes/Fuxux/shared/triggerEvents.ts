import type { IDataObject } from 'n8n-workflow';

export type TriggerEvent = 'postPublished' | 'postFailed';

/** What GET /api/posts is asked for, per event. */
export function queryFor(event: TriggerEvent): IDataObject {
	return event === 'postPublished'
		? // Newest publishes first. The default sort is by scheduled time, so a
			// post published immediately would fall outside the first page.
			{ status: 'published', order: 'published_at_desc' }
		: // Most recently changed first, so a post that fails today is read even
			// if it was created long ago.
			{ status: 'all', order: 'updated_at_desc' };
}

const variantsOf = (post: IDataObject): IDataObject[] =>
	(post.post_variants as IDataObject[] | undefined) ?? [];

/**
 * A post counts as failed when it failed everywhere or on at least one
 * platform: a post that went out on X but not on LinkedIn still says
 * "published" at the top.
 */
export function hasFailure(post: IDataObject): boolean {
	return post.status === 'failed' || variantsOf(post).some((variant) => variant.status === 'failed');
}

/** The item a workflow receives for one post. */
export function toItem(event: TriggerEvent, post: IDataObject): IDataObject {
	const variants = variantsOf(post);
	const base: IDataObject = {
		id: post.id,
		status: post.status,
		raw_prompt: post.raw_prompt,
		scheduled_at: post.scheduled_at,
		published_at: post.published_at,
		created_at: post.created_at,
		media_urls: post.media_urls ?? [],
		platforms: variants.map((variant) => variant.platform),
		post_variants: variants,
	};
	if (event === 'postPublished') return base;
	const failed = variants.filter((variant) => variant.status === 'failed');
	return {
		...base,
		is_partial_failure: post.status !== 'failed' && failed.length > 0,
		failed_platforms: failed.map((variant) => variant.platform),
		failed_reasons: failed
			.map((variant) => `${variant.platform}: ${variant.error_message || 'unknown error'}`)
			.join('; '),
	};
}

/**
 * Which posts are new since the last poll.
 *
 * `seen` is the list of post ids already handed to the workflow (or present
 * when the trigger was switched on). On the very first poll nothing is
 * emitted: everything already there is remembered instead, so switching the
 * trigger on does not replay old posts.
 */
export function pickNew(
	event: TriggerEvent,
	posts: IDataObject[],
	seen: string[] | undefined,
): { fresh: IDataObject[]; seen: string[] } {
	const matching = event === 'postFailed' ? posts.filter(hasFailure) : posts;
	const ids = matching.map((post) => String(post.id));
	if (seen === undefined) return { fresh: [], seen: ids.slice(0, MAX_SEEN) };
	const known = new Set(seen);
	const fresh = matching.filter((post) => !known.has(String(post.id)));
	// Newest ids first, so the cap drops the oldest.
	const merged = [...fresh.map((post) => String(post.id)), ...seen];
	return { fresh, seen: merged.slice(0, MAX_SEEN) };
}

export const MAX_SEEN = 500;
