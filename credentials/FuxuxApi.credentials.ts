import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FuxuxApi implements ICredentialType {
	name = 'fuxuxApi';

	displayName = 'Fuxux API';

	icon: Icon = { light: 'file:../icons/fuxux.svg', dark: 'file:../icons/fuxux.dark.svg' };

	documentationUrl = 'https://www.fuxux.com/reference';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create one on the API keys page in Fuxux (it starts with fx_live_). The full key is shown only once. API keys need the API add-on on a paid plan.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials?.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://www.fuxux.com',
			url: '/api/settings/profile',
			method: 'GET',
		},
	};
}
