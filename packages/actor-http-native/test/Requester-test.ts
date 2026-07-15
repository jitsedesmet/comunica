import * as url from 'node:url';
import Requester from '../lib/Requester';

// `Requester` loads `follow-redirects` via a plain Node `require`, which bypasses Vitest's mocking
// (see the equivalent comment in `ActorHttpNative-test.ts`). Stub the real module's members with
// the manual mock implementation directly.

const followRedirects = require('follow-redirects');
// eslint-disable-next-line jest/no-mocks-import
const mockImpl = require('./__mocks__/follow-redirects');

followRedirects.http.request = mockImpl.http.request;
followRedirects.http.Agent = mockImpl.http.Agent;
followRedirects.https.request = mockImpl.https.request;
followRedirects.https.Agent = mockImpl.https.Agent;
const mockSetup = mockImpl.mockSetup;

describe('Requester', () => {
  it('also works with parsed URL objects', async() => {
    mockSetup({ statusCode: 405 });
    const requester = new Requester();
    // eslint-disable-next-line node/no-deprecated-api
    const req = requester.createRequest(url.parse('http://example.com/test'));
    await new Promise<void>((resolve) => {
      req.on('response', (response) => {
        expect(response).toMatchObject({ statusCode: 405 });
        expect(response.input).toMatchObject({ href: 'http://example.com/test' });
        resolve();
      });
    });
  });

  describe('convertRequestHeadersToFetchHeaders', () => {
    it('works with response headers', async() => {
      const requester = new Requester();
      // eslint-disable-next-line node/no-deprecated-api
      const req = requester.createRequest(url.parse('http://example.com/test'));
      await new Promise<void>((resolve) => {
        req.on('response', (response) => {
          response.headers = { accept: 'more' };
          expect(requester.convertRequestHeadersToFetchHeaders(response.headers))
            .toEqual(new Headers({ accept: 'more' }));
          resolve();
        });
      });
    });

    it('works without headers', async() => {
      const requester = new Requester();
      // eslint-disable-next-line node/no-deprecated-api
      const req = requester.createRequest(url.parse('http://example.com/test'));
      await new Promise<void>((resolve) => {
        req.on('response', (response) => {
          response.headers = {};
          expect(requester.convertRequestHeadersToFetchHeaders(response.headers)).toEqual(new Headers({}));
          resolve();
        });
      });
    });
  });
});
