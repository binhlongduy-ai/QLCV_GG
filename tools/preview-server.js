const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
// File nằm ở root: D:\QLCV_LH_Code\QLCV_GG\mockup\appsheet-role-preview.html
const FILE_PATH = path.join(__dirname, '..', 'mockup', 'appsheet-role-preview.html');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/appsheet-role-preview.html') {
    fs.readFile(FILE_PATH, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Lỗi đọc file mockup: ' + err.message);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server preview đang chạy tại: http://localhost:${PORT}`);
});
