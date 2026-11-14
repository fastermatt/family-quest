// What a parent sees: friendly switches. Each maps to a published blocklist
// and/or a small hand-picked set of domains. Nothing here is fetched yet (v0.1);
// list loading comes with the device sync in v0.2.
//
// Source status:
//  - 'curated'  = domains written by hand below. Test on the real PC before trusting.
//  - 'external' = a community list we would fetch and cache server-side. The
//                 exact file URL is NOT pinned yet, so there is none here on purpose.

export type CategoryId =
  | 'adult'
  | 'social'
  | 'gambling'
  | 'ads'
  | 'scams'
  | 'tiktok'
  | 'discord'
  | 'roblox'
  | 'twitch'
  | 'netflix'

export type Category = {
  id: CategoryId
  label: string
  description: string
  group: 'Lists' | 'Apps and sites'
  source: 'external' | 'curated'
  /** For external lists: which published list feeds it (name only; URL pinned at build time). */
  externalList?: { name: string; project: string; license: string }
  /** For curated sets: the domains, each covers its subdomains. */
  domains?: string[]
  /** On for new families? Only the gentle, uncontroversial ones. */
  defaultOn: boolean
}

export const CATEGORIES: Category[] = [
  {
    id: 'adult',
    label: 'Adult content',
    description: 'Porn and sexual content sites.',
    group: 'Lists',
    source: 'external',
    externalList: { name: 'NSFW', project: 'Hagezi DNS blocklists', license: 'GPL-3.0' },
    defaultOn: true,
  },
  {
    id: 'social',
    label: 'Social networks',
    description: 'Facebook, Instagram, X and similar. Does not include messaging or video sites.',
    group: 'Lists',
    source: 'external',
    externalList: { name: 'Social Networks', project: 'Hagezi DNS blocklists', license: 'GPL-3.0' },
    defaultOn: false,
  },
  {
    id: 'gambling',
    label: 'Gambling',
    description: 'Betting, casino and lottery sites.',
    group: 'Lists',
    source: 'external',
    externalList: { name: 'Gambling (Medium)', project: 'Hagezi DNS blocklists', license: 'GPL-3.0' },
    defaultOn: true,
  },
  {
    id: 'ads',
    label: 'Ads and trackers',
    description: 'Ad networks, trackers and pop-ups. Can break a few sites.',
    group: 'Lists',
    source: 'external',
    externalList: { name: 'Multi Normal + Pop-Up Ads', project: 'Hagezi DNS blocklists', license: 'GPL-3.0' },
    defaultOn: false,
  },
  {
    id: 'scams',
    label: 'Scams and fake stores',
    description: 'Known fake shops and scam sites.',
    group: 'Lists',
    source: 'external',
    externalList: { name: 'Fake', project: 'Hagezi DNS blocklists', license: 'GPL-3.0' },
    defaultOn: true,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'TikTok website and video servers.',
    group: 'Apps and sites',
    source: 'curated',
    domains: ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com'],
    defaultOn: false,
  },
  {
    id: 'discord',
    label: 'Discord',
    description: 'Discord chat, invites and media.',
    group: 'Apps and sites',
    source: 'curated',
    domains: ['discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.media'],
    defaultOn: false,
  },
  {
    id: 'roblox',
    label: 'Roblox',
    description: 'Roblox website and servers.',
    group: 'Apps and sites',
    source: 'curated',
    domains: ['roblox.com', 'rbxcdn.com'],
    defaultOn: false,
  },
  {
    id: 'twitch',
    label: 'Twitch',
    description: 'Twitch streams and chat.',
    group: 'Apps and sites',
    source: 'curated',
    domains: ['twitch.tv', 'ttvnw.net', 'jtvnw.net'],
    defaultOn: false,
  },
  {
    id: 'netflix',
    label: 'Netflix',
    description: 'Netflix website and video servers.',
    group: 'Apps and sites',
    source: 'curated',
    domains: ['netflix.com', 'nflxvideo.net', 'nflximg.net'],
    defaultOn: false,
  },
]

// Deliberately absent: YouTube. It is mixed use (lessons and games), so the
// review decided it is never blocked, gated or counted by a category switch.
// Steam, Xbox and Microsoft domains are absent too: blocking them breaks the games.

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[]

export function isCategoryId(x: unknown): x is CategoryId {
  return typeof x === 'string' && (CATEGORY_IDS as string[]).includes(x)
}
