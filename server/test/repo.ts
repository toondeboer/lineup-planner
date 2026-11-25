import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { DynamoRepo, TABLE_DEFINITION } from '../src/dynamoRepo';
import { MemoryRepo } from '../src/memoryRepo';
import type { Repo } from '../src/model';

/**
 * The store the API tests run against. By default an in-memory one; with `TEST_REPO=dynamodb` the
 * DynamoDB one, against DynamoDB Local at `DYNAMODB_ENDPOINT` (see the README).
 */
export async function newRepo(): Promise<Repo> {
  if (process.env.TEST_REPO !== 'dynamodb') return new MemoryRepo();
  const client = new DynamoDBClient({
    endpoint: process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
    region: 'eu-central-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  await (tableReady ??= createTable(client));
  return new DynamoRepo(client, TABLE);
}

const TABLE = 'lineup-planner-test';
let tableReady: Promise<void> | undefined;

async function createTable(client: DynamoDBClient) {
  try {
    await client.send(new CreateTableCommand({ TableName: TABLE, ...TABLE_DEFINITION }));
  } catch (e) {
    if (!(e instanceof ResourceInUseException)) throw e;
  }
}
