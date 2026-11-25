// Local API for development: `npm --prefix server run dev`, then EXPO_PUBLIC_API_URL=http://localhost:3001.
// Uses an in-memory store, or DynamoDB Local when DYNAMODB_ENDPOINT is set.
import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { createServer } from 'node:http';
import { handle } from './api';
import { DynamoRepo, TABLE_DEFINITION } from './dynamoRepo';
import { MemoryRepo } from './memoryRepo';
import type { Repo } from './model';

const port = Number(process.env.PORT ?? 3001);

async function makeRepo(): Promise<Repo> {
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  if (!endpoint) return new MemoryRepo();
  const client = new DynamoDBClient({
    endpoint,
    region: 'eu-central-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  const table = 'lineup-planner-dev';
  try {
    await client.send(new CreateTableCommand({ TableName: table, ...TABLE_DEFINITION }));
  } catch (e) {
    if (!(e instanceof ResourceInUseException)) throw e;
  }
  return new DynamoRepo(client, table);
}

const repo = await makeRepo();

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const result = await handle(
    {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
      body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined,
    },
    { repo, now: () => new Date() },
  );
  // in production the function URL handles CORS; locally allow any origin
  res.writeHead(result.status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
    'access-control-allow-headers': 'authorization, content-type',
  });
  res.end(result.body === null ? '' : JSON.stringify(result.body));
}).listen(port, () => {
  console.log(`API on http://localhost:${port} (${process.env.DYNAMODB_ENDPOINT ? 'DynamoDB Local' : 'in memory'})`);
});
