import zlib from 'zlib';
import type { Readable } from 'stream';

import Koa from 'koa';
import mount from 'koa-mount';
import session from 'koa-session';
import parseBody from 'co-body';
import getRawBody from 'raw-body';
import request from 'supertest';

import type { ASTVisitor, ValidationContext } from 'graphql';
import sinon from 'sinon';
import multer from 'multer';
import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
  Source,
  GraphQLError,
  GraphQLString,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  parse,
  execute,
  validate,
  buildSchema,
} from 'graphql';

import { graphqlHTTP } from '../index';

import multerWrapper from './helpers/koa-multer';

declare module 'koa' {
  interface Request {
    body?: any;
    rawBody: string;
  }
}

type MulterFile = {
  /** Name of the form field associated with this file. */
  fieldname: string;
  /** Name of the file on the uploader's computer. */
  originalname: string;
  /**
   * Value of the `Content-Transfer-Encoding` header for this file.
   * @deprecated since July 2015
   * @see RFC 7578, Section 4.7
   */
  encoding: string;
  /** Value of the `Content-Type` header for this file. */
  mimetype: string;
  /** Size of the file in bytes. */
  size: number;
  /**
   * A readable stream of this file. Only available to the `_handleFile`
   * callback for custom `StorageEngine`s.
   */
  stream: Readable;
  /** `DiskStorage` only: Directory to which this file has been uploaded. */
  destination: string;
  /** `DiskStorage` only: Name of this file within `destination`. */
  filename: string;
  /** `DiskStorage` only: Full path to the uploaded file. */
  path: string;
  /** `MemoryStorage` only: A Buffer containing the entire file. */
  buffer: Buffer;
};

declare module 'http' {
  interface IncomingMessage {
    file?: MulterFile | undefined;
    /**
     * Array or dictionary of `Multer.File` object populated by `array()`,
     * `fields()`, and `any()` middleware.
     */
    files?:
      | {
          [fieldname: string]: Array<MulterFile>;
        }
      | Array<MulterFile>
      | undefined;
  }
}

const QueryRootType = new GraphQLObjectType({
  name: 'QueryRoot',
  fields: {
    test: {
      type: GraphQLString,
      args: {
        who: { type: GraphQLString },
      },
      resolve: (_root, args: { who?: string }) =>
        'Hello ' + (args.who ?? 'World'),
    },
    thrower: {
      type: GraphQLString,
      resolve: () => {
        throw new Error('Throws!');
      },
    },
  },
});

const TestSchema = new GraphQLSchema({
  query: QueryRootType,
  mutation: new GraphQLObjectType({
    name: 'MutationRoot',
    fields: {
      writeTest: {
        type: QueryRootType,
        resolve: () => ({}),
      },
    },
  }),
});

function stringifyURLParams(urlParams?: { [param: string]: string }): string {
  return new URLSearchParams(urlParams).toString();
}

function urlString(urlParams?: { [param: string]: string }): string {
  let string = '/graphql';
  if (urlParams) {
    string += '?' + stringifyURLParams(urlParams);
  }
  return string;
}

function server<StateT = Koa.DefaultState, ContextT = Koa.DefaultContext>() {
  const app = new Koa<StateT, ContextT>();

  /* istanbul ignore next Error handler added only for debugging failed tests */
  app.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.warn('App encountered an error:', error);
  });

  return app;
}

describe('GraphQL-HTTP tests', () => {
  describe('GET functionality', () => {
    it('allows GET with query param', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('allows GET with variable values', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: 'query helloWho($who: String){ test(who: $who) }',
          variables: JSON.stringify({ who: 'Dolly' }),
        }),
      );

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('allows GET with operation name', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: `
            query helloYou { test(who: "You"), ...shared }
            query helloWorld { test(who: "World"), ...shared }
            query helloDolly { test(who: "Dolly"), ...shared }
            fragment shared on QueryRoot {
              shared: test(who: "Everyone")
            }
          `,
          operationName: 'helloWorld',
        }),
      );

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
          shared: 'Hello Everyone',
        },
      });
    });

    it('Reports validation errors', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          query: '{ test, unknownOne, unknownTwo }',
        }),
      );

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message: 'Cannot query field "unknownOne" on type "QueryRoot".',
            locations: [{ line: 1, column: 9 }],
          },
          {
            message: 'Cannot query field "unknownTwo" on type "QueryRoot".',
            locations: [{ line: 1, column: 21 }],
          },
        ],
      });
    });

    it('Errors when missing operation name', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          query: `
            query TestQuery { test }
            mutation TestMutation { writeTest { test } }
          `,
        }),
      );

      expect(response.status).to.equal(500);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message:
              'Must provide operation name if query contains multiple operations.',
          },
        ],
      });
    });

    it('Errors when sending a mutation via GET', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          query: 'mutation TestMutation { writeTest { test } }',
        }),
      );

      expect(response.status).to.equal(405);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message:
              'Can only perform a mutation operation from a POST request.',
          },
        ],
      });
    });

    it('Errors when selecting a mutation within a GET', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          operationName: 'TestMutation',
          query: `
            query TestQuery { test }
            mutation TestMutation { writeTest { test } }
          `,
        }),
      );

      expect(response.status).to.equal(405);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message:
              'Can only perform a mutation operation from a POST request.',
          },
        ],
      });
    });

    it('Allows a mutation to exist within a GET', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          operationName: 'TestQuery',
          query: `
            mutation TestMutation { writeTest { test } }
            query TestQuery { test }
          `,
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    it('Allows async resolvers', async () => {
      const schema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'Query',
          fields: {
            foo: {
              type: GraphQLString,
              resolve: () => Promise.resolve('bar'),
            },
          },
        }),
      });
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema })));

      const response = await request(app.listen()).get(
        urlString({
          query: '{ foo }',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: { foo: 'bar' },
      });
    });

    it('Allows passing in a context', async () => {
      const schema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'Query',
          fields: {
            test: {
              type: GraphQLString,
              resolve: (_obj, _args, context) => context,
            },
          },
        }),
      });
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema,
            context: 'testValue',
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{ test }',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'testValue',
        },
      });
    });

    it('Allows passing in a fieldResolver', async () => {
      const schema = buildSchema(`
        type Query {
          test: String
        }
      `);
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema,
            fieldResolver: () => 'fieldResolver data',
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{ test }',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'fieldResolver data',
  