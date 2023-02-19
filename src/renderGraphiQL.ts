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
      link: `<link href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/${CODE_MIRROR_VERSION}/theme/${editorTheme}.css" rel="stylesheet" />`,
    };
  }
  if (
    typeof editorTheme === 'object' &&
    editorTheme.name &&
    typeof editorTheme.name === 'string' &&
    editorTheme.url &&
    typeof editorTheme.url === 'string'
  ) {
    return {
      link: `<link href="${editorTheme.url}" rel="stylesheet" />`,
      name: editorTheme.name,
    };
  }
  throw Error(
    'invalid parameter "editorTheme": should be undefined/null, string or ' +
      `{name: string, url: string} but provided is "${
        typeof editorTheme === 'object'
          ? JSON.stringify(editorTheme)
          : editorTheme
      }"`,
  );
}

/**
 * When express-graphql receives a request which does not Accept JSON, but does
 * Accept HTML, it may present GraphiQL, the in-browser GraphQL explorer IDE.
 *
 * When shown, it will be pre-populated with the result of having executed the
 * requested query.
 */
export function renderGraphiQL(
  data: GraphiQLData,
  options?: GraphiQLOptions,
): string {
  const queryString = data.query;
  const variablesString =
    data.variables != null ? JSON.stringify(data.variables, null, 2) : null;
  const resultString =
    data.result != null ? JSON.stringify(data.result, null, 2) : null;
  const operationName = data.operationName;
  const defaultQuery = options?.defaultQuery;
  const headerEditorEnabled = options?.headerEditorEnabled;
  const shouldPersistHeaders = options?.shouldPersistHeaders;
  const subscriptionEndpoint = options?.subscriptionEndpoint;
  const websocketClient = options?.websocketClient ?? 'v0';
  const editorTheme = getEditorThemeParams(options?.editorTheme);

  let subscriptionScripts = '';
  if (subscriptionEndpoint != null) {
    if (websocketClient === 'v1') {
      subscriptionScripts = `
      <script>
        ${loadFileStaticallyFromNPM('graphql-ws/umd/graphql-ws.js')}
      </script>
      <script>
      ${loadFileStaticallyFromNPM(
        'subscriptions-transport-ws/browser/client.js',
      )}
      </script>
      `;
    } else {
      subscriptionScripts = `
      <script>
        ${loadFileStaticallyFromNPM(
          'subscriptions-transport-ws/browser/client.js',
        )}
      </script>
      <script>
        ${loadFileStaticallyFromNPM(
          'subscriptions-transport-ws/browser/client.js',
        )}
      </script>
      <script>
        ${loadFileStaticallyFromNPM(
          'graphiql-subscriptions-fetcher/browser/client.js',
        )}
      </script>
      `;
    }
  }

  return `<!--
The request to this GraphQL server provided the header "Accept: text/html"
and as a result has been presented GraphiQL - an in-browser IDE for
exploring GraphQL.
If you wish to receive JSON, provide the header "Accept: application/json" or
add "&raw" to the end of the URL within a browser.
-->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GraphiQL</title>
  <meta name="robots" content="noindex" />
  <meta name="referrer" content="origin" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      margin: 0;
      overflow: hidden;
    }
    #graphiql {
      height: 100vh;
    }
  </style>
  <style>
    /* graphiql/graphiql.css */
    ${loadFileStaticallyFromNPM('graphiql/graphiql.css')}
  </style>
  ${editorTheme ? editorTheme.link : ''}
  <script>
    // promise-polyfill/dist/polyfill.min.js
    ${loadFileStaticallyFromNPM('promise-polyfill/dist/polyfill.min.js')}
  </script>
  <script>
    // unfetch/dist/unfetch.umd.js
    ${loadFileStaticallyFromNPM('unfetch/dist/unfetch.umd.js')}
  </script>
  <script>
    // react/umd/react.production.min.js
    ${loadFileStaticallyFromNPM('react/umd/react.production.min.js')}
  </script>
  <script>
    // react-dom/umd/react-dom.production.min.js
    ${loadFileStaticallyFromNPM('react-dom/umd/react-dom.production.min.js')}
  </script>
  <script>
    // graphiql/graphiql.min.js
    ${loadFileStaticallyFromNPM('graphiql/graphiql.min.js')}
  </script>
  ${subscriptionScripts}
</head>
<body>
  <div id="graphiql">Loading...</div>
  <script>
    // Collect the URL parameters
    var parameters = {};
    window.location.search.substr(1).split('&').forEach(function (entry) {
      var eq = entry.indexOf('=');
      if (eq >= 0) {
        parameters[decodeURIComponent(entry.slice(0, eq))] =
          decodeURIComponent(entry.slice(eq + 1));
      }
    });
    // Produce a Location query string from a parameter object.
    function locationQuery(params) {
      return '?' + Object.keys(params).filter(function (key) {
        return Boolean(params[key]);
      }).map(function (key) {
        return encodeURIComponent(key) + '=' +
          encodeURIComponent(params[key]);
      }).join('&');
    }
    // Derive a fetch URL from the current URL, sans the GraphQL parameters.
    var graphqlParamNames = {
      query: true,
      variables: true,
      operationName: true
    };
    var otherParams = {};
    for (var k in parameters) {
      if (parameters.hasOwnProperty(k) && graphqlParamNames[k] !== true) {
        otherParams[k] = parameters[k];
      }
    }
    var fetchURL = locationQuery(otherParams);
    // Defines a GraphQL fetcher using the fetch API.
    function graphQLFetcher(graphQLParams, opts) {
      return fetch(fetchURL, {
        method: 'post',
        headers: Object.assign(
          {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          opts && opts.headers,
        ),
        body: JSON.stringify(graphQLParams),
        credentials: 'include',
      }).then(function (response) {
        return response.json();
      });
    }

    function makeFetcher() {
      if('${typeof subscriptionEndpoint}' == 'string') {
        let client = null;
        let url = window.location.href;
        if('${typeof websocketClient}' == 'string' && '${websocketClient}' === 'v1') {
          client = window.graphqlWs.createClient({url: ${safeSerialize(
            subscriptionEndpoint,
          )} });
          return window.GraphiQL.createFetcher({url, wsClient: client});
        } else {
          let clientClass = window.SubscriptionsTransportWs.SubscriptionClient;
          client = new clientClass(${safeSerialize(subscriptionEndpoint)}, {
            reconnect: true
          });
          return window.GraphiQL.createFetcher({url, le