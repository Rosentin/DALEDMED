import fs from 'fs';
fetch('http://localhost:3000/api/extract-prescription', {
  method: 'POST',
  body: (() => {
    const fd = new FormData();
    fd.append('prescription', new Blob([fs.readFileSync('package.json')]), 'package.json');
    return fd;
  })()
})
.then(r => r.text().then(t => console.log(r.status, t)))
.catch(console.error);
