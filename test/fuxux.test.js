// Runs the built nodes against a fake n8n context: no network, no API key.
// `npm test` builds first, so this reads dist/.
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCreatePostBody } = require('../dist/nodes/Fuxux/shared/createPost.js');
const { pickNew, toItem, hasFailure, queryFor } = require('../dist/nodes/Fuxux/shared/triggerEvents.js');
const { Fuxux } = require('../dist/nodes/Fuxux/Fuxux.node.js');
const { FuxuxTrigger } = require('../dist/nodes/Fuxux/FuxuxTrigger.node.js');
const { FuxuxApi } = require('../dist/credentials/FuxuxApi.credentials.js');

const NOW = Date.parse('2026-10-10T12:00:00.000Z');

test('create: one caption goes to every picked platform', () => {
	const body = buildCreatePostBody({ mode: 'publish', platforms: ['linkedin', 'bluesky'], caption: ' Hello ' });
	assert.deepEqual(body, { captions: { linkedin: 'Hello', bluesky: 'Hello' } });
});

test('create: a per-platform caption replaces the shared one, a blank one does not', () => {
	const body = buildCreatePostBody({
		mode: 'publish',
		platforms: ['linkedin', 'twitter'],
		caption: 'Shared',
		overrides: [
			{ platform: 'twitter', caption: 'Short' },
			{ platform: 'linkedin', caption: '   ' },
			{ platform: 'threads', caption: 'Only here' },
		],
	});
	assert.deepEqual(body.captions, { linkedin: 'Shared', twitter: 'Short', threads: 'Only here' });
});

test('create: no caption or no platform is refused before any request', () => {
	assert.throws(() => buildCreatePostBody({ mode: 'publish', platforms: [], caption: 'Hi' }), /at least one platform/);
	assert.throws(() => buildCreatePostBody({ mode: 'publish', platforms: ['linkedin'], caption: '  ' }), /Add a caption/);
});

test('create: Reddit and unknown platforms never reach the API', () => {
	const body = buildCreatePostBody({
		mode: 'draft',
		platforms: ['reddit', 'myspace', 'linkedin'],
		caption: 'Hi',
		overrides: [{ platform: 'reddit', caption: 'nope' }],
	});
	assert.deepEqual(body.captions, { linkedin: 'Hi' });
	assert.equal(body.draft, true);
});

test('create: schedule needs a valid time and sends it as ISO', () => {
	assert.throws(() => buildCreatePostBody({ mode: 'schedule', platforms: ['linkedin'], caption: 'Hi' }), /Scheduled At/);
	assert.throws(
		() => buildCreatePostBody({ mode: 'schedule', platforms: ['linkedin'], caption: 'Hi', scheduledAt: 'tomorrow-ish' }),
		/not a valid date/,
	);
	const body = buildCreatePostBody({
		mode: 'schedule',
		platforms: ['linkedin'],
		caption: 'Hi',
		scheduledAt: '2026-10-12T09:00:00+02:00',
	});
	assert.equal(body.scheduled_at, '2026-10-12T07:00:00.000Z');
	assert.equal(body.draft, undefined);
});

test('create: media is trimmed, blanks dropped, capped at four', () => {
	const body = buildCreatePostBody({
		mode: 'publish',
		platforms: ['instagram'],
		caption: 'Hi',
		mediaUrls: [' https://a/1.jpg ', '', 'https://a/2.jpg', 'https://a/3.jpg', 'https://a/4.jpg', 'https://a/5.jpg'],
	});
	assert.deepEqual(body.media_urls, ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg', 'https://a/4.jpg']);
	assert.equal(body.scheduled_at, undefined);
});

test('create: a video with Publish Now is handed to the scheduler 90 s ahead', () => {
	const body = buildCreatePostBody({
		mode: 'publish',
		platforms: ['tiktok'],
		caption: 'Hi',
		mediaUrls: ['https://cdn.example.com/clip.MP4?x=1'],
		now: () => NOW,
	});
	assert.equal(body.scheduled_at, '2026-10-10T12:01:30.000Z');
	// A draft with a video stays a draft.
	const draft = buildCreatePostBody({ mode: 'draft', platforms: ['tiktok'], caption: 'Hi', mediaUrls: ['https://a/c.mp4'], now: () => NOW });
	assert.equal(draft.scheduled_at, undefined);
	assert.equal(draft.draft, true);
});

test('create: a chosen account needs exactly one platform', () => {
	assert.throws(
		() => buildCreatePostBody({ mode: 'publish', platforms: ['linkedin', 'twitter'], caption: 'Hi', accountId: 'acc-1' }),
		/that account only.*LinkedIn, X \(Twitter\)/,
	);
	const body = buildCreatePostBody({ mode: 'publish', platforms: ['linkedin'], caption: 'Hi', accountId: ' acc-1 ', note: ' idea ' });
	assert.deepEqual(body.targets, [{ account_id: 'acc-1', platform: 'linkedin' }]);
	assert.equal(body.prompt, 'idea');
});

const post = (id, status, variants = []) => ({
	id,
	status,
	raw_prompt: null,
	scheduled_at: null,
	published_at: '2026-10-10T10:00:00.000Z',
	created_at: '2026-10-10T09:00:00.000Z',
	post_variants: variants,
});

test('trigger: the first poll remembers what exists and emits nothing', () => {
	const { fresh, seen } = pickNew('postPublished', [post('a', 'published'), post('b', 'published')], undefined);
	assert.deepEqual(fresh, []);
	assert.deepEqual(seen, ['a', 'b']);
});

test('trigger: later polls emit only posts not seen before, once', () => {
	const first = pickNew('postPublished', [post('c', 'published'), post('a', 'published')], ['a', 'b']);
	assert.deepEqual(first.fresh.map((p) => p.id), ['c']);
	assert.deepEqual(first.seen, ['c', 'a', 'b']);
	const again = pickNew('postPublished', [post('c', 'published'), post('a', 'published')], first.seen);
	assert.deepEqual(again.fresh, []);
});

test('trigger: an empty account starts clean and then fires on its first post', () => {
	const start = pickNew('postPublished', [], undefined);
	assert.deepEqual(start, { fresh: [], seen: [] });
	const next = pickNew('postPublished', [post('a', 'published')], start.seen);
	assert.deepEqual(next.fresh.map((p) => p.id), ['a']);
});

test('trigger: the remembered list is capped', () => {
	const many = Array.from({ length: 600 }, (_, i) => post('p' + i, 'published'));
	assert.equal(pickNew('postPublished', many, undefined).seen.length, 500);
	assert.equal(pickNew('postPublished', many, []).seen.length, 500);
});

test('trigger: a partial failure counts as failed and says where and why', () => {
	const partial = post('x', 'published', [
		{ platform: 'twitter', status: 'published' },
		{ platform: 'linkedin', status: 'failed', error_message: 'Token expired' },
		{ platform: 'threads', status: 'failed', error_message: null },
	]);
	const fine = post('y', 'published', [{ platform: 'twitter', status: 'published' }]);
	assert.equal(hasFailure(partial), true);
	assert.equal(hasFailure(fine), false);
	assert.equal(hasFailure(post('z', 'failed')), true);
	const { fresh } = pickNew('postFailed', [partial, fine], []);
	assert.deepEqual(fresh.map((p) => p.id), ['x']);
	const item = toItem('postFailed', partial);
	assert.equal(item.is_partial_failure, true);
	assert.deepEqual(item.failed_platforms, ['linkedin', 'threads']);
	assert.equal(item.failed_reasons, 'linkedin: Token expired; threads: unknown error');
	assert.deepEqual(toItem('postPublished', fine).platforms, ['twitter']);
	assert.equal(toItem('postPublished', fine).is_partial_failure, undefined);
});

test('trigger: each event asks the API for the right list', () => {
	assert.deepEqual(queryFor('postPublished'), { status: 'published', order: 'published_at_desc' });
	assert.deepEqual(queryFor('postFailed'), { status: 'all', order: 'updated_at_desc' });
});

// ── The nodes themselves, with a fake context ───────────────────────────────

function fakeContext({ params, answers, mode = 'trigger', staticData = {}, continueOnFail = false }) {
	const calls = [];
	return {
		calls,
		staticData,
		getInputData: () => [{ json: {} }],
		getNode: () => ({ name: 'Fuxux', type: 'n8n-nodes-fuxux.fuxux', typeVersion: 1, position: [0, 0], parameters: {} }),
		getMode: () => mode,
		getWorkflowStaticData: () => staticData,
		continueOnFail: () => continueOnFail,
		getNodeParameter: (name, _index, fallback) => (name in params ? params[name] : fallback),
		helpers: {
			httpRequestWithAuthentication: async function (credential, options) {
				calls.push({ credential, ...options });
				const answer = answers.shift();
				if (answer instanceof Error) throw answer;
				return answer;
			},
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			constructExecutionMetaData: (items, { itemData }) => items.map((item) => ({ ...item, pairedItem: itemData })),
		},
	};
}

test('node: Create sends one POST to production with the built body', async () => {
	const ctx = fakeContext({
		params: {
			resource: 'post',
			operation: 'create',
			mode: 'draft',
			platforms: ['linkedin'],
			caption: 'Hello',
			options: { note: 'idea', overrides: { caption: [{ platform: 'bluesky', caption: 'Hi sky' }] } },
		},
		answers: [{ post: { id: 'p1', status: 'draft' } }],
	});
	const [items] = await new Fuxux().execute.call(ctx);
	assert.equal(ctx.calls.length, 1);
	assert.equal(ctx.calls[0].credential, 'fuxuxApi');
	assert.equal(ctx.calls[0].method, 'POST');
	assert.equal(ctx.calls[0].url, 'https://www.fuxux.com/api/posts');
	assert.deepEqual(ctx.calls[0].body, { captions: { linkedin: 'Hello', bluesky: 'Hi sky' }, prompt: 'idea', draft: true });
	assert.deepEqual(items[0].json, { post: { id: 'p1', status: 'draft' } });
});

test('node: a field problem stops before any request', async () => {
	const ctx = fakeContext({
		params: { resource: 'post', operation: 'create', mode: 'publish', platforms: [], caption: '', options: {} },
		answers: [],
	});
	await assert.rejects(() => new Fuxux().execute.call(ctx), /Add a caption/);
	assert.equal(ctx.calls.length, 0);
});

test('node: Get Many follows pages and stops at the limit', async () => {
	const page = (ids, hasMore, nextOffset) => ({ posts: ids.map((id) => ({ id })), hasMore, nextOffset });
	const fifty = Array.from({ length: 50 }, (_, i) => 'a' + i);
	const ctx = fakeContext({
		params: { resource: 'post', operation: 'getAll', returnAll: false, limit: 60, filters: { status: 'failed', month: '2026-10', order: '' } },
		answers: [page(fifty, true, 50), page(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10'], true, 60)],
	});
	const [items] = await new Fuxux().execute.call(ctx);
	assert.equal(items.length, 60);
	assert.deepEqual(ctx.calls[0].qs, { status: 'failed', month: '2026-10', limit: 50 });
	assert.deepEqual(ctx.calls[1].qs, { status: 'failed', month: '2026-10', limit: 10, offset: 50 });
	assert.equal(ctx.calls.length, 2);
});

test('node: Get Many with status All sends no status filter', async () => {
	const ctx = fakeContext({
		params: { resource: 'post', operation: 'getAll', returnAll: false, limit: 5, filters: { status: 'all' } },
		answers: [{ posts: [], hasMore: false }],
	});
	const [items] = await new Fuxux().execute.call(ctx);
	assert.equal(items.length, 0);
	assert.deepEqual(ctx.calls[0].qs, { limit: 5 });
});

test('node: Update sends only what was filled in, and refuses an empty update', async () => {
	const ctx = fakeContext({
		params: {
			resource: 'post',
			operation: 'update',
			postId: 'abc/1',
			updateFields: {
				scheduledAt: '2026-10-12T09:00:00.000Z',
				variants: { variant: [{ id: 'v1', content: 'New text' }, { id: '', content: 'skipped' }] },
			},
		},
		answers: [{ ok: true }],
	});
	await new Fuxux().execute.call(ctx);
	assert.equal(ctx.calls[0].method, 'PATCH');
	assert.equal(ctx.calls[0].url, 'https://www.fuxux.com/api/posts/abc%2F1');
	assert.deepEqual(ctx.calls[0].body, { scheduled_at: '2026-10-12T09:00:00.000Z', variant_updates: [{ id: 'v1', content: 'New text' }] });

	const empty = fakeContext({ params: { resource: 'post', operation: 'update', postId: 'p', updateFields: {} }, answers: [] });
	await assert.rejects(() => new Fuxux().execute.call(empty), /at least one field/);
	assert.equal(empty.calls.length, 0);
});

test('node: Get and Delete call the post address', async () => {
	const get = fakeContext({ params: { resource: 'post', operation: 'get', postId: 'p1' }, answers: [{ post: { id: 'p1' } }] });
	await new Fuxux().execute.call(get);
	assert.equal(get.calls[0].method, 'GET');
	assert.equal(get.calls[0].url, 'https://www.fuxux.com/api/posts/p1');
	const del = fakeContext({ params: { resource: 'post', operation: 'delete', postId: 'p1' }, answers: [{ success: true }] });
	const [items] = await new Fuxux().execute.call(del);
	assert.equal(del.calls[0].method, 'DELETE');
	assert.deepEqual(items[0].json, { deleted: true, id: 'p1', success: true });
});

test('node: Connected Account lists accounts and filters by platform', async () => {
	const accounts = [
		{ id: '1', platform: 'linkedin', platform_username: 'me' },
		{ id: '2', platform: 'twitter', platform_username: '@me' },
	];
	const ctx = fakeContext({ params: { resource: 'account', operation: 'getAll', platform: 'twitter' }, answers: [{ accounts }] });
	const [items] = await new Fuxux().execute.call(ctx);
	assert.deepEqual(items.map((i) => i.json.id), ['2']);
	assert.equal(ctx.calls[0].url, 'https://www.fuxux.com/api/accounts');
});

test('node: the account picker leaves out Reddit and reminder accounts', async () => {
	const ctx = fakeContext({
		params: {},
		answers: [
			{
				accounts: [
					{ id: '1', platform: 'linkedin', platform_username: 'me', status: 'connected' },
					{ id: '2', platform: 'reddit', platform_username: 'u/me' },
					{ id: '3', platform: 'tiktok', platform_username: 'me', via_reminder: true },
					{ id: '4', platform: 'twitter', platform_username: '@me', status: 'expired' },
				],
			},
		],
	});
	const options = await new Fuxux().methods.loadOptions.getAccounts.call(ctx);
	assert.deepEqual(options, [
		{ name: 'me - LinkedIn', value: '1' },
		{ name: '@me (reconnect needed) - X (Twitter)', value: '4' },
	]);
});

test('node: an API refusal becomes an error with what to do about it', async () => {
	const refusal = Object.assign(new Error('Request failed with status code 401'), { httpCode: '401' });
	const ctx = fakeContext({ params: { resource: 'post', operation: 'get', postId: 'p1' }, answers: [refusal] });
	await assert.rejects(
		() => new Fuxux().execute.call(ctx),
		(error) => error.constructor.name === 'NodeApiError' && /refused the API key/.test(error.description),
	);
});

test('node: with Continue On Fail the item carries the error instead', async () => {
	const ctx = fakeContext({
		params: { resource: 'post', operation: 'create', mode: 'publish', platforms: [], caption: '', options: {} },
		answers: [],
		continueOnFail: true,
	});
	const [items] = await new Fuxux().execute.call(ctx);
	assert.match(items[0].json.error, /Add a caption/);
});

test('trigger node: switching on remembers, the next poll fires once', async () => {
	const staticData = {};
	const first = fakeContext({ params: { event: 'postPublished' }, staticData, answers: [{ posts: [post('a', 'published')], hasMore: false }] });
	assert.equal(await new FuxuxTrigger().poll.call(first), null);
	assert.deepEqual(staticData.seen, ['a']);
	assert.deepEqual(first.calls[0].qs, { status: 'published', order: 'published_at_desc', limit: 50 });

	// A full page of 50 with more behind it, as a busy account returns.
	const older = Array.from({ length: 48 }, (_, i) => post('old' + i, 'published'));
	staticData.seen.push(...older.map((p) => p.id));
	const second = fakeContext({ params: { event: 'postPublished' }, staticData, answers: [{ posts: [post('b', 'published'), post('a', 'published'), ...older], hasMore: true, nextOffset: 50 }] });
	const out = await new FuxuxTrigger().poll.call(second);
	assert.deepEqual(out[0].map((i) => i.json.id), ['b']);
	// One page per poll, even when the API says there is more.
	assert.equal(second.calls.length, 1);

	const third = fakeContext({ params: { event: 'postPublished' }, staticData, answers: [{ posts: [post('b', 'published'), post('a', 'published')], hasMore: false }] });
	assert.equal(await new FuxuxTrigger().poll.call(third), null);
});

test('trigger node: a manual test shows the latest post and remembers nothing', async () => {
	const staticData = {};
	const ctx = fakeContext({ params: { event: 'postPublished' }, mode: 'manual', staticData, answers: [{ posts: [post('a', 'published'), post('b', 'published')], hasMore: false }] });
	const out = await new FuxuxTrigger().poll.call(ctx);
	assert.deepEqual(out[0].map((i) => i.json.id), ['a']);
	assert.deepEqual(staticData, {});
	const none = fakeContext({ params: { event: 'postFailed' }, mode: 'manual', answers: [{ posts: [post('a', 'published')], hasMore: false }] });
	assert.equal(await new FuxuxTrigger().poll.call(none), null);
});

test('credential: the key is sent as a bearer token and tested against production', () => {
	const credential = new FuxuxApi();
	assert.equal(credential.name, 'fuxuxApi');
	assert.equal(credential.authenticate.properties.headers.Authorization, '=Bearer {{$credentials?.apiKey}}');
	assert.equal(credential.test.request.baseURL + credential.test.request.url, 'https://www.fuxux.com/api/settings/profile');
	assert.equal(credential.properties[0].typeOptions.password, true);
});

test('package: n8n finds the built files it is told about', () => {
	const pkg = require('../package.json');
	const fs = require('node:fs');
	const path = require('node:path');
	for (const file of [...pkg.n8n.credentials, ...pkg.n8n.nodes]) {
		assert.ok(fs.existsSync(path.join(__dirname, '..', file)), file);
	}
	assert.ok(pkg.keywords.includes('n8n-community-node-package'));
	assert.ok(fs.existsSync(path.join(__dirname, '..', 'dist/icons/fuxux.svg')));
});
