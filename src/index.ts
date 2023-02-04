import type {
  ASTVisitor,
  DocumentNode,
  ExecutionArgs,
  ExecutionResult,
  FormattedExecutionResult,
  GraphQLSchema,
  GraphQLFieldResolver,
  GraphQLTypeResolver,
  GraphQLFormattedError,
  ValidationContext,
} from 'graphql';
import type { GraphQLParams, RequestInfo } from 'express-graphql';
import httpError from 'http-errors';
import {
  Source,
  GraphQLError,
  validateSchema,
  parse,
  validate,
  execute,
  formatError,
  getOperationAST,
  specifiedRules,
} from 'graphql';
import { getGraphQLParams } from 'express-graphql';

import type { Context, Request, Response } from 'koa';

import { renderGraphiQL } from './renderGraphiQL';
import type { GraphiQLOptions, GraphiQLData } from './renderGraphiQL';

type MaybePromise<T> = Promise<T> | T;

/**
 * Used to configure the graphqlHTTP middleware by providing a schema
 * and other configuration options.
 *
 * Options can be provided as an Object, a Promise for an Object, or a Function
 * that returns an Object or a Promise for an Object.
 */
export type Options =
  | ((
      request: Request,
      response: Response,
      ctx: Context,
      params?: GraphQLParams,
    ) => OptionsResult)
  | OptionsResult;
export type OptionsResult = MaybePromise<OptionsData>;

export interface OptionsData {
  /**
   * A GraphQL schema from graphql-js.
   */
  schema: GraphQLSchema;

  /**
   * A value to pass as the context to this middleware.
   */
  context?: unknown;

  /**
   * An object to pass as the rootValue to the graphql() function.
   */
  rootValue?: unknown;

  /**
   * A boolean to configure whether the output should be pretty-printed.
   */
  pretty?: boolean;

  /**
   * An optional array of validation rules that will be applied on the document
   * in additional to those defined by the GraphQL spec.
   */
  validationRules?: ReadonlyArray<(ctx: ValidationContext) => ASTVisitor>;

  /**
   * An optional function which will be used to validate instead of default `validate`
   * from `graphql-js`.
   */
  customValidateFn?: (
    schema: GraphQLSchema,
    documentAST: DocumentNode,
    rules: ReadonlyArray<any>,
  ) => ReadonlyArray<GraphQLError>;

  /**
   * An optional function which will be used to execute instead of default `execute`
   * from `graphql-js`.
   */
  customExecuteFn?: (args: ExecutionArgs) => MaybePromise<ExecutionResult>;

  /**
   * An optional function which will be used to format any errors produced by
   * fulfilling a GraphQL operation. If no function is provided, GraphQL's
   * default spec-compliant `formatError` function will be used.
