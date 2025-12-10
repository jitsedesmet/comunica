import * as http from 'node:http';

const finalhandler = require('finalhandler');
const serveStatic = require('serve-static');

// Serve up public/ftp folder
const serve = serveStatic('.');

// Create server
const server = http.createServer((req, res) => {
  serve(req, res, finalhandler(req, res));
});

// Listen
server.listen(3000);
