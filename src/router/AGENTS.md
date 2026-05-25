# `src/router`

This folder contains generic mobile route state and browser-history integration.

Routes describe where the mobile shell is, not how a specific game system works.

## Boundary Rules

- Router code must not import from any system in `src/systems/` or any other concrete system folder.
- Router code must not hard-code concrete system pane names, action names, template paths, or data paths.
- Character pane ids are opaque route state. Only the active system adapter may normalize, interpret, or assign system meaning to them.
- Permission checks must flow through generic route permission contracts, not concrete system logic.

## Allowed Responsibilities

- Define generic mobile route shapes.
- Maintain internal navigation history.
- Serialize and restore browser hash/history state.
- Preserve generic state such as selected pane id, drawer id, search query, focused result, and scroll position.

## Not Allowed

- System-specific route branching.
- Concrete pane ordering or swipe behavior.
- System-specific document lookup rules beyond generic UUID/permission contracts.
