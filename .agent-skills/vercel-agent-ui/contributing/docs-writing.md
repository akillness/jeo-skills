# Writing Website Docs

Write like you're explaining the API to a friend who hasn't used it yet. Start with what it does, show how to use it, and explain what happens. Use the current pages as references for the voice and structure appropriate to each page type.

## Start from a Current Page

Use [Build a Component](../apps/docs/content/docs/core/build-a-component.mdx) as the main reference for the voice. It starts with something you can try:

> Let's start with a toggle button. Press **Mute** to turn it on. Press it again to turn it off.

It explains each concept when the example needs it, then moves to the next step: “That's the whole behavior. Now let's put it on the page.” Keep that plain, conversational tone across the docs, while choosing a structure that fits the page.

Read the page you're changing and choose a reference for the kind of explanation it needs:

- [First Component](../apps/docs/content/docs/react/first-component.mdx) for a short framework walkthrough: create a component, render it, and style its state. Each step explains what the reader should see.
- [Focus and Keys](../apps/docs/content/docs/core/behaviors/focus.mdx) for behavior documentation: explain one interaction with a short snippet, then let the reader try it in a demo with instructions below.
- [Select](../apps/docs/content/docs/react/components/select.mdx) for a component page: introduce its parts, show how they work together, and explain useful behaviors and compositions.
- [Connect an Agent's Guide](../apps/docs/content/docs/agents/connect-an-agent/guide.mdx) for a complete walkthrough: carry one example from setup to a working result, with actions the reader can follow.
- [Storage](https://github.com/vercel-labs/ui/blob/551810b9a6119ff30dd3d98c27be7f5db371c405/apps/docs/content/docs/core/storage.mdx) for helper documentation: explain the choices, return values, and limitations where they affect use.

[Preferences](../apps/docs/content/docs/core/behaviors/preferences.mdx) is a supporting reference for introducing a general helper before a specialized use, and for a code-only example that defines a value in one file and reads it in another. [Permissions](../apps/docs/content/docs/agents/connect-an-agent/permissions.mdx) shows how a follow-up page can reuse the Guide's example without repeating setup.

Use these as writing references. API explanations still need to match the current implementation.

## Get to the Point

Choose an opening that fits what the reader came to do:

- **Tutorials** can start with what you'll build and let the reader try it, as Build a Component does. Introduce the API through that example.
- **Helper pages** can start with the helper's job and why someone would use it. Storage starts with: “Use the storage helpers to save a value and read it back later.”
- **Component pages** can show the component immediately, with a short explanation of when to use it and what it handles.

The frontmatter `description` starts with a verb and says what the reader can do, such as “Choose one value or several from a popup list.” Let the opening add context instead of repeating it. Use the same conversational voice while choosing an opening that fits the page.

## Explain One Thing at a Time

- Use familiar words, contractions, and short paragraphs. Name the helper and say what it does. Skip marketing claims, rhetorical openings, and invented scenarios that delay the explanation.
- Introduce a term when the reader needs it. Use **behavior** for a building block and **primitive** for the definition that brings a component's state, actions, and parts together.
- When describing what `@ui-sdk/core` provides, call it **building blocks** or **behaviors**. Describe the components through what they do rather than as a styled component library.
- Walkthroughs can use “we” and “let's” while building one example. Helper, behavior, and component pages usually address the reader directly: “Use X to…” or “Pass Y when…”.
- Use Title Case for titles and headings. Preserve identifiers such as `createPreference` exactly.
- Prefer periods, commas, or parentheses to em-dashes.
- Explain the action before the code, then describe the result or a relevant limit after it. Include defaults, return values, timing, and cleanup when they change how someone uses the API.

## Put Links Where They Help

Introduce another page as part of the explanation or next action. Storage connects to Preferences like this:

> For a user preference, such as a theme or sidebar state, pass a storage to `createPreference`.

The helper name links to its persistence section. Prefer this contextual phrasing in explanations: introduce the task or concept, then link where it helps. A closing “Keep Going” list can name pages and say what the reader will find there. Existing page-name links beside a relevant feature can stay; their presence alone is not a reason to rewrite approved prose.

Link to a guide for concepts already taught there. Add the detail this page needs instead of repeating the guide's setup or walkthrough. Keep the language useful to people and agents alike; contributor instructions belong outside public prose pages.

## Keep Examples Small

Each example should teach one behavior or a useful composition. Start with the smallest working use, then introduce additional options when they solve a specific need. Show the general helper before a specialized helper built on it.

Use file titles when the reader defines something in one file and imports it in another, such as `sidebar-preference.ts` and `sidebar.tsx`. Include imports in complete examples. For partial snippets, explain in the lead-in where they belong, what existing values they use, and what is omitted. Explain the code in the surrounding prose rather than comments inside examples.

After a block introduces several names, a short list can explain each one, as Build a Component does with `state`, `api`, and `slots`. When a step changes an earlier file, show the file again with its title and highlighted changes, or show only the new option and say where it goes. Describe return values in the sentence after the code.

Choose the format by what the reader needs to learn:

- **Code** when a snippet makes the result clear, such as setup, a server read, or reading and writing a preference. A saved sidebar state can be explained without building a sidebar demo.
- **Live demos** when trying the behavior makes it clearer: keyboard navigation, focus, selection, pending states, or a choice that survives a reload. Put instructions in the demo's `caption`, below it, with the action and expected result. For example: “Type a note and reload. Switch storage types, or open another tab, to see which values carry over.”

In prose, bold visible labels when it helps identify what to press or look for. Name keys consistently, such as Enter, Space, and Shift+Tab. The `caption` prop is plain text, so use plain labels there rather than Markdown formatting.

Component docs show what people can build and how it behaves. They aren't a design-system catalog: omit examples whose only difference is a visual variant, size, or decorative icon. An icon or color is useful when it explains behavior, such as a pending indicator or a color-scheme preference.

Don't mention the icon library the examples use, and don't add an install step for it. The components are headless, and the icons are part of the example, not the API.

When changing demos, follow [the example styling guide](examples.md).

## Keep Each Page Focused

- **Core** explains building blocks and how to combine them. Framework snippets belong where they help use a shared feature; broader rendering setup belongs in the framework guide.
- **Framework guides** cover installation, first use, rendering, and framework-specific integration.
- **Component pages** explain behavior, state, and composition. Show the same behavior across frameworks while keeping each framework's code idiomatic.
- **Agent guides** distinguish building with an agent from connecting an agent to a UI. Reuse the established walkthrough rather than starting a new app on every page.

For a new component page, start from the usual outline: a short introduction and demo, Installation, Composition, Usage, Build Your Own where it applies, one section per example, Custom Rendering, Styling, Data Attributes, API Reference, and Accessibility. Adapt it to the component: a simple Button can use Usage and direct behavior headings; a component with several parts benefits from Composition. Preserve useful existing variations rather than adding empty sections to match the outline.

- **Composition** shows only how the parts nest: one line, "Use the following composition to build an `Accordion`:", then a plain text tree of part names. Show a repeating part twice so the repetition is visible. No props, content or imports.
- **Examples** (pending review, accordion only for now): no "Examples" or "Patterns" group headings. Each example is its own `##` section with a short title, ordered from simplest to most involved. Keep an old anchor with `<span id="…" />` when a title changes.
- **Build Your Own** comes right after Composition, only when a `createParts` call reproduces the ready-made parts (accordion, alert dialog, autocomplete, avatar); pages like button and calendar, whose adapters add behavior, leave it out: one sentence saying the component's real import path (such as `@ui-sdk/react/accordion`) ships a ready-made component and you can build your own with your own names from the core primitive, a `createParts` block that renames the parts, a short usage block, and links to Rendering and Custom Parts.
- **Styling** explains how to style the parts, then gives each part that carries CSS variables its own `### PartName [#styling-partname]` heading (the element name on web components pages) with `<CssVariables component="…" part="…" />` below it, in API Reference order. It has no CSS code snippets. Any CSS snippet elsewhere, like in Animation, goes in `<StyleTabs>` with the Tailwind version beside it.
- **Data Attributes** follows Styling: each part with data attributes gets a `### PartName [#data-attributes-partname]` heading with `<DataAttributes component="…" part="…" />`, which shows its `[data-slot]` once and its attributes. The `[#…]` anchors keep these headings from taking the API Reference entries' anchors. `css-variables.test.ts` fails when a part that core gives variables or attributes has no section.
- Component pages have no right-to-left section for now.
- **API Reference** lists the parts in markup order, then State, Reasons, Controller and Events.

Demo content should read like a real product: a trigger never repeats the label inside its panel, and at least one panel shows more than one paragraph.

Use a table when it makes choices easier to compare. Keep API references focused on the SDK's options, methods, states, and attributes. Explain browser defaults only when they affect the example; don't reproduce inherited browser APIs or tuck an exhaustive duplicate into a “Full API” collapsible. Generated API table descriptions come from source JSDoc. When they disagree with the prose, reconcile both with the implementation.

## Check the Result

Read the page in order: can someone understand the helper's purpose, use the example, and tell what happens next without unexplained names or repeated setup?
