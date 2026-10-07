# Publication hosts

Publications are allowlisted in `content/streams.json`. For each one:

- `home` is a bare https origin: no path, port, query or credentials.
- `feed` is exactly `<home>/feed`.
- An item's link must be on that host exactly, so no apex, subdomain, port or look-alike host passes.
- A redirect from the feed is treated as a failure and never followed.

Today the publications live on their substack.com hosts.

## Moving a publication to its custom domain

When a publication's custom `www` host is live, change both of its fields in one pull request:

- `home` becomes `https://www.<host>`.
- `feed` becomes `https://www.<host>/feed`.

Once that change is deployed, posts still linked on the old substack.com host are dropped.

A publication stays hidden until its `enabled` is `true`. Incentive Eyes stays disabled until Matthew says it is public.
