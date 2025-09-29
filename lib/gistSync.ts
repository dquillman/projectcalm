export type GistPushOptions = {
  token: string; // GitHub PAT with gist scope
  gistId?: string; // update existing when provided
  public?: boolean; // only used when creating
};

export type GistPullOptions = {
  gistId: string;
  token?: string; // optional for public gists
};

const API = 'https://api.github.com';
const FILE_NAME = 'projectcalm-export.json';

export async function pushToGist(payload: any, opts: GistPushOptions): Promise<{ gistId: string; url: string }> {
  const body = {
    description: 'Project Calm data export',
    files: { [FILE_NAME]: { content: JSON.stringify(payload, null, 2) } },
    public: !!opts.public,
  } as any;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${opts.token}`,
  };

  const url = opts.gistId ? `${API}/gists/${encodeURIComponent(opts.gistId)}` : `${API}/gists`;
  const method = opts.gistId ? 'PATCH' : 'POST';

  const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`Gist ${method} failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  return { gistId: json.id as string, url: json.html_url as string };
}

export async function pullFromGist(opts: GistPullOptions): Promise<any> {
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  // Get gist metadata to find file URL
  const res = await fetch(`${API}/gists/${encodeURIComponent(opts.gistId)}`, { headers });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`Gist fetch failed (${res.status}): ${txt}`);
  }
  const gist = await res.json();
  const file = gist.files?.[FILE_NAME];
  const rawUrl: string | undefined = file?.raw_url;
  if (!rawUrl) throw new Error(`File ${FILE_NAME} not found in gist`);

  const resRaw = await fetch(rawUrl, { headers: { 'Accept': 'application/json' } });
  if (!resRaw.ok) {
    const txt = await safeText(resRaw);
    throw new Error(`Gist raw fetch failed (${resRaw.status}): ${txt}`);
  }
  const text = await resRaw.text();
  try { return JSON.parse(text); }
  catch (e) { throw new Error('Invalid JSON in gist: ' + (e as Error).message); }
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}

