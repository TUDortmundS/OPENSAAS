# GraphQL Koa Middleware

[![npm version](https://badge.fury.io/js/koa-graphql.svg)](https://badge.fury.io/js/koa-graphql)
[![Build Status](https://github.com/graphql-community/koa-graphql/workflows/CI/badge.svg?branch=main)](https://github.com/graphql-community/koa-graphql/actions?query=branch%3Amain)
[![Coverage Status](https://codecov.io/gh/graphql-community/koa-graphql/branch/main/graph/badge.svg)](https://codecov.io/gh/graphql-community/koa-graphql)

Create a GraphQL HTTP server with [Koa](https://koajs.com/).

Port from [express-graphql](https://github.com/graphql/express-graphql).

## Installation

```
npm install --save koa-graphql
```

### TypeScript

This module includes a [TypeScript](https://www.typescriptlang.org/)
declaration file to enable auto complete in compatible editors and type
information for TypeScript projects.

## Simple Setup

Mount `koa-graphql` as a route handler:

```js
const Koa = require('koa');
const mount = require('koa-mount');
const { graphqlHTTP } = require('koa-graphql');

const app = new Koa();

app.use(
  mount(
    '/graphql',
    graphqlHTTP({
      schema: MyGraphQLSchema,
      graphiql: true,
    }),
  ),
);

app.listen(4000);
```

## Setup with Koa Router

With `@koa/router`:

```js
const Koa = require('koa');
const Router = require('@koa/router');
const { graphqlHTTP } = require('koa-graphql');

const app = new Koa();
const router = new Router();

router.all(
  '/graphql',
  graphqlHTTP({
    schema: MyGraphQLSchema,
    graphiql: true,
  }),
);

app.use(router.routes()).use(router.allowedMethods());
```

## Setup with Koa v1

For Koa 1, use [koa-convert](https://github.com/koajs/convert) to convert the middleware:

```js
const koa = require('koa');
const mount = require('koa-mount'); // koa-mount@1.x
const convert = require('koa-convert');
const { graphqlHTTP } = require('koa-graphql');

const app = koa();

app.use(
  mount(
    '/graphql',
    convert.back(
      graphqlHTTP({
        schema: MyGraphQLSchema,
        graphiql: true,
      }),
    ),
  ),
);
```

## Setup with Subscription Support

```js
const Koa = require('koa');
const mount = require('koa-mount');
const { graphqlHTTP } = require('koa-graphql');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const { makeExecutableSchema } = require('graphql-tools');
const schema = makeExecutableSchema({
  typeDefs: typeDefs,
  resolvers: resolvers,
});
const { execute, subscribe } = require('graphql');
const { createServer } = require('http');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const PORT = 4000;
const app = new Koa();
app.use(
  mount(
    '/graphql',
    graphqlHTTP({
      schema: schema,
      graphiql: {
        subscriptionEndpoint: `ws://localhost:${PORT}/subscriptions`,
      },
    }),
  ),
);
const ws = createServer(app.callback());
ws.listen(PORT, () => {
  // Set up the WebSocket for handling GraphQL subscriptions.
  new SubscriptionServer(
    {
      execute,
      subscribe,
      schema,
    },
    {
      server: ws,
      path: '/subscriptions',
    },
  );
});
```

## Options

The `graphqlHTTP` function accepts the following options:

- **`schema`**: A `GraphQLSchema` instance from [`graphql-js`][].
  A `schema` _must_ be provided.

- **`graphiql`**: If `true`, presents [GraphiQL][] when the GraphQL endpoint is
  loaded in a browser. We recommend that you set `graphiql` to `true` when your
  app is in development, because it's quite useful. You may or may not want it
  in production.
  Alternatively, instead of `true` you can pass in an options object:

  - **`defaultQuery`**: An optional GraphQL string to use when no query
    is provided and no stored query exists from a previous session.
    If `undefined` is provided, GraphiQL will use its own default query.

  - **`headerEditorEnabled`**: An optional boolean which enables the header editor when true.
    Defaults to `false`.

  - **`subscriptionEndpoint`**: An optional GraphQL string contains the WebSocket server url for subscription.

  - **`websocketClient`**: An optional GraphQL string for websocket client used for subscription, `v0`: subscriptions-transport-ws, `v1`: graphql-ws. Defaults to `v0` if not provided

  - **`shouldPersistHeaders`**

  - **`editorTheme`**: By passing an object you may change the theme of GraphiQL.
    Details are below in the [Custom GraphiQL themes](#custom-graphiql-themes) section.

- **`rootValue`**: A value to pass as the `rootValue` to the `execute()`
  function from [`graphql-js/src/execute.js`](https://github.com/graphql/graphql-js/blob/main/src/execution/execute.js#L129).

- **`context`**: A value to pass as the `context` to the `execute()`
  function from [`graphql-js/src/execute.js`](https://github.com/graphql/graphql-js/blob/main/src/execution/execute.js#L130). If `context` is not provided, the
  `ctx` object is passed as the context.

- **`pretty`**: If `true`, any JSON response will be pretty-printed.

- **`extensions`**: An optional function for adding additional metadata to the
  GraphQL response as a key-value object. The result will be added to the
  `"extensions"` field in the resulting JSON. This is often a useful place to
  add development time metadata such as the runtime of a query or the amount
  of resources consumed. This may be an async function. The function is
  given one object as an argument: `{ document, variables, operationName, result, context }`.

- **`validationRules`**: Optional additional validation rules that queries must
  satisfy in addition to those defined by the GraphQL spec.

- **`customValidateFn`**: An optional function which will be used to validate
  instead of default `validate` from `graphql-js`.

- **`customExecuteFn`**: An optional function which will be used to execute
  instead of default `execute` from `graphql-js`.

- **`customFormatErrorFn`**: An optional function which will be used to format any
  errors produced by fulfilling a GraphQL operation. If no function is
  provided, GraphQL's default spec-compliant [`formatError`][] function will be used.

- **`customParseFn`**: An optional function which will be used to create a document
  instead of the default `parse` from `graphql-js`.

- **`formatError`**: is deprecated and replaced by `customFormatErrorFn`. It will be
  removed in version 1.0.0.

- **`fieldResolver`**

- **`typeResolver`**

In addition to an object defining each option, options can also be provided as
a function (or async function) which returns this options object. This function
is provided the arguments `(request, response, graphQLParams)` and is called
after the request has been parsed.

The `graphQLParams` is provided as the object `{ query, variables, operationName, raw }`.

```js
app.use(
  mount(
    '/graphql',
    graphqlHTTP(async (request, response, ctx, graphQLParams) => ({
      schema: MyGraphQLSchema,
      rootValue: await someFunctionToGetRootValue(request),
      graphiql: true,
    })),
  ),
);
```

## HTTP Usage

Once installed at a path, `koa-graphql` will accept requests with
the parameters:

- **`query`**: A string GraphQL document to be executed.

- **`variables`**: The runtime values to use for any GraphQL query variables
  as a JSON object.

- **`operationName`**: If the provided `query` contains multiple named
  operations, this specifies which operation should be executed. If not
  provided, a 400 error will be returned if the `query` contains multiple
  named operations.

- **`raw`**: If the `graphiql` option is enabled and the `raw` parameter is
  provided, raw JSON will always be returned instead of GraphiQL even when
  loaded from a browser.

GraphQL will first look for each parameter in the query string of a URL:

```
/graphql?query=query+getUser($id:ID){user(id:$id){name}}&variables={"id":"4"}
```

If not found in the query string, it will look in the POST request body.

If a previous middleware has already parsed the POST body, the `request.body`
value will be used. Use [`multer`][] or a similar middleware to add support
for `multipart/form-data` content, which may be useful for GraphQL mutations
involving uploading files. See an [example using multer](https://github.com/graphql-community/koa-graphql/blob/e1a98f3548203a3c41fedf3d4267846785480d28/src/__tests__/http-test.js#L664-L732).

If the POST body has not yet been parsed, `koa-graphql` will interpret it
depending on the provided _Content-Type_ header.

- **`application/json`**: the POST body will be parsed as a JSON
  object of parameters.

- **`application/x-www-form-urlencoded`**: the POST body will be
  parsed as a url-encoded string of key-value pairs.

- **`application/graphql`**: the POST body will be parsed as GraphQL
  query string, which provides the `query` parameter.

## Combining with Other koa Middleware

By default, the koa request is passed as the GraphQL `context`.
Since most koa middleware operates by adding extra data to the
request object, this means you can use most koa middleware just by inse