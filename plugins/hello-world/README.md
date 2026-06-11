# hello-world

Minimal example plugin. Registers one tool (`hello_world`) and one hook
(`beforePrompt`) that appends a marker line to the system prompt.

Use it as the template for your own plugins — see `docs/PLUGINS.md`.

```
> use the hello_world tool to greet Nandan
  ⟳ hello_world… ✓
Hello, Nandan — from the hello-world plugin!
```

Disable with `/plugins disable hello-world`.
