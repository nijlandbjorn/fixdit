export function createMockExecutionContext() {
  const promises = [];
  return {
    promises,
    waitUntil(promise) { promises.push(Promise.resolve(promise)); },
    async drain() { await Promise.all(promises); },
  };
}

export function createMockWorkersAI(response = { approved: true, issues: [] }) {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input });
      return { response };
    },
  };
}

export function createMockBraveFetch(results = []) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ web: { results } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  fetch.calls = calls;
  return fetch;
}

export function createRecordingD1() {
  const executed = [];
  const statement = sql => ({
    sql,
    values: [],
    bind(...values) { this.values = values; return this; },
    async run() { executed.push({ sql: this.sql, values: this.values }); return { success: true }; },
    async first() { return null; },
  });
  return {
    executed,
    prepare: statement,
    async batch(statements) {
      for (const item of statements) await item.run();
      return statements.map(() => ({ success: true }));
    },
  };
}
