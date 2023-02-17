import type { FormattedExecutionResult } from 'graphql';

export interface GraphiQLData {
  query?: string | null;
  variables?: { readonly [name: string]: unknown } | null;
  operationName?: string | null;
  result?: FormattedExecutionResult;
}

export interface GraphiQLOptions {
  /**
   * An optional GraphQL string to use when no query is provided and no stored
   * query exists from a previous session.  If undefined is provided, GraphiQL
   * will use its own default query.
   */
  defaultQuery?: string;

  /**
   * An optional boolean which enables the header editor when true.
   * Defaults to false.
   */
  headerEditorEnabled?: boolean;

  /**
   * An optional boolean which enables headers to be saved to local
   * storage when true.
   * Defaults to false.
   */
  shouldPersistHeaders?: boolean;

  /**
   * A websocket endpoint for subscription
   */
  subscriptionEndpoint?: string;

  /**
   * websocket client option for subscription, defaults to v0
   * v0: subscriptions-transport-ws
   * v1: graphql-ws
   */
  websocketClient?: string;

  /**
   * By passing an object you may change the theme of GraphiQL.
   */
  editorTheme?: EditorThemeParam;
}

type EditorThemeParam =
  | {
      name: string;
      url: string;
    }
  | string;

type EditorTheme = {
  name: string;
  link: string;
};

// Current latest version of codeMirror.
const CODE_MIRROR_VERSION = '5.53.2';

// Ensures string values are safe to be used within a <script> tag.
function safeSerialize(data: string | boolean | null | undefined): string {
  return data != null
    ? JSON.stringify(data).replace(/\//g, '\\/')
    : 'undefined';
}

// Implemented as ts-node transformation, see ../resources/load-statically-from-npm.js
declare function loadFileStaticallyFromNPM(npmPath: string): string;

function getEditorThemeParams(
  editorTheme: EditorThemeParam | undefined | null,
): EditorTheme | undefined {
  if (editorTheme == null) {
    return;
  }
  if (typeof editorTheme === 'string') {
    return {
      name: editorTheme,
      link: `<link href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/${CODE_MIRROR_VERSION}/theme/${editorTheme}.css" 