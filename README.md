# n8n-nodes-fuxux

This is an n8n community node. It lets you use [Fuxux](https://www.fuxux.com) in your n8n workflows.

Fuxux is a social media scheduler. You write a post once and it goes out to Instagram, TikTok, YouTube, LinkedIn, X, Facebook, Threads, Bluesky, Pinterest, Discord, Kick and Twitch, each with its own caption if you want one.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `n8n-nodes-fuxux`.

## Operations

### Fuxux node

**Post**

- **Create**: publish now, schedule for later, or save a draft. Pick the platforms and write one caption for all of them, or give a platform its own caption under Options.
- **Get**: one post, with the result on each platform.
- **Get Many**: list posts, filtered by status (scheduled, published, draft, failed) or by month.
- **Update**: move a scheduled post to another time, or change its captions or media.
- **Delete**: remove a post.

**Connected Account**

- **Get Many**: the social accounts connected in Fuxux, optionally for one platform.

The node can also be used as a tool by an n8n AI Agent.

### Fuxux Trigger node

Checks Fuxux on the schedule you set and starts the workflow for each new post.

- **Post Published**: a post went out on at least one platform.
- **Post Failed**: a post failed on at least one platform, including posts that went out on some platforms and failed on others. `failed_platforms` and `failed_reasons` say where and why.

When you switch a workflow on, posts that already exist are not replayed: only posts published or failed from then on start it.

## Credentials

You need a Fuxux account and an API key.

1. In Fuxux, connect the social accounts you want to post to.
2. Open the **API keys** page and create a key. It starts with `fx_live_` and is shown only once, so copy it straight away.
3. In n8n, create a **Fuxux API** credential and paste the key.

API keys need the API add-on, which is available on any paid Fuxux plan. Use a separate key for n8n, so you can revoke it without disconnecting anything else.

## Compatibility

Built against n8n nodes API version 1 with `@n8n/node-cli`. It has no runtime dependencies.

## Usage

- **Instagram** needs at least one media URL.
- **Media URLs** must be public `https` links. Up to four are used.
- **Videos with "Publish Now"** are handed to the Fuxux scheduler and go out a couple of minutes later, so the workflow does not wait for the upload. Use the Fuxux Trigger node to react to the result.
- **TikTok videos** arrive in your TikTok inbox, and you finish them in the TikTok app.
- **X** needs a paid Fuxux plan.
- **Reddit** is not available through this node. Reddit posts are created in the Fuxux web app.
- **Several accounts on one platform?** Pick the account under Options, and keep a caption for that platform only.
- **Polling**: the trigger asks for one page of posts per check. Checking every few minutes is plenty; Fuxux limits how often a key may ask.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Fuxux API reference](https://www.fuxux.com/reference)
- [Fuxux support](https://www.fuxux.com/support)

## Version history

- **0.1.0**: first release. Post (create, get, get many, update, delete), Connected Account (get many), and the Fuxux Trigger node (post published, post failed).
