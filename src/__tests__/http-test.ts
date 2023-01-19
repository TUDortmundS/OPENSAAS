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
        },
      });
    });

    it('Allows passing in a typeResolver', async () => {
      const schema = buildSchema(`
        type Foo {
          foo: String
        }
        type Bar {
          bar: String
        }
        union UnionType = Foo | Bar
        type Query {
          test: UnionType
        }
      `);
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema,
            rootValue: { test: {} },
            typeResolver: () => 'Bar',
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{ test { __typename } }',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: { __typename: 'Bar' },
        },
      });
    });

    it('Uses ctx as context by default', async () => {
      const schema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'Query',
          fields: {
            test: {
              type: GraphQLString,
              resolve: (_obj, _args, context) => context.foo,
            },
          },
        }),
      });
      const app = server();

      // Middleware that adds ctx.foo to every request
      app.use((ctx, next) => {
        ctx.foo = 'bar';
        return next();
      });

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema,
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
          test: 'bar',
        },
      });
    });

    it('Allows returning an options Promise', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP(() =>
            Promise.resolve({
              schema: TestSchema,
            }),
          ),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('Provides an options function with arguments', async () => {
      const app = server();

      let seenRequest;
      let seenResponse;
      let seenContext;
      let seenParams;

      app.use(
        mount(
          urlString(),
          graphqlHTTP((req, res, ctx, params) => {
            seenRequest = req;
            seenResponse = res;
            seenContext = ctx;
            seenParams = params;
            return { schema: TestSchema };
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');

      expect(seenRequest).to.not.equal(null);
      expect(seenResponse).to.not.equal(null);
      expect(seenContext).to.not.equal(null);
      expect(seenParams).to.deep.equal({
        query: '{test}',
        operationName: null,
        variables: null,
        raw: false,
      });
    });

    it('Catches errors thrown from options function', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP(() => {
            throw new Error('I did something wrong');
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.status).to.equal(500);
      expect(response.text).to.equal(
        '{"errors":[{"message":"I did something wrong"}]}',
      );
    });
  });

  describe('POST functionality', () => {
    it('allows POST with JSON encoding', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({ query: '{test}' });

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('Allows sending a mutation via POST', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen())
        .post(urlString())
        .send({ query: 'mutation TestMutation { writeTest { test } }' });

      expect(response.status).to.equal(200);
      expect(response.text).to.equal(
        '{"data":{"writeTest":{"test":"Hello World"}}}',
      );
    });

    it('allows POST with url encoding', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send(stringifyURLParams({ query: '{test}' }));

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('supports POST JSON query with string variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({
          query: 'query helloWho($who: String){ test(who: $who) }',
          variables: JSON.stringify({ who: 'Dolly' }),
        });

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST JSON query with JSON variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({
          query: 'query helloWho($who: String){ test(who: $who) }',
          variables: { who: 'Dolly' },
        });

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST url encoded query with string variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send(
          stringifyURLParams({
            query: 'query helloWho($who: String){ test(who: $who) }',
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        );

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST JSON query with GET variable values', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        )
        .send({ query: 'query helloWho($who: String){ test(who: $who) }' });

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST url encoded query with GET variable values', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        )
        .send(
          stringifyURLParams({
            query: 'query helloWho($who: String){ test(who: $who) }',
          }),
        );

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST raw text query with GET variable values', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        )
        .set('Content-Type', 'application/graphql')
        .send('query helloWho($who: String){ test(who: $who) }');

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('allows POST with operation name', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({
          query: `
            query helloYou { test(who: "You"), ...shared }
            query helloWorld { test(who: "World"), ...shared }
            query helloDolly { test(who: "Dolly"), ...shared }
            fragment shared on QueryRoot {
              shared: test(who: "Everyone")
            }
          `,
          operationName: 'helloWorld',
        });

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
          shared: 'Hello Everyone',
        },
      });
    });

    it('allows POST with GET operation name', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            operationName: 'helloWorld',
          }),
        )
        .set('Content-Type', 'application/graphql').send(`
          query helloYou { test(who: "You"), ...shared }
          query helloWorld { test(who: "World"), ...shared }
          query helloDolly { test(who: "Dolly"), ...shared }
          fragment shared on QueryRoot {
            shared: test(who: "Everyone")
          }
        `);

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
          shared: 'Hello Everyone',
        },
      });
    });

    it('allows other UTF charsets', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/graphql; charset=utf-16');
      req.write(Buffer.from('{ test(who: "World") }', 'utf16le'));
      const response = await req;

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    it('allows gzipped POST bodies', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip');

      req.write(zlib.gzipSync('{ "query": "{ test }" }'));

      const response = await req;

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    it('allows deflated POST bodies', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'deflate');

      req.write(zlib.deflateSync('{ "query": "{ test }" }'));

      const response = await req;

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    // should replace multer with koa middleware
    it('allows for pre-parsed POST bodies', async () => {
      // Note: this is not the only way to handle file uploads with GraphQL,
      // but it is terse and illustrative of using koa-graphql and multer
      // together.

      // A simple schema which includes a mutation.
      const UploadedFileType = new GraphQLObjectType({
        name: 'UploadedFile',
        fields: {
          originalname: { type: GraphQLString },
          mimetype: { type: GraphQLString },
        },
      });

      const TestMutationSchema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'QueryRoot',
          fields: {
            test: { type: GraphQLString },
          },
        }),
        mutation: new GraphQLObjectType({
          name: 'MutationRoot',
          fields: {
            uploadFile: {
              type: UploadedFileType,
              resolve(rootValue) {
                // For this test demo, we're just returning the uploaded
                // file directly, but presumably you might return a Promise
                // to go store the file somewhere first.
                return rootValue.request.file;
              },
            },
          },
        }),
      });

      const app = server();

      // Multer provides multipart form data parsing.
      const storage = multer.memoryStorage();
      app.use(mount(urlString(), multerWrapper({ storage }).single('file')));

      // Providing the request as part of `rootValue` allows it to
      // be accessible from within Schema resolve functions.
      app.use(
        mount(
          urlString(),
          graphqlHTTP((_req, _res, ctx) => {
            expect(ctx.req.file?.originalname).to.equal('test.txt');
            return {
              schema: TestMutationSchema,
              rootValue: { request: ctx.req },
            };
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .field(
          'query',
          `mutation TestMutation {
          uploadFile { originalname, mimetype }
        }`,
        )
        .attach('file', Buffer.from('test'), 'test.txt');

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          uploadFile: {
            originalname: 'test.txt',
            mimetype: 'text/plain',
          },
        },
      });
    });

    it('allows for pre-parsed POST using application/graphql', async () => {
      const app = server();
      app.use(async (ctx, next) => {
        if (typeof ctx.is('application/graphql') === 'string') {
          // eslint-disable-next-line require-atomic-updates
          ctx.request.body = await parseBody.text(ctx);
        }
        return next();
      });

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/graphql');
      req.write(Buffer.from('{ test(who: "World") }'));
      const response = await req;

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    it('does not accept unknown pre-parsed POST string', async () => {
      const app = server();
      app.use(async (ctx, next) => {
        if (typeof ctx.is('*/*') === 'string') {
          // eslint-disable-next-line require-atomic-updates
          ctx.request.body = await parseBody.text(ctx);
        }
        return next();
      });

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const req = request(app.listen()).post(urlString());
      req.write(Buffer.from('{ test(who: "World") }'));
      const response = await req;

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Must provide query string.' }],
      });
    });

    it('does not accept unknown pre-parsed POST raw Buffer', async () => {
      const app = server();
      app.use(async (ctx, next) => {
        if (typeof ctx.is('*/*') === 'string') {
          const req = ctx.req;
          // eslint-disable-next-line require-atomic-updates
          ctx.request.body = await getRawBody(req, {
            length: req.headers['content-length'],
            limit: '1mb',
            encoding: null,
          });
        }
        return next();
      });

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/graphql');
      req.write(Buffer.from('{ test(who: "World") }'));
      const response = await req;

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Must provide query string.' }],
      });
    });
  });

  describe('Pretty printing', () => {
    it('supports pretty printing', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            pretty: true,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.text).to.equal(
        [
          // Pretty printed JSON
          '{',
          '  "data": {',
          '    "test": "Hello World"',
          '  }',
          '}',
        ].join('\n'),
      );
    });

    it('supports pretty printing configured by request', async () => {
      const app = server();
      let pretty: boolean | undefined;

      app.use(
        mount(
          urlString(),
          graphqlHTTP(() => ({
            schema: TestSchema,
            pretty,
          })),
        ),
      );

      pretty = undefined;
      const defaultResponse = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(defaultResponse.text).to.equal('{"data":{"test":"Hello World"}}');

      pretty = true;
      const prettyResponse = await request(app.listen()).get(
        urlString({
          query: '{test}',
          pretty: '1',
        }),
      );

      expect(prettyResponse.text).to.equal(
        [
          // Pretty printed JSON
          '{',
          '  "data": {',
          '    "test": "Hello World"',
          '  }',
          '}',
        ].join('\n'),
      );

      pretty = false;
      const unprettyResponse = await request(app.listen()).get(
        urlString({
          query: '{test}',
          pretty: '0',
        }),
      );

      expect(unprettyResponse.text).to.equal('{"data":{"test":"Hello World"}}');
    });
  });

  it('will send request, response and context when using thunk', async () => {
    const app = server();

    let seenRequest;
    let seenResponse;
    let seenContext;

    app.use(
      mount(
        urlString(),
        graphqlHTTP((req, res, ctx) => {
          seenRequest = req;
          seenResponse = res;
          seenContext = ctx;
          return { schema: TestSchema };
        }),
      ),
    );

    await request(app.listen()).get(urlString({ query: '{test}' }));

    expect(seenRequest).to.not.equal(undefined);
    expect(seenResponse).to.not.equal(undefined);
    expect(seenContext).to.not.equal(undefined);
  });

  describe('Error handling functionality', () => {
    it('handles field errors caught by GraphQL', async () => {
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
          query: '{thrower}',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: { thrower: null },
        errors: [
          {
            message: 'Throws!',
            locations: [{ line: 1, column: 2 }],
            path: ['thrower'],
          },
        ],
      });
    });

    it('handles query errors from non-null top field errors', async () => {
      const schema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'Query',
          fields: {
            test: {
              type: new GraphQLNonNull(GraphQLString),
              resolve() {
                throw 