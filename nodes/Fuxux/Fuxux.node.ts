import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { buildCreatePostBody, type CreatePostInput } from './shared/createPost';
import { PLATFORMS, PLATFORM_IDS, platformName } from './shared/platforms';
import { fuxuxApiRequest, fuxuxListPosts } from './shared/transport';

export class Fuxux implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Fuxux',
		name: 'fuxux',
		icon: { light: 'file:../../icons/fuxux.svg', dark: 'file:../../icons/fuxux.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Schedule and publish social media posts with Fuxux',
		defaults: {
			name: 'Fuxux',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'fuxuxApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Connected Account',
						value: 'account',
					},
					{
						name: 'Post',
						value: 'post',
					},
				],
				default: 'post',
			},

			// ── Post operations ──────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['post'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Publish now, schedule for later, or save a draft',
						action: 'Create a post',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a post from Fuxux',
						action: 'Delete a post',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get one post with the result on each platform',
						action: 'Get a post',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List scheduled, published, draft or failed posts',
						action: 'Get many posts',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Reschedule a post or change its captions or media',
						action: 'Update a post',
					},
				],
				default: 'create',
			},

			// ── Connected account operations ─────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List the social accounts connected in Fuxux',
						action: 'Get many connected accounts',
					},
				],
				default: 'getAll',
			},

			// ── Post: create ─────────────────────────────────────────────────
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
				options: [
					{
						name: 'Publish Now',
						value: 'publish',
						description: 'A video goes out a couple of minutes later',
					},
					{
						name: 'Save as Draft',
						value: 'draft',
					},
					{
						name: 'Schedule for Later',
						value: 'schedule',
					},
				],
				default: 'publish',
			},
			{
				displayName: 'Scheduled At',
				name: 'scheduledAt',
				type: 'dateTime',
				required: true,
				displayOptions: {
					show: { resource: ['post'], operation: ['create'], mode: ['schedule'] },
				},
				default: '',
				description: 'When the post goes out. Must be in the future.',
			},
			{
				displayName: 'Platforms',
				name: 'platforms',
				type: 'multiOptions',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
				options: [...PLATFORMS],
				default: [],
				description:
					'Where to post. Each platform posts to its first connected account unless you pick one under Options. Instagram needs at least one media URL.',
			},
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				typeOptions: { rows: 4 },
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
				default: '',
				description:
					'The text used on every platform picked above. Add a different text for one platform under Options.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
				default: {},
				options: [
					{
						displayName: 'Caption per Platform',
						name: 'overrides',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						placeholder: 'Add caption',
						default: {},
						description: 'A different text for one platform. It replaces the shared caption there.',
						options: [
							{
								displayName: 'Caption',
								name: 'caption',
								values: [
									{
										displayName: 'Platform',
										name: 'platform',
										type: 'options',
										options: [...PLATFORMS],
										default: 'instagram',
									},
									{
										displayName: 'Caption',
										name: 'caption',
										type: 'string',
										typeOptions: { rows: 4 },
										default: '',
									},
								],
							},
						],
					},
					{
						displayName: 'Connected Account Name or ID',
						name: 'accountId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getAccounts' },
						default: '',
						description:
							'Post to this account only. Use it when you have several accounts on one platform, and keep a caption for that platform only. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Media URLs',
						name: 'mediaUrls',
						type: 'string',
						typeOptions: { multipleValues: true },
						default: [],
						placeholder: 'https://example.com/image.jpg',
						description: 'Up to 4 public https links to images or a video',
					},
					{
						displayName: 'Note',
						name: 'note',
						type: 'string',
						default: '',
						description: 'Kept with the post in Fuxux for your reference. It is not published.',
					},
				],
			},

			// ── Post: get / delete / update ──────────────────────────────────
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['post'], operation: ['get', 'delete', 'update'] },
				},
				default: '',
			},
			{
				displayName: 'Update Fields',
				name: 'updateFields',
				type: 'collection',
				placeholder: 'Add field',
				displayOptions: { show: { resource: ['post'], operation: ['update'] } },
				default: {},
				options: [
					{
						displayName: 'Captions',
						name: 'variants',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						placeholder: 'Add caption',
						default: {},
						description:
							'New text for one platform of the post. The variant ID comes from "post_variants" in the Get operation.',
						options: [
							{
								displayName: 'Caption',
								name: 'variant',
								values: [
									{
										displayName: 'Variant ID',
										name: 'id',
										type: 'string',
										default: '',
									},
									{
										displayName: 'Caption',
										name: 'content',
										type: 'string',
										typeOptions: { rows: 4 },
										default: '',
									},
								],
							},
						],
					},
					{
						displayName: 'Media URLs',
						name: 'mediaUrls',
						type: 'string',
						typeOptions: { multipleValues: true },
						default: [],
						description: 'Replaces the media of the post. Up to 4 public https links.',
					},
					{
						displayName: 'Scheduled At',
						name: 'scheduledAt',
						type: 'dateTime',
						default: '',
						description: 'Move the post to this time. Must be in the future.',
					},
				],
			},

			// ── Post: get many ───────────────────────────────────────────────
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				displayOptions: {
					show: { resource: ['post'], operation: ['getAll'], returnAll: [false] },
				},
				default: 50,
				description: 'Max number of results to return',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add filter',
				displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
				default: {},
				options: [
					{
						displayName: 'Month',
						name: 'month',
						type: 'string',
						default: '',
						placeholder: '2026-10',
						description: 'Only posts scheduled or published in this month, written as YYYY-MM',
					},
					{
						displayName: 'Sort',
						name: 'order',
						type: 'options',
						options: [
							{ name: 'Default (Scheduled Time, Oldest First)', value: '' },
							{ name: 'Recently Changed First', value: 'updated_at_desc' },
							{ name: 'Recently Created First', value: 'created_at_desc' },
							{ name: 'Recently Published First', value: 'published_at_desc' },
						],
						default: '',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'All', value: 'all' },
							{ name: 'Draft', value: 'draft' },
							{ name: 'Failed', value: 'failed' },
							{ name: 'Published', value: 'published' },
							{ name: 'Scheduled', value: 'scheduled' },
						],
						default: 'all',
					},
				],
			},

			// ── Connected account: get many ──────────────────────────────────
			{
				displayName: 'Platform',
				name: 'platform',
				type: 'options',
				displayOptions: { show: { resource: ['account'], operation: ['getAll'] } },
				options: [{ name: 'All Platforms', value: '' }, ...PLATFORMS],
				default: '',
				description: 'Only accounts on this platform',
			},
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const data = await fuxuxApiRequest.call(this, 'GET', '/api/accounts');
				const accounts = (data.accounts as IDataObject[] | undefined) ?? [];
				return (
					accounts
						// Only accounts this node can post to: not Reddit (web app only)
						// and not reminder accounts, which Fuxux never publishes to itself.
						.filter(
							(account) =>
								PLATFORM_IDS.includes(String(account.platform)) && !account.via_reminder,
						)
						.map((account) => {
							const platform = String(account.platform);
							const username = String(account.platform_username || platform);
							const expired = account.status === 'expired' ? ' (reconnect needed)' : '';
							return {
								name: `${username}${expired} - ${platformName(platform)}`,
								value: String(account.id),
							};
						})
				);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let result: IDataObject | IDataObject[];

				if (resource === 'account') {
					const platform = this.getNodeParameter('platform', i, '') as string;
					const data = await fuxuxApiRequest.call(this, 'GET', '/api/accounts');
					const accounts = (data.accounts as IDataObject[] | undefined) ?? [];
					result = platform ? accounts.filter((account) => account.platform === platform) : accounts;
				} else if (operation === 'create') {
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const overrides =
						((options.overrides as IDataObject | undefined)?.caption as
							| CreatePostInput['overrides']
							| undefined) ?? [];
					let body: IDataObject;
					try {
						body = buildCreatePostBody({
							mode: this.getNodeParameter('mode', i) as CreatePostInput['mode'],
							platforms: this.getNodeParameter('platforms', i, []) as string[],
							caption: this.getNodeParameter('caption', i, '') as string,
							overrides,
							scheduledAt: this.getNodeParameter('scheduledAt', i, '') as string,
							mediaUrls: (options.mediaUrls as string[] | undefined) ?? [],
							note: (options.note as string | undefined) ?? '',
							accountId: (options.accountId as string | undefined) ?? '',
						}) as unknown as IDataObject;
					} catch (error) {
						throw new NodeOperationError(this.getNode(), (error as Error).message, {
							itemIndex: i,
						});
					}
					result = await fuxuxApiRequest.call(this, 'POST', '/api/posts', {}, body);
				} else if (operation === 'get') {
					const postId = this.getNodeParameter('postId', i) as string;
					result = await fuxuxApiRequest.call(
						this,
						'GET',
						`/api/posts/${encodeURIComponent(postId)}`,
					);
				} else if (operation === 'delete') {
					const postId = this.getNodeParameter('postId', i) as string;
					const data = await fuxuxApiRequest.call(
						this,
						'DELETE',
						`/api/posts/${encodeURIComponent(postId)}`,
					);
					result = { deleted: true, id: postId, ...data };
				} else if (operation === 'update') {
					const postId = this.getNodeParameter('postId', i) as string;
					const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
					const body: IDataObject = {};
					if (fields.scheduledAt) {
						const when = new Date(fields.scheduledAt as string);
						if (Number.isNaN(when.getTime())) {
							throw new NodeOperationError(this.getNode(), '"Scheduled At" is not a valid date.', {
								itemIndex: i,
							});
						}
						body.scheduled_at = when.toISOString();
					}
					const mediaUrls = ((fields.mediaUrls as string[] | undefined) ?? [])
						.map((url) => (typeof url === 'string' ? url.trim() : ''))
						.filter(Boolean)
						.slice(0, 4);
					if (mediaUrls.length) body.media_urls = mediaUrls;
					const variants = (
						((fields.variants as IDataObject | undefined)?.variant as IDataObject[] | undefined) ??
						[]
					).filter((variant) => variant.id && typeof variant.content === 'string');
					if (variants.length) {
						body.variant_updates = variants.map((variant) => ({
							id: variant.id,
							content: variant.content,
						}));
					}
					if (!Object.keys(body).length) {
						throw new NodeOperationError(
							this.getNode(),
							'Add at least one field to update: a new time, new media or a new caption.',
							{ itemIndex: i },
						);
					}
					result = await fuxuxApiRequest.call(
						this,
						'PATCH',
						`/api/posts/${encodeURIComponent(postId)}`,
						{},
						body,
					);
				} else {
					const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
					const limit = returnAll ? 2000 : (this.getNodeParameter('limit', i, 50) as number);
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const qs: IDataObject = {};
					if (filters.status && filters.status !== 'all') qs.status = filters.status;
					if (filters.month) qs.month = filters.month;
					if (filters.order) qs.order = filters.order;
					result = await fuxuxListPosts.call(this, qs, limit);
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(result),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Requests already fail with a NodeApiError (see shared/transport.ts)
				// and field problems with a NodeOperationError; anything else is ours.
				throw error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
