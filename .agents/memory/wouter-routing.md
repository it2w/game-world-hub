---
name: wouter v3 layout routing
description: How to wrap authenticated pages in a shared layout with wouter v3 without breaking every sub-route into a 404.
---

# wouter v3 layout / nested routing

**Rule:** to render a shared layout (e.g. `<Shell>`) around many authenticated
pages, wrap the inner `<Switch>` in a **pathless** `<Route>` (matches everything
not already handled), not a `<Route path="/">`.

```tsx
<Switch>
  <Route path="/login" component={Login} />
  <Route path="/register" component={Register} />
  <Route>                     {/* pathless = matches all remaining paths */}
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/friends" component={Friends} />
        {/* ... */}
        <Route component={NotFound} />
      </Switch>
    </Shell>
  </Route>
</Switch>
```

**Why:** in wouter v3, `<Route path="/">` matches the home path *exactly*. If you
put the layout + inner switch under `<Route path="/">`, then only `/` renders;
every other path (`/friends`, `/parties`, …) fails the outer match and falls to
the NotFound fallback — so clicking any nav link shows "404 Page Not Found". This
actually shipped and broke all navigation.

**Why not `nest`:** `<Route path="/" nest>` fixes matching, but it also sets a
nested router base, and absolute `<Link href="/friends">` links resolve against
that base — easy to get subtly wrong. A pathless catch-all keeps the inner
`<Switch>` operating on the same location, so absolute hrefs just work.

**How to apply:** any time you add a shared authenticated shell/layout in a
wouter app, use the pathless catch-all pattern above.
