import * as msgpack from '@msgpack/msgpack';
import * as assert from 'assert';
import WebSocket from 'ws';
import logger from './logger';
import { WebSocketMiddleware } from './websocket-connect';

export interface RpcRequest {
  version: string;
  method: string;
  params?: any;
  id?: string | number | null;
}

export interface RpcError {
  code: number;
  message: string;
}

export interface RpcResponse {
  version: string;
  result?: any;
  more?: boolean;
  error?: RpcError;
  id: string | number | null;
}

export interface Sender<T = unknown> {
  send(data: T): void;
  end(data: T): void;
  error(error: RpcError): void;
}

export type RpcHandler<Param = any, Result = unknown> = (
  params: Param,
  sender: Sender<Result>,
) => Promise<Result | void> | Result | void;

export default class ApiGateway {
  middleware: WebSocketMiddleware = (socket, data, next) => {
    this._onMessage(socket, data, next);
  };

  registerHandler(method: string, cb: RpcHandler): void {
    this._rpcHandlers[method] = cb;
    logger.info(`registered handler for "${method}"`);
  }

  private _rpcHandlers: Record<string, RpcHandler> = {};

  private async _onMessage(
    socket: WebSocket,
    data: WebSocket.Data,
    next: () => void,
  ): Promise<void> {
    assert.ok(data instanceof Buffer);
    const req = msgpack.decode(data) as RpcRequest;
    assert.strictEqual('0', req.version);

    const buildResponse = (response: Partial<RpcResponse>) => {
      return {
        version: '0',
        id: req.id,
        ...response,
      };
    };

    const sender: Sender = {
      send: (data) =>
        req.id !== undefined &&
        req.id !== null &&
        socket.send(msgpack.encode(buildResponse({ result: data, more: true }))),
      end: (data) =>
        req.id !== undefined &&
        req.id !== null &&
        socket.send(msgpack.encode(buildResponse({ result: data }))),
      error: (error) =>
        req.id !== undefined &&
        req.id !== null &&
        socket.send(msgpack.encode(buildResponse({ error }))),
    };

    try {
      const handlerRet = await this._rpcHandlers[req.method](req.params, sender);
      if (this._rpcHandlers[req.method].length === 1 && handlerRet === undefined) {
        sender.end(null);
      } else if (handlerRet !== undefined) {
        sender.end(handlerRet);
      }
    } catch (e) {
      sender.error(e);
    }
    next();
  }
}
