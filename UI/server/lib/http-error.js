'use strict';

class HttpError extends Error {
  /**
   * @param {number} status   HTTP status code
   * @param {string} code     stable machine-readable code
   * @param {string} message  message safe to show the guest
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Wrap an async route handler so rejections reach the error middleware. */
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, asyncRoute };
