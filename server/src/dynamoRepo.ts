import { ConditionalCheckFailedException, TransactionCanceledException, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { emptyMatch, type MatchState } from '../../src/core/match';
import type { Player } from '../../src/core/types';
import { TeamGoneError, type Member, type Repo, type TeamData, type TeamMeta, type TokenRecord } from './model';

type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];
type Key = { pk: string; sk: string };

/**
 * One table, partition key `pk` and sort key `sk` (see docs/plans/shared-teams.md):
 *   TEAM#<id> META | MEMBER#<id> | PLAYER#<id> | MATCH,  INVITE#<code> INVITE,  TOKEN#<hash> TOKEN
 * Every change is a transaction that also bumps the team's version, guarded by the version read just
 * before it (retried on a concurrent change), so versions are exact and never skipped.
 */
export class DynamoRepo implements Repo {
  private readonly db: DynamoDBDocumentClient;

  constructor(
    client: DynamoDBClient,
    private readonly table: string,
  ) {
    this.db = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  async createTeam(team: TeamData) {
    const { meta } = team;
    const pk = teamPk(meta.id);
    const items: TransactItem[] = [
      this.put(
        { pk, sk: 'META', name: meta.name, inviteCode: meta.inviteCode, version: meta.version, createdAt: meta.createdAt },
        true,
      ),
      this.put({ ...inviteKey(meta.inviteCode), teamId: meta.id }, true),
      ...team.members.flatMap((m) => this.memberPuts(meta.id, m)),
      this.put({ pk, sk: 'MATCH', state: team.match }),
      // seq keeps the squad in the order the coach built it
      ...team.players.map((player, seq) => this.put({ pk, sk: `PLAYER#${player.id}`, player, seq })),
    ];
    await this.db.send(new TransactWriteCommand({ TransactItems: items }));
  }

  async teamIdForInvite(code: string) {
    const item = await this.get(inviteKey(code));
    return item?.teamId as string | undefined;
  }

  async token(tokenHash: string): Promise<TokenRecord | undefined> {
    const item = await this.get(tokenKey(tokenHash));
    return item && { teamId: item.teamId, memberId: item.memberId, lastSeenAt: item.lastSeenAt };
  }

  async meta(teamId: string): Promise<TeamMeta | undefined> {
    const item = await this.get({ pk: teamPk(teamId), sk: 'META' });
    return item && toMeta(teamId, item);
  }

  async team(teamId: string): Promise<TeamData | undefined> {
    const items = await this.queryTeam(teamId);
    const metaItem = items.find((i) => i.sk === 'META');
    if (!metaItem) return undefined;
    const members: Member[] = [];
    const players: { player: Player; seq: number }[] = [];
    let match: MatchState = { ...emptyMatch };
    for (const item of items) {
      if (item.sk.startsWith('MEMBER#')) {
        members.push({
          id: item.sk.slice('MEMBER#'.length),
          displayName: item.displayName,
          joinedAt: item.joinedAt,
          lastSeenAt: item.lastSeenAt,
          tokenHash: item.tokenHash,
        });
      } else if (item.sk.startsWith('PLAYER#')) {
        players.push({ player: item.player, seq: item.seq ?? 0 });
      } else if (item.sk === 'MATCH') {
        match = { ...emptyMatch, ...item.state };
      }
    }
    members.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
    players.sort((a, b) => a.seq - b.seq || a.player.id.localeCompare(b.player.id));
    return { meta: toMeta(teamId, metaItem), members, players: players.map((p) => p.player), match };
  }

  async addMember(teamId: string, member: Member) {
    return this.change(teamId, this.memberPuts(teamId, member));
  }

  async removeMember(teamId: string, member: Member) {
    return this.change(teamId, [
      this.del({ pk: teamPk(teamId), sk: `MEMBER#${member.id}` }),
      this.del(tokenKey(member.tokenHash)),
    ]);
  }

  async touch(teamId: string, member: { id: string; tokenHash: string }, at: string) {
    for (const key of [{ pk: teamPk(teamId), sk: `MEMBER#${member.id}` }, tokenKey(member.tokenHash)]) {
      try {
        await this.db.send(
          new UpdateCommand({
            TableName: this.table,
            Key: key,
            UpdateExpression: 'SET lastSeenAt = :at',
            ConditionExpression: 'attribute_exists(pk)',
            ExpressionAttributeValues: { ':at': at },
          }),
        );
      } catch (e) {
        // the member was removed in the meantime: nothing to record
        if (!(e instanceof ConditionalCheckFailedException)) throw e;
      }
    }
  }

  async putPlayer(teamId: string, player: Player) {
    return this.change(teamId, [
      {
        Update: {
          TableName: this.table,
          Key: { pk: teamPk(teamId), sk: `PLAYER#${player.id}` },
          // new players go to the end of the squad; existing ones keep their place
          UpdateExpression: 'SET player = :player, seq = if_not_exists(seq, :seq)',
          ExpressionAttributeValues: { ':player': player, ':seq': Date.now() },
        },
      },
    ]);
  }

  async deletePlayer(teamId: string, playerId: string, matchFields: Partial<MatchState>) {
    const items: TransactItem[] = [this.del({ pk: teamPk(teamId), sk: `PLAYER#${playerId}` })];
    if (Object.keys(matchFields).length > 0) items.push(this.matchUpdate(teamId, matchFields));
    return this.change(teamId, items);
  }

  async patchMatch(teamId: string, fields: Partial<MatchState>) {
    return this.change(teamId, [this.matchUpdate(teamId, fields)]);
  }

  async rename(teamId: string, name: string) {
    return this.change(teamId, [], { name });
  }

  async resetInvite(teamId: string, oldCode: string, newCode: string) {
    return this.change(
      teamId,
      [this.del(inviteKey(oldCode)), this.put({ ...inviteKey(newCode), teamId }, true)],
      { inviteCode: newCode },
    );
  }

  async deleteTeam(team: TeamData) {
    // read the keys again, so items written since `team` was loaded go too
    const items = await this.queryTeam(team.meta.id);
    const keys: Key[] = items.map((i) => ({ pk: i.pk, sk: i.sk }));
    const meta = items.find((i) => i.sk === 'META');
    const codes = new Set([team.meta.inviteCode, ...(meta ? [meta.inviteCode as string] : [])]);
    for (const code of codes) keys.push(inviteKey(code));
    const hashes = new Set([
      ...team.members.map((m) => m.tokenHash),
      ...items.filter((i) => i.sk.startsWith('MEMBER#')).map((i) => i.tokenHash as string),
    ]);
    for (const hash of hashes) keys.push(tokenKey(hash));
    for (let i = 0; i < keys.length; i += 25) await this.batchDelete(keys.slice(i, i + 25));
  }

  // --- helpers ---

  /** Applies `items` and bumps the team version in one transaction; returns the new version. */
  private async change(teamId: string, items: TransactItem[], metaFields: Record<string, unknown> = {}): Promise<number> {
    for (let attempt = 0; ; attempt++) {
      const meta = await this.meta(teamId);
      if (!meta) throw new TeamGoneError();
      const next = meta.version + 1;
      const names: Record<string, string> = { '#version': 'version' };
      const values: Record<string, unknown> = { ':expected': meta.version, ':next': next };
      const sets = ['#version = :next'];
      for (const [field, value] of Object.entries(metaFields)) {
        names[`#${field}`] = field;
        values[`:${field}`] = value;
        sets.push(`#${field} = :${field}`);
      }
      const bump: TransactItem = {
        Update: {
          TableName: this.table,
          Key: { pk: teamPk(teamId), sk: 'META' },
          UpdateExpression: `SET ${sets.join(', ')}`,
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        },
      };
      try {
        await this.db.send(new TransactWriteCommand({ TransactItems: [...items, bump] }));
        return next;
      } catch (e) {
        const reasons = e instanceof TransactionCanceledException ? e.CancellationReasons : undefined;
        const versionMoved = reasons?.[items.length]?.Code === 'ConditionalCheckFailed';
        // someone else changed the team between our read and write: read the new version and retry
        if (versionMoved && attempt < 4) continue;
        throw e;
      }
    }
  }

  private matchUpdate(teamId: string, fields: Partial<MatchState>): TransactItem {
    const names: Record<string, string> = { '#state': 'state' };
    const values: Record<string, unknown> = {};
    const sets = Object.entries(fields).map(([field, value], i) => {
      names[`#f${i}`] = field;
      values[`:f${i}`] = value;
      return `#state.#f${i} = :f${i}`;
    });
    return {
      Update: {
        TableName: this.table,
        Key: { pk: teamPk(teamId), sk: 'MATCH' },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    };
  }

  private memberPuts(teamId: string, m: Member): TransactItem[] {
    return [
      this.put({
        pk: teamPk(teamId),
        sk: `MEMBER#${m.id}`,
        displayName: m.displayName,
        joinedAt: m.joinedAt,
        lastSeenAt: m.lastSeenAt,
        tokenHash: m.tokenHash,
      }),
      this.put({ ...tokenKey(m.tokenHash), teamId, memberId: m.id, lastSeenAt: m.lastSeenAt }, true),
    ];
  }

  private put(item: Key & Record<string, unknown>, mustBeNew = false): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: item,
        ...(mustBeNew ? { ConditionExpression: 'attribute_not_exists(pk)' } : {}),
      },
    };
  }

  private del(key: Key): TransactItem {
    return { Delete: { TableName: this.table, Key: key } };
  }

  // strongly consistent: a removed member or a reset invite must stop working right away
  private async get(key: Key) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: key, ConsistentRead: true }));
    return res.Item;
  }

  private async queryTeam(teamId: string) {
    const items: (Key & Record<string, any>)[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const res = await this.db.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': teamPk(teamId) },
          ConsistentRead: true,
          ExclusiveStartKey: start,
        }),
      );
      items.push(...((res.Items ?? []) as (Key & Record<string, any>)[]));
      start = res.LastEvaluatedKey;
    } while (start);
    return items;
  }

  private async batchDelete(keys: Key[]) {
    let requests = keys.map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; requests.length > 0; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      if (attempt > 5) throw new Error('batch_delete_incomplete');
      const res = await this.db.send(new BatchWriteCommand({ RequestItems: { [this.table]: requests } }));
      requests = (res.UnprocessedItems?.[this.table] ?? []) as typeof requests;
    }
  }
}

const teamPk = (teamId: string) => `TEAM#${teamId}`;
const inviteKey = (code: string): Key => ({ pk: `INVITE#${code}`, sk: 'INVITE' });
const tokenKey = (hash: string): Key => ({ pk: `TOKEN#${hash}`, sk: 'TOKEN' });

function toMeta(teamId: string, item: Record<string, any>): TeamMeta {
  return { id: teamId, name: item.name, inviteCode: item.inviteCode, version: item.version, createdAt: item.createdAt };
}

/** The table layout, for creating it in tests (the deployed table is defined in infra/template.yaml). */
export const TABLE_DEFINITION = {
  AttributeDefinitions: [
    { AttributeName: 'pk', AttributeType: 'S' as const },
    { AttributeName: 'sk', AttributeType: 'S' as const },
  ],
  KeySchema: [
    { AttributeName: 'pk', KeyType: 'HASH' as const },
    { AttributeName: 'sk', KeyType: 'RANGE' as const },
  ],
  ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
};
