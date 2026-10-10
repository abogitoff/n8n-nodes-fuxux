// The platform ids the Fuxux API accepts, in alphabetical order by name (the
// n8n linter wants option lists sorted). Reddit is left out on purpose: Reddit
// posts are created in the Fuxux web app only, and the API refuses them.
export const PLATFORMS = [
	{ name: 'Bluesky', value: 'bluesky' },
	{ name: 'Discord', value: 'discord' },
	{ name: 'Facebook', value: 'facebook' },
	{ name: 'Instagram', value: 'instagram' },
	{ name: 'Kick', value: 'kick' },
	{ name: 'LinkedIn', value: 'linkedin' },
	{ name: 'Pinterest', value: 'pinterest' },
	{ name: 'Threads', value: 'threads' },
	{ name: 'TikTok', value: 'tiktok' },
	{ name: 'Twitch', value: 'twitch' },
	{ name: 'X (Twitter)', value: 'twitter' },
	{ name: 'YouTube', value: 'youtube' },
] as const;

export const PLATFORM_IDS: readonly string[] = PLATFORMS.map((platform) => platform.value);

export function platformName(id: string): string {
	return PLATFORMS.find((platform) => platform.value === id)?.name ?? id;
}
