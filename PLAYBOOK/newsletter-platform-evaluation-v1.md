# GEO-Pulse Newsletter Platform Evaluation V1

Last updated: 2026-03-31

## Purpose

Evaluate the first newsletter-platform target for the GEO-Pulse content machine.

This evaluation is based on the current planning assumptions:
- canonical long-form content should live on GEO-Pulse first
- newsletter is the first downstream distribution channel
- posting should be automated through API
- the workflow should stay lean
- GEO-Pulse should not depend on manually logging into a newsletter tool to publish

## Current recommendation

**Recommended first target: Kit**

**Recommended second option: Ghost**

**Do not choose first for lean V1: beehiiv or Mailchimp**

## Current implementation status

The recommendation above is still the architectural recommendation.

Current repo truth is now:
- Kit is implemented as a downstream draft-push adapter
- Ghost is also implemented as a downstream draft-push adapter
- GEO-Pulse remains the canonical source of truth
- neither provider is the on-site blog or canonical article surface

So this document should now be read as:
- Kit remains the preferred first newsletter-default for the current site-first model
- Ghost is no longer theoretical; it is the second working adapter in the repo
- the unresolved decision is not "can we integrate Ghost?"
- the unresolved decision is whether Ghost should remain only a downstream destination or later become a larger publishing surface decision

## Why Kit is the best first fit

Kit fits the current GEO-Pulse workflow better than the alternatives because:

- it supports API creation of broadcasts
- it supports drafts and scheduling
- it supports public web publication for a broadcast
- it can work as a downstream newsletter layer without forcing GEO-Pulse to move canonical content out of the app

Current official docs show:
- `POST /v4/broadcasts` with `X-Kit-Api-Key` auth
- HTML content input
- `public: true` support
- scheduling via `send_at`
- returned `public_url`

That makes it a good fit for:
- creating a newsletter issue from a GEO-Pulse article
- scheduling it
- optionally publishing a public version
- keeping GEO-Pulse as the source of truth

## Why Ghost is the strongest alternative

Ghost is the strongest option if GEO-Pulse later decides:
- not to build the blog directly inside the current app
- or to use a dedicated publishing system for both site content and newsletter delivery

Ghost is strong because:
- it has a mature Admin API for posts
- it has built-in newsletters
- it supports multiple newsletters
- it can act as both website and newsletter system

The tradeoff:
- Ghost is best when it becomes the publishing system itself
- that is a bigger architectural decision than "add a newsletter integration"
- it risks colliding with the current site-first app-linked content direction unless GEO-Pulse explicitly chooses Ghost as the content surface

## Why beehiiv should not be first

beehiiv is attractive in theory, but the current API/docs create a mismatch for lean V1:

- the `Create post` endpoint is marked beta
- that endpoint is explicitly available only to Enterprise users
- beehiiv’s own support docs emphasize a workflow where beehiiv is the source and content is sent outward to a CMS

That is the opposite of the current GEO-Pulse design, where the app/site should remain canonical.

Conclusion:
- beehiiv may be worth revisiting later
- it is a poor first fit for this lean, app-driven, site-first system

## Why Mailchimp should not be first

Mailchimp has strong campaign APIs, but it is not a natural fit for the GEO-Pulse content-machine shape.

Mailchimp is strongest for:
- email campaigns
- lists
- templates
- broader email marketing operations

It is weaker for:
- newsletter-as-publication workflows
- public post surfaces
- site-first editorial publishing tied to a canonical article model

Conclusion:
- Mailchimp is viable if GEO-Pulse later wants classic email marketing infrastructure
- it is not the best first tool for a newsletter-first publication workflow

## Comparison

| Platform | API publish fit | Draft/schedule fit | Public post fit | Site-first compatibility | Lean V1 fit | Verdict |
|----------|-----------------|-------------------|-----------------|--------------------------|-------------|---------|
| Kit | Strong | Strong | Strong enough | Strong | Strong | Best first target |
| Ghost | Strong | Strong | Strong | Medium | Medium | Best alternative if Ghost becomes content system |
| beehiiv | Limited for this use case | Medium | Strong if beehiiv is source | Weak | Weak | Not first |
| Mailchimp | Medium | Strong | Weak | Medium | Weak | Not first |

## Official-source notes

### Kit

Official Kit docs show a `Create a broadcast` endpoint on `POST /v4/broadcasts` that accepts:
- HTML `content`
- `public`
- `published_at`
- `send_at`
- API-key auth

The response includes a `public_url`.

### Ghost

Official Ghost docs show:
- Admin API post creation
- built-in email newsletters
- multiple newsletters support

Ghost is excellent if the content surface itself is Ghost.

### beehiiv

Official beehiiv docs show:
- `Create post` exists
- it is currently in beta
- it is available only to Enterprise users

beehiiv support docs also document sending beehiiv posts to an external CMS, which reinforces a beehiiv-first source-of-truth model.

### Mailchimp

Official Mailchimp docs show:
- campaign creation APIs
- campaign-content APIs
- template and sending-domain management

This is useful for campaign operations, but it is not the cleanest match for a canonical content + newsletter-publication workflow.

## Recommendation statement

If GEO-Pulse keeps the current architecture assumption that:
- the app/site is canonical
- the blog should live on GEO-Pulse
- newsletter is a downstream distribution layer

then **Kit should be the first integration target**.

If GEO-Pulse later decides:
- the canonical publishing surface should be a dedicated content platform rather than the app

then **Ghost should be the first platform reconsidered**.

## Next implementation implication

If Kit remains the first target for default newsletter operations, the next implementation path should be:

1. create canonical article in GEO-Pulse
2. generate newsletter variant from same brief
3. push newsletter draft/broadcast to Kit via API
4. optionally push the same canonical asset into Ghost when that destination is enabled
5. store platform post ID / URL back in GEO-Pulse metadata

## Sources

- beehiiv developer docs: Create post
- beehiiv support docs: sending posts to an external CMS
- Kit developer docs: create a broadcast
- Ghost developer docs: Admin API + newsletters
- Mailchimp developer docs: campaigns + campaign content
