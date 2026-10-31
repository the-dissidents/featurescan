# General requirements

Preferred languages are TypeScript and Rust. I think TypeScript suffices here. If you really want to use Python you must use `uv`, but I recommend against Python in general.

You must use `pnpm` instead of `npm`, `rg` instead of `grep`. For TS bundlers, use `rolldown` or related tools.

Put your notes and reports etc in `agent-documents`. However, when consulting that folder, keep in mind that the contents may well be outdated.

# The project

Your goal is to design and develop a CLI tool that scans a *built* static website or HTML/JS-based desktop app and outputs a catalog (or "manifest") of HTML/CSS/JS features used in it, which can in turn be used at runtime to self-check whether anything might be broken on the user's environment.

Similar projects exist, but they're often limited to a single language, are limited in detection mechanisms, and only work at development time (unavailable as a runtime check).

I think you can use MDN's `browser-compat-data` package for compatibility data. HTML and CSS are presumably easier, but scanning JS/TS can be only done crudely without type infos (however you can scan for WebAPIs etc which is simpler)

For advanced usage the tool might not strictly run on built artifacts, and might employ typed ESLint with custom plugins to check TypeScript sources etc. (cf. `https://github.com/amilajack/eslint-plugin-compat`, but idk if it uses typed linting), but this is currently not prioritized.