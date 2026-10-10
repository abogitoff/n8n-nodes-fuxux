import type {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { fuxuxListPosts } from './shared/transport';
import { hasFailure, pickNew, queryFor, toItem, type TriggerEvent } from './shared/triggerEvents';

export class FuxuxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Fuxux Trigger',
		name: 'fuxuxTrigger',
		icon: { light: 'file:../../icons/fuxux.svg', dark: 'file:../../icons/fuxux.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts a workflow when a Fuxux post is published or fails',
		defaults: {
			name: 'Fuxux Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'fuxuxApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Post Failed',
						value: 'postFailed',
						description:
							'A post failed on at least one platform. "failed_platforms" and "failed_reasons" say where and why.',
					},
					{
						name: 'Post Published',
						value: 'postPublished',
						description:
							'A post went out on at least one platform. Check "post_variants" for the result on each one.',
					},
				],
				default: 'postPublished',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as TriggerEvent;
		// One page of 50 per poll: Fuxux limits how often a key may ask.
		const posts = await fuxuxListPosts.call(this, queryFor(event), 50);

		// "Fetch test event" in the editor: show the latest matching post, and
		// leave what the live trigger remembers alone.
		if (this.getMode() === 'manual') {
			const sample = event === 'postFailed' ? posts.filter(hasFailure) : posts;
			if (!sample.length) return null;
			return [this.helpers.returnJsonArray([toItem(event, sample[0])])];
		}

		const staticData = this.getWorkflowStaticData('node');
		const { fresh, seen } = pickNew(event, posts, staticData.seen as string[] | undefined);
		staticData.seen = seen;
		if (!fresh.length) return null;
		return [this.helpers.returnJsonArray(fresh.map((post) => toItem(event, post)))];
	}
}
