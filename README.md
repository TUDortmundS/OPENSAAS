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
const { graphqlHTTP } = require('koa-graphql')