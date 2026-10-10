import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

// Always production. A user-entered address is not needed and would let a
// workflow send an API key somewhere else.
const BASE_URL = 'https://www.fuxux.com';

type FuxuxContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

// What to do about the answers a workflow builder can act on. Fuxux's own
// message (the "error" field of the answer) stays as the error's title.
const HINTS: Record<number, string> = {
	401: 'Fuxux refused the API key: it was revoked or deleted, or the API add-on is no longer active on the account. Check Billing in Fuxux, then update the credential with a key from the API keys page.',
	403: 'This key is not allowed to do that. Keys made by the Fuxux browser extension only work in the extension, and Reddit posts are created in the Fuxux web app only.',
	429: 'Fuxux rate limit reached. Wait a minute before the next request, and poll less often.',
};

export async function fuxuxApiRequest(
	this: FuxuxContext,
	method: IHttpRequestMethods,
	path: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		qs,
		body,
		json: true,
	};
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'fuxuxApi',
			options,
		)) as IDataObject;
	} catch (error) {
		const failure = error as { httpCode?: string | number; response?: { status?: number } };
		const status = Number(failure.httpCode ?? failure.response?.status);
		throw new NodeApiError(
			this.getNode(),
			error as JsonObject,
			HINTS[status] ? { description: HINTS[status] } : {},
		);
	}
}

/**
 * Reads every page of GET /api/posts (50 at a time) up to `max` posts.
 * `hasMore` and `nextOffset` in each answer say whether another page exists.
 */
export async function fuxuxListPosts(
	this: FuxuxContext,
	qs: IDataObject,
	max: number,
): Promise<IDataObject[]> {
	const posts: IDataObject[] = [];
	let offset = 0;
	// 40 pages is 2,000 posts: a ceiling so a bad answer can never loop for good.
	for (let page = 0; page < 40 && posts.length < max; page++) {
		const limit = Math.min(50, max - posts.length);
		const data = await fuxuxApiRequest.call(this, 'GET', '/api/posts', {
			...qs,
			limit,
			...(offset ? { offset } : {}),
		});
		const batch = (data.posts as IDataObject[] | undefined) ?? [];
		posts.push(...batch);
		if (!data.hasMore || !batch.length) break;
		offset = typeof data.nextOffset === 'number' ? data.nextOffset : offset + batch.length;
	}
	return posts.slice(0, max);
}
