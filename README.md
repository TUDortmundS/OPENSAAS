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

- **`pretty`**: If `true`, any JSON respons