import { PLATFORM_IDS, platformName } from './platforms';

export type CreatePostInput = {
	mode: 'publish' | 'schedule' | 'draft';
	platforms: string[];
	caption: string;
	/** Captions that replace the shared one for a single platform. */
	overrides?: Array<{ platform: string; caption: string }>;
	scheduledAt?: string;
	mediaUrls?: string[];
	note?: string;
	accountId?: string;
	/** For "now + 90 s"; tests pass a fixed clock. */
	now?: () => number;
};

export type CreatePostBody = {
	captions: Record<string, string>;
	prompt?: string;
	media_urls?: string[];
	targets?: Array<{ account_id: string; platform: string }>;
	draft?: true;
	scheduled_at?: string;
};

const VIDEO_URL = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Turns the node's fields into the body of POST /api/posts. Throws an Error
 * with a message meant for the person building the workflow.
 */
export function buildCreatePostBody(input: CreatePostInput): CreatePostBody {
	const captions: Record<string, string> = {};
	const shared = clean(input.caption);
	for (const platform of input.platforms ?? []) {
		if (PLATFORM_IDS.includes(platform) && shared) captions[platform] = shared;
	}
	for (const override of input.overrides ?? []) {
		const platform = clean(override.platform);
		const text = clean(override.caption);
		// A blank override (an item with no text) is skipped: it must not wipe
		// the shared caption or reach Fuxux as an empty one.
		if (PLATFORM_IDS.includes(platform) && text) captions[platform] = text;
	}

	if (!Object.keys(captions).length) {
		throw new Error(
			'Add a caption and pick at least one platform, or add a caption for a single platform.',
		);
	}

	const body: CreatePostBody = { captions };

	const note = clean(input.note);
	if (note) body.prompt = note;

	// Blank entries are dropped, and Fuxux keeps at most four.
	const mediaUrls = (input.mediaUrls ?? []).map(clean).filter(Boolean).slice(0, 4);
	if (mediaUrls.length) body.media_urls = mediaUrls;

	const accountId = clean(input.accountId);
	if (accountId) {
		// With one account picked, Fuxux posts to that account only. Captions for
		// other platforms would be dropped without a word.
		const platforms = Object.keys(captions);
		if (platforms.length !== 1) {
			throw new Error(
				`With a connected account chosen, the post goes to that account only, but there are captions for ${platforms
					.map(platformName)
					.join(', ')}. Keep one platform, or clear the account to post to every platform.`,
			);
		}
		body.targets = [{ account_id: accountId, platform: platforms[0] }];
	}

	if (input.mode === 'draft') {
		body.draft = true;
	} else if (input.mode === 'schedule') {
		const scheduledAt = clean(input.scheduledAt);
		if (!scheduledAt) throw new Error('Set "Scheduled At" when the mode is "Schedule for Later".');
		const when = new Date(scheduledAt);
		if (Number.isNaN(when.getTime())) throw new Error('"Scheduled At" is not a valid date.');
		body.scheduled_at = when.toISOString();
	} else if (mediaUrls.some((url) => VIDEO_URL.test(url))) {
		// "Publish now" with a video: Fuxux publishes inside the request, and a
		// video can take longer than n8n waits. A retry would then post twice.
		// Hand it to the scheduler a minute and a half ahead instead; the result
		// arrives through the Fuxux Trigger node.
		const now = (input.now ?? Date.now)();
		body.scheduled_at = new Date(now + 90 * 1000).toISOString();
	}

	return body;
}
