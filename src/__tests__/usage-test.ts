import { expect } from 'chai';
import { describe, it } from 'mocha';
import request from 'supertest';
import Koa from 'koa';
import mount from 'koa-mount';
import { GraphQLSchema } from 'graphql';

import { graphqlHTTP } from '../index';

describe('Useful errors when incorrectly used', () => {
  it('requires an option factory function', () => {
    expect(() => {
      // @ts-expect-error
      graphqlHTTP();
    }).to.throw('GraphQL middleware requires options.');
  });

  it('requires option factory function to return object', async () => {
    const app = new Koa();

    app.use(
      mount(
        '/graphql',
        // @ts-expect-error
        graphqlHTTP(() => null),
      ),
    );

    const response = await request(app.listen()).get('/graphql?query={test}');

    expect(response.status).to.equal(500);
    expect(JSON.parse(response.text)).to.deep.equal({
      errors: [
        {
          message:
            'GraphQL middleware option function must return an options object or a promise which will be resolved to an options object.',
        },
      ],
    });
  });

  it('requires option factory function to return object or promise of object', async () => {
    const app = new Koa();

    app.use(
      mount(
        '/graphql',
        // @ts-expect-error
        graphqlHTTP(() => Promise.resolve(null)),
      ),
    );

    const response = await request(app.listen()).get('/graphql?query={test}');

    expect(response.status).to.equal(500);
    expect(JSON.parse(response.text)).to.deep.equal({
      errors: [
        {
          message:
            'GraphQL middleware option function must return an options object or a promise which will be resolved to an options object.',
        },
      ],
    });
  });

  it('requires option factory function to return object with schema', async () => {
    const app = new Koa();

    app.use(
      mount(
        '/graphql',
        // @ts-expect-error
        graphqlHTTP(() => ({})),
      ),
   