const url = 'https://docs.google.com/forms/d/e/1FAIpQLSdwFjqBjESboAj6WNZAiVWfBXPJwRKWo6CoulrU9I8QIxJHbA/viewform';
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
const html = await res.text();

const m = html.match(/var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/);
if (!m) { console.log('No data found'); process.exit(1); }

const data = JSON.parse(m[1]);
const rawFields = data[1][1];

console.log('Total raw items:', rawFields.length);
console.log('');

for (let i = 0; i < rawFields.length; i++) {
  const f = rawFields[i];
  console.log('--- Item', i, '---');
  console.log('  Label:', f[1]);
  console.log('  raw[3] (type code):', f[3]);
  const fd = f[4];
  if (Array.isArray(fd) && fd.length > 0 && Array.isArray(fd[0])) {
    console.log('  entryId:', fd[0][0]);
    console.log('  fieldInfo[3]:', fd[0][3]);
    console.log('  fieldInfo[2]:', fd[0][2]);
    console.log('  fieldInfo[4]:', fd[0][4]);
    if (Array.isArray(fd[0][1])) {
      console.log('  options:', fd[0][1].map(o => o[0]));
    }
  } else {
    console.log('  No field data (section header?)');
  }
}

// Also check how many pages
const actionMatch = html.match(/action="https:\/\/docs\.google\.com\/forms\/d\/e\/([a-zA-Z0-9_-]+)\/formResponse"/);
console.log('\nAction URL form ID:', actionMatch ? actionMatch[1] : 'NOT FOUND');

// Check for page history hints
const pageMatch = html.match(/pageHistory/g);
console.log('pageHistory mentions:', pageMatch ? pageMatch.length : 0);

// Look for section count from data structure
if (data[1] && data[1][4]) {
  console.log('\ndata[1][4] (page info?):', JSON.stringify(data[1][4]).slice(0, 500));
}
