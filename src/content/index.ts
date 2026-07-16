// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/content/index.ts
// Description: Public surface of the content module. Engines, path policies, and UI import
//   from 'src/content' only — the schema (types + validators), the data-access repository
//   (content/repository — memory → cache → network → bundled resolution chain), and the
//   bundled default packs. Content is data: no hardcoded lessons in components.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

export * from './schema';
export * from './repository';
export { BUNDLED_PACKS } from './bundled';
export * from './appCapabilities';
