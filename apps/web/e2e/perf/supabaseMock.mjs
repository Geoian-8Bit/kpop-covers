#!/usr/bin/env node
// REQ-03 · Simulated Supabase for load measurements.
//
// A real HTTP server (not page.route) so CDP network emulation, connection setup and preconnect behave as they
// do against hosted Supabase. It serves the deterministic demo dataset (e2e/fixtures/demo-db.json) with the JSON
// shape of PostgREST (/rest/v1) and Storage (/storage/v1).
//
// Run:    node apps/web/e2e/perf/supabaseMock.mjs --port 54329 --latency 150
// Import: const { url, close } = await startMock({ port, latency, data })
//
// Contract covered (keep in sync with apps/web/src/lib/backend.ts; update in the phase that changes a contract):
//   Tables   crews profiles videos clips notes members takes take_reactions bags bag_items bag_draws tracks
//            track_items wishes wish_interest polls poll_options poll_votes events event_songs absences
//            rehearsal_rules rehearsal_exceptions calendar_changes formation_plans formation_plan_members
//            formations (+ empty video_stems, push_subscriptions)
//   Select   *, columns, alias:column, embedded to-one (video:videos(cols), clip:clips(*, video:videos(..)),
//            member:members, wish:wishes, take:takes!inner(..)), embedded to-many (formation_plan_members(member_id)),
//            counts (clips(count), bag_items(count), track_items(count), event_songs(count), formations(count))
//   Filters  eq neq in is (null/true/false) not.<op> gt gte lt lte like ilike, dotted embedded key (take.video_id)
//   Shaping  order=a.desc,b (nullsfirst/nullslast), limit, offset, Range header, Accept pgrst.object (single),
//            Prefer count=exact -> Content-Range, HEAD
//   Writes   POST (insert, upsert via resolution=merge-duplicates) / PATCH / DELETE (= archived_at, as the trigger),
//            Prefer return=representation, `select=` on the write response
//   RPC      storage_usage calendar_members formation_members draw_from_bag close_poll cast_vote
//            archive_calendar_row edit_rehearsal_rule end_rehearsal_rule save_push_subscription
//            delete_push_subscription create_formation_plan update_formation_plan duplicate_formation_plan
//            save_formation delete_formation poll_votes_signature set_track_positions set_event_song_positions
//   Generated videos.poster_inline / list_thumbnail_url / poster_rev (REQ-14), notes.has_sketch (REQ-17):
//            computed on load and after every write; writing them is refused (428C9) like Postgres does
//   Storage  POST /object/sign/<bucket>/<path>, POST /object/sign/<bucket> (batch), GET /object/(sign|public|
//            authenticated)?/<bucket>/<path> (bytes, Range), POST/PUT /object/<bucket>/<path> (upload)
//   Auth     POST /auth/v1/token?grant_type=refresh_token (REQ-11 refresh of a login-era session, used only by the
//            F8 legacy-session evidence): refresh_token «invalid» → 400 invalid_grant, any other → a new session
//            (JWT valid 1 h) for the user of that capture
// Rows with archived_at are hidden everywhere, like the RLS policies.

import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA = path.join(HERE, '../fixtures/demo-db.json');
const EMPTY_TABLES = ['video_stems', 'push_subscriptions'];
const SINGULAR = { wishes: 'wish' };
// FK column on the child table that points to the parent, when it is not `<singular parent>_id`.
const CHILD_COL = { formation_plans: 'plan_id' };
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const ALLOW_HEADERS =
  'authorization, apikey, x-client-info, content-type, prefer, range, range-unit, content-profile, accept-profile, accept, x-upsert, cache-control, x-supabase-api-version';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const singular = (t) => SINGULAR[t] ?? t.replace(/s$/, '');

class HttpError extends Error {
  constructor(status, body) {
    super(body?.message ?? String(status));
    this.status = status;
    this.body = body;
  }
}
const pgError = (status, code, message) =>
  new HttpError(status, { code, message, details: null, hint: null });

// ───────────────────────────── select parsing ─────────────────────────────

function splitTop(str) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** `*, video:videos(id, title)` -> nodes. A relation whose only child is `count` becomes a count node. */
export function parseSelect(str) {
  const src = (str ?? '*').replace(/\s+/g, '') || '*';
  return splitTop(src).map((item) => {
    if (item === '*') return { type: 'star' };
    const open = item.indexOf('(');
    if (open === -1) {
      const m = item.split('::')[0];
      const [alias, name] = m.includes(':') ? m.split(':') : [m, m];
      return { type: 'col', alias, name };
    }
    const head = item.slice(0, open);
    const inner = item.slice(open + 1, item.lastIndexOf(')'));
    const [aliasPart, relPart] = head.includes(':') ? head.split(':') : [null, head];
    const [table, ...hints] = relPart.split('!');
    const children = parseSelect(inner);
    const isCount = children.length === 1 && children[0].type === 'col' && children[0].name === 'count';
    return {
      type: 'rel',
      alias: aliasPart ?? table,
      table,
      inner: hints.includes('inner'),
      children,
      isCount,
    };
  });
}

// ───────────────────────────── filters / order ─────────────────────────────

const ISO = /^\d{4}-\d\d-\d\d(T|$)/;
const asTime = (v) => (typeof v === 'string' && ISO.test(v) ? Date.parse(v) : Number.NaN);

function looseEq(field, val) {
  if (field === null || field === undefined) return false;
  if (typeof field === 'number') return Number(val) === field;
  if (typeof field === 'boolean') return String(field) === val;
  if (typeof field === 'object') return JSON.stringify(field) === val;
  const a = asTime(field);
  const b = asTime(val);
  if (!Number.isNaN(a) && !Number.isNaN(b) && field.includes('T')) return a === b;
  return field === val;
}

function compare(field, val) {
  if (typeof field === 'number') return field - Number(val);
  const a = asTime(field);
  const b = asTime(val);
  if (!Number.isNaN(a) && !Number.isNaN(b)) return a - b;
  return field < val ? -1 : field > val ? 1 : 0;
}

function parseList(val) {
  return val
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, ''))
    .filter((s) => s !== '');
}

export function matches(field, expr) {
  if (expr.startsWith('not.')) return !matches(field, expr.slice(4));
  const dot = expr.indexOf('.');
  const op = dot === -1 ? expr : expr.slice(0, dot);
  const val = dot === -1 ? '' : expr.slice(dot + 1);
  const present = field !== null && field !== undefined;
  switch (op) {
    case 'eq':
      return looseEq(field, val);
    case 'neq':
      return !looseEq(field, val);
    case 'is':
      if (val === 'null') return !present;
      return field === (val === 'true');
    case 'in':
      return parseList(val).some((v) => looseEq(field, v));
    case 'gt':
      return present && compare(field, val) > 0;
    case 'gte':
      return present && compare(field, val) >= 0;
    case 'lt':
      return present && compare(field, val) < 0;
    case 'lte':
      return present && compare(field, val) <= 0;
    case 'like':
    case 'ilike': {
      const re = new RegExp(
        '^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$',
        op === 'ilike' ? 'i' : '',
      );
      return present && re.test(String(field));
    }
    default:
      throw pgError(400, 'PGRST100', `Unsupported operator "${op}"`);
  }
}

function orderBy(rows, spec) {
  const keys = spec
    .split(',')
    .filter(Boolean)
    .map((s) => {
      const [col, ...mods] = s.split('.');
      const desc = mods.includes('desc');
      const nullsFirst = mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : desc;
      return { col, desc, nullsFirst };
    });
  return [...rows].sort((x, y) => {
    for (const { col, desc, nullsFirst } of keys) {
      const a = x[col];
      const b = y[col];
      const an = a === null || a === undefined;
      const bn = b === null || b === undefined;
      if (an || bn) {
        if (an && bn) continue;
        return an === nullsFirst ? -1 : 1;
      }
      let c = typeof a === 'boolean' ? Number(a) - Number(b) : compare(a, String(b));
      if (typeof a === 'string' && typeof b === 'string' && Number.isNaN(asTime(a)))
        c = a < b ? -1 : a > b ? 1 : 0;
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

// ───────────────────────────── database ─────────────────────────────

const live = (row) => !row.archived_at;

const md5 = (s) => createHash('md5').update(s).digest('hex');
const isInline = (url) => typeof url === 'string' && url.startsWith('data:');

// REQ-14 / REQ-17 · Same expressions as the generated columns of 20261031110000_video_list_columns.sql and
// 20261031120000_notes_has_sketch.sql, so list bytes measured here match the real ones.
const GENERATED = {
  videos: (r) => ({
    poster_inline: isInline(r.thumbnail_url),
    list_thumbnail_url: isInline(r.thumbnail_url) ? null : (r.thumbnail_url ?? null),
    poster_rev: isInline(r.thumbnail_url) ? md5(r.thumbnail_url) : null,
  }),
  notes: (r) => ({ has_sketch: r.sketch != null }),
};

/** Recomputes the generated columns of a stored row (on load and after each write). */
function generate(tableName, row) {
  const fn = GENERATED[tableName];
  if (fn) Object.assign(row, fn(row));
  return row;
}

/** Postgres refuses a client value for a generated column; so does the mock. */
function refuseGenerated(tableName, body) {
  const fn = GENERATED[tableName];
  if (!fn || !body) return;
  const cols = Object.keys(fn({}));
  for (const row of Array.isArray(body) ? body : [body]) {
    const col = cols.find((c) => c in row);
    if (col) throw pgError(400, '428C9', `column "${col}" can only be updated to DEFAULT`);
  }
}

function createDb(data) {
  const tables = structuredClone(data);
  for (const t of EMPTY_TABLES) tables[t] ??= [];
  for (const t of Object.keys(GENERATED)) for (const r of tables[t] ?? []) generate(t, r);
  return tables;
}

function tableOf(db, name) {
  if (!db[name]) throw pgError(404, '42P01', `relation "public.${name}" does not exist`);
  return db[name];
}

/** Embedded relation of `row` (a row of `tableName`): to-one when the row carries `<rel>_id`, else to-many. */
function embed(db, tableName, row, node) {
  const rel = tableOf(db, node.table);
  const fk = `${singular(node.table)}_id`;
  let value;
  if (fk in row) {
    const target = rel.find((r) => r.id === row[fk] && live(r));
    value = target ? projectRow(db, node.table, target, node.children) : null;
  } else {
    const col = CHILD_COL[tableName] ?? `${singular(tableName)}_id`;
    const kids = rel.filter((r) => r[col] === row.id && live(r));
    value = node.isCount
      ? [{ count: kids.length }]
      : kids.map((k) => projectRow(db, node.table, k, node.children));
  }
  return value;
}

function projectRow(db, tableName, row, nodes) {
  const out = {};
  for (const n of nodes) {
    if (n.type === 'star') Object.assign(out, row);
    else if (n.type === 'col') out[n.alias] = row[n.name] ?? null;
    else out[n.alias] = embed(db, tableName, row, n);
  }
  return out;
}

function pathValue(db, tableName, row, key, nodes) {
  const [alias, ...rest] = key.split('.');
  const node = nodes.find((n) => n.type === 'rel' && n.alias === alias);
  if (!node) throw pgError(400, 'PGRST200', `Unknown embedded resource "${alias}"`);
  const rel = embed(db, tableName, row, { ...node, children: [{ type: 'star' }], isCount: false });
  return rel && !Array.isArray(rel) ? rel[rest.join('.')] : null;
}

/** Applies filters, embeds, order and pagination for a GET (or the row selection of PATCH/DELETE). */
function runQuery(db, tableName, params, { range } = {}) {
  const nodes = parseSelect(params.get('select') ?? '*');
  let rows = tableOf(db, tableName).filter(live);
  const filters = [...params.entries()].filter(
    ([k]) => !RESERVED.has(k) && !/\.(order|limit|offset)$/.test(k),
  );
  for (const [key, expr] of filters) {
    if (key.includes('.')) {
      rows = rows.filter((r) => matches(pathValue(db, tableName, r, key, nodes), expr));
    } else {
      rows = rows.filter((r) => matches(r[key], expr));
    }
  }
  for (const n of nodes) {
    if (n.type === 'rel' && n.inner) rows = rows.filter((r) => embed(db, tableName, r, n) !== null);
  }
  const order = params.getAll('order').join(',');
  if (order) rows = orderBy(rows, order);
  const total = rows.length;
  const offset = Number(params.get('offset') ?? range?.from ?? 0) || 0;
  let limit = params.get('limit') !== null ? Number(params.get('limit')) : undefined;
  if (range?.to !== undefined && limit === undefined) limit = range.to - range.from + 1;
  const page = rows.slice(offset, limit === undefined ? undefined : offset + limit);
  return { total, offset, page, nodes };
}

// ───────────────────────────── writes ─────────────────────────────

const now = () => new Date().toISOString();

function applyDefaults(db, tableName, row) {
  const out = { ...row };
  out.id ??= randomUUID();
  if (!['crews', 'profiles'].includes(tableName)) out.crew_id ??= db.crews?.[0]?.id ?? null;
  out.created_at ??= now();
  out.archived_at ??= null;
  return out;
}

function insertRows(db, tableName, body, prefer) {
  const table = tableOf(db, tableName);
  const list = Array.isArray(body) ? body : [body];
  const merge = /resolution=merge-duplicates/.test(prefer);
  return list.map((raw) => {
    const existing = merge && raw.id ? table.find((r) => r.id === raw.id) : undefined;
    if (existing) return generate(tableName, Object.assign(existing, raw));
    const row = generate(tableName, applyDefaults(db, tableName, raw));
    table.push(row);
    return row;
  });
}

function writeResponse(db, tableName, rows, params, req) {
  const nodes = parseSelect(params.get('select') ?? '*');
  const out = rows.map((r) => projectRow(db, tableName, r, nodes));
  return req.single ? (out[0] ?? null) : out;
}

// ───────────────────────────── RPC ─────────────────────────────

function revisionGuard(db, planId, expected) {
  const plan = db.formation_plans.find((p) => p.id === planId && live(p));
  if (!plan) throw pgError(404, 'P0002', 'plan not found');
  return plan.revision === expected ? { plan } : { plan, conflict: { ok: false, revision: plan.revision } };
}

/** All-or-nothing reorder of `table` rows of one container: position = index in `ids` (0-based). */
function setPositions(db, table, key, parentId, ids, parentTable, errorName) {
  const invalid = () => pgError(400, 'P0001', errorName);
  const list = Array.isArray(ids) ? ids : [];
  if (!list.length || new Set(list).size !== list.length) throw invalid();
  if (!db[parentTable].some((p) => p.id === parentId && live(p))) throw invalid();
  const rows = list.map((id) => db[table].find((r) => r.id === id && r[key] === parentId && live(r)));
  if (rows.some((r) => !r)) throw invalid();
  if (list.length > 1000) {
    throw pgError(
      400,
      '23514',
      `new row for relation "${table}" violates check constraint "${table}_position_check"`,
    );
  }
  rows.forEach((r, i) => {
    r.position = i;
  });
}

/** RPC that return a scalar: PostgREST answers 200 with `null`, not 204. */
const SCALAR_RPCS = new Set(['poll_votes_signature']);

const RPCS = {
  storage_usage(db) {
    const takes = db.takes.filter(live).reduce((s, t) => s + (t.shared_size ?? 0), 0);
    const files = db.videos
      .filter((v) => live(v) && v.storage_path)
      .reduce((s, v) => s + (v.file_size ?? 0), 0);
    return { takes, total: takes + files, limit: 1073741824 };
  },
  calendar_members(db) {
    const withAbsence = new Set(db.absences.filter(live).map((a) => a.member_id));
    return db.members
      .filter((m) => live(m) || withAbsence.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, color: m.color, archived: !live(m) }));
  },
  formation_members(db) {
    return db.members.filter(live).map((m) => ({ id: m.id, name: m.name, color: m.color, archived: false }));
  },
  draw_from_bag(db, a) {
    const items = db.bag_items.filter((i) => live(i) && i.bag_id === a.p_bag && !i.removed_at);
    const picked = items.slice(0, Math.max(0, Number(a.p_count) || 1));
    let seq = Math.max(0, ...db.bag_draws.filter((d) => d.bag_id === a.p_bag).map((d) => d.seq));
    return picked.map((item) => {
      if (a.p_remove) item.removed_at = now();
      const video = item.video_id ? db.videos.find((v) => v.id === item.video_id) : null;
      const draw = applyDefaults(db, 'bag_draws', {
        bag_id: a.p_bag,
        item_id: item.id,
        label: video?.title ?? item.title ?? 'Sorteo',
        member_id: a.p_member ?? null,
        removed: Boolean(a.p_remove),
        seq: ++seq,
        drawn_at: now(),
      });
      db.bag_draws.push(draw);
      return draw;
    });
  },
  close_poll(db, a) {
    const poll = db.polls.find((p) => p.id === a.p_poll && live(p));
    if (!poll) throw pgError(404, 'P0002', 'poll not found');
    let winner = a.p_winner ?? null;
    if (a.p_resolve && !winner) {
      const tally = new Map();
      for (const v of db.poll_votes.filter((x) => live(x) && x.poll_id === poll.id)) {
        tally.set(v.option_id, (tally.get(v.option_id) ?? 0) + 1);
      }
      const top = Math.max(0, ...tally.values());
      const leaders = [...tally]
        .filter(([, n]) => n === top)
        .map(([id]) => db.poll_options.find((o) => o.id === id)?.wish_id);
      if (leaders.length > 1) return { status: 'tie', winner: null, tied: leaders };
      winner = leaders[0] ?? null;
    }
    poll.closed_at = now();
    poll.winner_wish_id = winner;
    return { status: 'closed', winner, tied: [] };
  },
  cast_vote(db, a) {
    for (const v of db.poll_votes) {
      if (v.poll_id === a.p_poll && v.member_id === a.p_member && live(v)) v.archived_at = now();
    }
    const ids = a.p_options ?? [];
    // Like cast_vote(): only ranking polls store a rank (it feeds poll_votes_signature).
    const ranking = db.polls.find((p) => p.id === a.p_poll)?.vote_type === 'ranking';
    ids.forEach((optionId, i) =>
      db.poll_votes.push(
        applyDefaults(db, 'poll_votes', {
          poll_id: a.p_poll,
          option_id: optionId,
          member_id: a.p_member,
          rank: ranking ? i + 1 : null,
        }),
      ),
    );
    return ids.length;
  },
  // REQ-19.4 · md5 of the live ballots of a live poll, ordered by option then member; null without votes.
  poll_votes_signature(db, a) {
    if (!db.polls.some((p) => p.id === a.p_poll && live(p))) return null;
    const votes = db.poll_votes
      .filter((v) => live(v) && v.poll_id === a.p_poll)
      .sort((x, y) =>
        x.option_id === y.option_id
          ? x.member_id < y.member_id
            ? -1
            : x.member_id > y.member_id
              ? 1
              : 0
          : x.option_id < y.option_id
            ? -1
            : 1,
      );
    if (!votes.length) return null;
    return md5(votes.map((v) => `${v.option_id}:${v.member_id}:${v.rank ?? ''}`).join(','));
  },
  // REQ-20 · Same rules as the RPC: a live container, a non-empty list without repeats, every id a live item of it.
  set_track_positions(db, a) {
    setPositions(db, 'track_items', 'track_id', a.p_track, a.p_ids, 'tracks', 'track_positions_invalid');
    return null;
  },
  set_event_song_positions(db, a) {
    setPositions(db, 'event_songs', 'event_id', a.p_event, a.p_ids, 'events', 'event_song_positions_invalid');
    return null;
  },
  archive_calendar_row(db, a) {
    const row = tableOf(db, a.p_table).find((r) => r.id === a.p_id);
    if (row) row.archived_at = now();
    return null;
  },
  edit_rehearsal_rule(db, a) {
    const rule = db.rehearsal_rules.find((r) => r.id === a.p_rule && live(r));
    if (!rule) throw pgError(404, 'P0002', 'rule not found');
    Object.assign(rule, {
      weekday: a.p_weekday,
      starts_at: a.p_starts,
      ends_at: a.p_ends,
      changed_by_member: a.p_member ?? null,
    });
    return rule;
  },
  end_rehearsal_rule(db, a) {
    const rule = db.rehearsal_rules.find((r) => r.id === a.p_rule);
    if (rule) rule.valid_until = now().slice(0, 10);
    return null;
  },
  save_push_subscription: () => null,
  delete_push_subscription: () => null,
  create_formation_plan(db, a) {
    const plan = applyDefaults(db, 'formation_plans', {
      video_id: a.p_video,
      name: a.p_name,
      stage_width: a.p_width,
      stage_depth: a.p_depth,
      grid: 0.5,
      bpm: null,
      first_beat: 0,
      revision: 1,
    });
    db.formation_plans.push(plan);
    for (const m of a.p_members ?? []) {
      db.formation_plan_members.push(
        applyDefaults(db, 'formation_plan_members', { plan_id: plan.id, member_id: m }),
      );
    }
    return plan;
  },
  update_formation_plan(db, a) {
    const { plan, conflict } = revisionGuard(db, a.p_plan, a.p_expected_revision);
    if (conflict) return conflict;
    const { members, ...fields } = a.p_patch ?? {};
    Object.assign(plan, fields, { revision: plan.revision + 1 });
    if (Array.isArray(members)) {
      for (const m of db.formation_plan_members) if (m.plan_id === plan.id) m.archived_at = now();
      for (const id of members) {
        db.formation_plan_members.push(
          applyDefaults(db, 'formation_plan_members', { plan_id: plan.id, member_id: id }),
        );
      }
    }
    return { ok: true, revision: plan.revision, plan };
  },
  duplicate_formation_plan(db, a) {
    const src = db.formation_plans.find((p) => p.id === a.p_plan && live(p));
    if (!src) throw pgError(404, 'P0002', 'plan not found');
    const copy = applyDefaults(db, 'formation_plans', {
      ...src,
      id: undefined,
      name: a.p_name,
      revision: 1,
      created_at: undefined,
    });
    db.formation_plans.push(copy);
    for (const m of db.formation_plan_members.filter((x) => live(x) && x.plan_id === src.id)) {
      db.formation_plan_members.push(
        applyDefaults(db, 'formation_plan_members', {
          ...m,
          id: undefined,
          plan_id: copy.id,
          created_at: undefined,
        }),
      );
    }
    for (const f of db.formations.filter((x) => live(x) && x.plan_id === src.id)) {
      db.formations.push(
        applyDefaults(db, 'formations', { ...f, id: undefined, plan_id: copy.id, created_at: undefined }),
      );
    }
    return copy;
  },
  save_formation(db, a) {
    const { plan, conflict } = revisionGuard(db, a.p_plan, a.p_expected_revision);
    if (conflict) return conflict;
    const input = a.p_formation ?? {};
    let formation = input.id ? db.formations.find((f) => f.id === input.id) : undefined;
    if (formation) Object.assign(formation, input);
    else {
      formation = applyDefaults(db, 'formations', {
        props: [],
        note: null,
        transition: 2,
        ...input,
        plan_id: plan.id,
      });
      db.formations.push(formation);
    }
    plan.revision += 1;
    return { ok: true, revision: plan.revision, formation };
  },
  delete_formation(db, a) {
    const { plan, conflict } = revisionGuard(db, a.p_plan, a.p_expected_revision);
    if (conflict) return conflict;
    const f = db.formations.find((x) => x.id === a.p_formation_id);
    if (f) f.archived_at = now();
    plan.revision += 1;
    return { ok: true, revision: plan.revision };
  },
};

// ───────────────────────────── storage ─────────────────────────────

const MIME = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Deterministic pseudo-random bytes derived from the object path, so repeated runs download identical data. */
function fakeBytes(key, size) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const buf = Buffer.allocUnsafe(size);
  for (let i = 0; i < size; i++) {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    buf[i] = h & 0xff;
  }
  return buf;
}

// ───────────────────────────── server ─────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseRange(header, size) {
  const m = /bytes=(\d*)-(\d*)/.exec(header ?? '');
  if (!m) return null;
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

export async function startMock({ port = 54329, host = '127.0.0.1', latency = 0, data } = {}) {
  const source = data ?? JSON.parse(readFileSync(DEFAULT_DATA, 'utf8'));
  const db = createDb(source);
  const files = new Map(); // `${bucket}/${path}` -> { body, type }
  /** Set once the server listens (the port may be 0 = any free port); signed URLs are built from it. */
  let base;

  const server = http.createServer(async (req, res) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? ALLOW_HEADERS,
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'access-control-expose-headers': 'Content-Range, Content-Length, Content-Type, Accept-Ranges, ETag',
      'access-control-max-age': '600',
      'timing-allow-origin': '*',
    };
    const send = (status, body, headers = {}) => {
      const isBuf = Buffer.isBuffer(body);
      const payload = body === undefined ? '' : isBuf ? body : JSON.stringify(body);
      res.writeHead(status, {
        ...cors,
        ...(body === undefined
          ? {}
          : { 'content-type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8' }),
        'content-length': Buffer.byteLength(payload),
        ...headers,
      });
      res.end(req.method === 'HEAD' ? undefined : payload);
    };
    try {
      if (latency > 0) await sleep(latency);
      const url = new URL(req.url ?? '/', 'http://mock');
      const method = req.method ?? 'GET';
      if (method === 'OPTIONS') return send(204, undefined);
      const accept = String(req.headers.accept ?? '');
      const prefer = String(req.headers.prefer ?? '');
      const single = accept.includes('application/vnd.pgrst.object+json');

      let m;
      if (url.pathname === '/auth/v1/token' && method === 'POST') {
        const { refresh_token: refreshToken } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        if (
          url.searchParams.get('grant_type') !== 'refresh_token' ||
          !refreshToken ||
          refreshToken === 'invalid'
        )
          return send(400, {
            error: 'invalid_grant',
            error_description: 'Invalid Refresh Token: Refresh Token Not Found',
          });
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
        const id = '00000000-0000-4000-8000-000000000001';
        return send(200, {
          access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp })}.mock`,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: exp,
          refresh_token: `${refreshToken}-next`,
          user: {
            id,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'ana@example.com',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-03-24T16:00:00Z',
          },
        });
      }
      if ((m = /^\/rest\/v1\/rpc\/([\w]+)$/.exec(url.pathname))) {
        const fn = RPCS[m[1]];
        if (!fn)
          return send(404, {
            code: 'PGRST202',
            message: `Could not find the function public.${m[1]}`,
            details: null,
            hint: null,
          });
        const raw =
          method === 'GET'
            ? Object.fromEntries(url.searchParams)
            : JSON.parse((await readBody(req)).toString() || '{}');
        let result = fn(db, raw);
        if (SCALAR_RPCS.has(m[1])) return send(200, result ?? null);
        if (result === null || result === undefined) return send(204, undefined);
        if (single && Array.isArray(result)) {
          if (result.length !== 1)
            throw pgError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
          result = result[0];
        }
        return send(200, result);
      }

      if ((m = /^\/rest\/v1\/(\w+)$/.exec(url.pathname))) {
        const table = m[1];
        const p = url.searchParams;
        if (method === 'GET' || method === 'HEAD') {
          const rangeHeader = /^(?:items=)?(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''));
          const range = rangeHeader
            ? { from: Number(rangeHeader[1]), to: rangeHeader[2] === '' ? undefined : Number(rangeHeader[2]) }
            : undefined;
          const { total, offset, page, nodes } = runQuery(db, table, p, { range });
          const rows = page.map((r) => projectRow(db, table, r, nodes));
          const span = rows.length ? `${offset}-${offset + rows.length - 1}` : '*';
          const wantsCount = /count=(exact|planned|estimated)/.test(prefer);
          const headers = { 'content-range': `${span}/${wantsCount ? total : '*'}` };
          if (single) {
            if (rows.length !== 1) {
              throw pgError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
            }
            return send(200, rows[0], headers);
          }
          return send(range && rows.length < total ? 206 : 200, rows, headers);
        }
        const body = method === 'DELETE' ? undefined : JSON.parse((await readBody(req)).toString() || '{}');
        const wantRep = /return=representation/.test(prefer);
        let rows;
        let status = 200;
        refuseGenerated(table, body);
        if (method === 'POST') {
          rows = insertRows(db, table, body, prefer);
          status = 201;
        } else {
          const { page } = runQuery(db, table, new URLSearchParams([...p].filter(([k]) => k !== 'select')));
          rows = page;
          const patch = method === 'PATCH' ? body : { archived_at: now() }; // DELETE = archive, as the trigger does
          for (const r of rows) generate(table, Object.assign(r, patch));
        }
        if (!wantRep) return send(204, undefined);
        const out = writeResponse(db, table, rows, p, { single });
        if (single && out === null)
          throw pgError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
        return send(status, out);
      }

      if ((m = /^\/storage\/v1\/object\/sign\/([^/]+)$/.exec(url.pathname)) && method === 'POST') {
        const { paths = [] } = JSON.parse((await readBody(req)).toString() || '{}');
        return send(
          200,
          paths.map((p) => ({ error: null, path: p, signedURL: `/object/sign/${m[1]}/${p}?token=mock` })),
        );
      }
      if ((m = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(url.pathname)) && method === 'POST') {
        return send(200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=mock` });
      }
      if (
        (m = /^\/storage\/v1\/object\/(?:(?:sign|public|authenticated)\/)?([^/]+)\/(.+)$/.exec(url.pathname))
      ) {
        const [, bucket, objPath] = m;
        const key = `${bucket}/${decodeURIComponent(objPath)}`;
        if (method === 'POST' || method === 'PUT') {
          files.set(key, {
            body: await readBody(req),
            type: String(req.headers['content-type'] ?? 'application/octet-stream'),
          });
          return send(200, { Id: randomUUID(), Key: key });
        }
        if (method === 'DELETE') {
          files.delete(key);
          return send(200, { message: 'Successfully deleted' });
        }
        const stored = files.get(key);
        const ext = key.split('.').pop()?.toLowerCase() ?? '';
        const size = Number(url.searchParams.get('bytes')) || 65536;
        const body = stored?.body ?? fakeBytes(key, size);
        const type = stored?.type ?? MIME[ext] ?? 'application/octet-stream';
        const r = parseRange(req.headers.range, body.length);
        const common = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'max-age=3600' };
        if (r) {
          const part = body.subarray(r.start, r.end + 1);
          res.writeHead(206, {
            ...cors,
            ...common,
            'content-length': part.length,
            'content-range': `bytes ${r.start}-${r.end}/${body.length}`,
          });
          return res.end(method === 'HEAD' ? undefined : part);
        }
        res.writeHead(200, { ...cors, ...common, 'content-length': body.length });
        return res.end(method === 'HEAD' ? undefined : body);
      }

      return send(404, {
        code: 'PGRST125',
        message: `Invalid path specified in request URL: ${url.pathname}`,
        details: null,
        hint: null,
      });
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, e.body);
      return send(500, { code: 'MOCK500', message: String(e?.message ?? e), details: null, hint: null });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const addr = server.address();
  base = `http://${host}:${typeof addr === 'object' && addr ? addr.port : port}`;
  return {
    url: base,
    db,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

// ───────────────────────────── CLI ─────────────────────────────

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 ? process.argv[i + 1] : undefined;
  };
  const port = Number(arg('port') ?? process.env.MOCK_PORT ?? 54329);
  const latency = Number(arg('latency') ?? process.env.MOCK_LATENCY_MS ?? 0);
  const { url } = await startMock({ port, latency });
  console.log(`supabase mock on ${url} (latency ${latency} ms)`);
}
