import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoRepo } from './dynamoRepo';
import { createHandler } from './lambda';

const table = process.env.TABLE_NAME;
if (!table) throw new Error('TABLE_NAME is not set');

/** The Lambda entry point (`index.handler`). */
export const handler = createHandler({
  repo: new DynamoRepo(new DynamoDBClient({}), table),
  now: () => new Date(),
});
