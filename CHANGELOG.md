# Changelog

All notable changes to this project will be documented in this file.

## [14.11.5] - Save/connection feedback

- Added save/connection feedback, duplicate prevention, recovery, and draft protection.

## [14.11.4] - Move system-specific sheet behavior out of core and shared services

- Moved picker and item-detail interpretation into adapters.
- Preserved D&D controls, permissions, and unsupported-system navigation.
- Added behavioral coverage with a synthetic adapter.

## [14.11.3] - 39-separate-recents-persistence-from-rendering-and-expose-failed-setting-writes

- Recents now record navigation without blocking rendering. The shared storage fix also prevents overlapping favorites updates from losing data and exposes failed saves.
- Version update

## [14.11.2] - Just some restructuring and more tests

- Just some restructuring and more tests

## [14.11.1] - Prevent stale asynchronous renders

- Stale render fix

## [14.11.0] - Inventory Management

- Create, rename and delete bags.
- Move items between bags and main inventory, with nesting safeguards.
- Add world/compendium items with an initial quantity.
- Explicit deletion confirmation with choices for contained items.
- Muted zero-quantity items with “Out of stock” and usable quantity controls.

## [14.10.0] - Using generated Foundry VTT types for type safety

- Module now uses generated Foundry VTT types.

## [14.9.1] - Characters in folders with additional subfolders cant be selected

- Fixed characters being not openable when further subfolders exist.
- Fixed permission bug related to the LIMITED permission.

## [14.9.0] - Persist user favorites and recents server side

- Favorites, Recents and Favorite Characters are now saved in Foundry instead of local storage.
- Added logout button to Settings.

## [14.8.1] - Entrytype may not use system-specific types outside a system

- Removed static dnd5e item type reference from global search.

## [14.8.0] - Upgrade to typescript 6.x

- Upgraded Typescript version to 6.x.

## [14.7.0] - Initial Version

- Initial release of Pocket Foundry for Foundry VTT v14.
- Added the mobile shell with bottom navigation, route history, touch-friendly navigation and in-shell settings.
- Added character picker support with favorite characters.
- Added the D&D 5e character sheet adapter with Inventory, Features, Spells, Effects, Details, and Biography panes.
- Added mobile content views for search, recents, item details, journal browsing, journal entries, journal pages, and combat.
- Added player-focused combat visibility handling, including optional support for the `inverted-encounter-visibility` module flag when that module is active.
- Added settings for Mobile View, Character Sheet Banner, and Color-Blind Mode.
