const url = 'https://docs.google.com/forms/d/e/1FAIpQLSdwFjqBjESboAj6WNZAiVWfBXPJwRKWo6CoulrU9I8QIxJHbA/viewform';
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
const html = await res.text();
const m = html.match(/var FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/);
const data = JSON.parse(m[1]);
const rawFields = data[1][1];

// Print ALL fields with options
rawFields.forEach((f, i) => {
  try {
    if (!Array.isArray(f)) return;
    const fd = f[4];
    if (!Array.isArray(fd) || fd.length === 0) return;

    for (const fi of fd) {
      if (!fi || !Array.isArray(fi)) continue;
      const opts = fi[1];
      if (!Array.isArray(opts)) continue;
      console.log('Item', i, 'Label:', f[1], '| entryId:', fi[0]);
      opts.forEach((o, j) => {
        console.log('  opt[' + j + ']:', JSON.stringify(o));
      });
      console.log('');
    }
  } catch(e) {
    console.log('Error at item', i, e.message);
  }
});

console.log('Done');
