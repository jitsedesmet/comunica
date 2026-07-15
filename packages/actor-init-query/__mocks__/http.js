const EventEmitter = require('node:events');
const { PassThrough } = require('readable-stream');

class ServerResponseMock extends PassThrough {
  // eslint-disable-next-line ts/explicit-member-accessibility
  constructor() {
    super();
    this.writeHead = vi.fn();
    this.end = vi.fn(message => this.onEnd && this.onEnd(message));
  }
}

// eslint-disable-next-line unused-imports/no-unused-vars
function getServerResponseMock() {
  return new ServerResponseMock();
}

class ServerMock extends EventEmitter {
  // eslint-disable-next-line ts/explicit-member-accessibility
  constructor() {
    super();
    this.listen = vi.fn();
    this.setTimeout = vi.fn();
    this.close = vi.fn();
  }
}

const http = {
  ...require('node:http'),
};
http.createServer = vi.fn(() => new ServerMock());

module.exports = {
  ServerResponseMock,
  http,
};
