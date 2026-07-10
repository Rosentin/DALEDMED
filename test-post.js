fetch('http://localhost:3000/some-random-post', { method: 'POST' })
  .then(r => { console.log(r.status); return r.text(); })
  .then(console.log)
  .catch(console.error);
