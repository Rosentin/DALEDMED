fetch('http://localhost:3000/api/non-existent', { method: 'POST' })
  .then(r => r.text().then(t => console.log(r.status, t.slice(0, 20))))
  .catch(console.error);
