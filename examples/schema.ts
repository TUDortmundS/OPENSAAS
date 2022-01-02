import { buildSchema } from 'graphql';

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const schema = buildSchema(`
type Query {
    hello: String
}
type