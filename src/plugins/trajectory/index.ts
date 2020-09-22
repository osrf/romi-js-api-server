import * as assert from 'assert';
import WebSocket from 'ws';
import { Argv } from 'yargs';
import ApiGateway from '../../api-gateway';
import logger from '../../logger';

export function options(yargs: Argv) {
  return yargs.option('trajectoryServerUrl', {
    type: 'string',
    demandOption: true,
  });
}

type ConfigType = ReturnType<typeof options>['argv'];

export async function onLoad(config: ConfigType, api: ApiGateway): Promise<void> {
  logger.info(`connecting to trajectory server at ${config.trajectoryServerUrl}`);
  try {
    const socket = new WebSocket(config.trajectoryServerUrl, { handshakeTimeout: 5000 });

    (await new Promise((res) => socket.once('open', res))) as WebSocket;
    logger.info('succesfully connected to trajectory server');

    const plugin = new TrajectoryPlugin(socket);
    api.registerHandler('latestTrajectory', (params) => plugin.latestTrajectory(params));
    api.registerHandler('trajectoryServerTime', (params) => plugin.serverTime(params));
  } catch {
    logger.error('unable to connect to trajectory server');
  }
}

interface TrajectoryRequest {
  request: 'trajectory';
  mapName: string;
  duration: number;
  trim: boolean;
}

export type LatestTrajectoryParams = Omit<TrajectoryRequest, 'request'>;

// RawVelocity received from server is in this format (x, y, theta)
export type RawVelocity = [number, number, number];

// RawPose2D received from server is in this format (x, y, theta)
export type RawPose2D = [number, number, number];

export interface RawKnot {
  t: number; // milliseconds
  v: RawVelocity;
  x: RawPose2D;
}

export interface Trajectory {
  id: number;
  shape: string;
  dimensions: number;
  segments: RawKnot[];
  robot_name: string;
  fleet_name: string;
}

export type Conflict = number[];

interface TrajectoryResponse {
  response: 'trajectory';
  values: Trajectory[];
  conflicts: Conflict[];
}

export type LatestTrajectoryResult = Omit<TrajectoryResponse, 'response'>;

interface TimeRequest {
  request: 'time';
  param: {};
}

interface TimeResponse {
  response: 'time';
  values: [number];
}

export type TrajectoryServerTimeParams = Omit<TimeRequest, 'request'>;
export type TrajectoryServerTimeResult = Omit<TimeResponse, 'response'>;

export default class TrajectoryPlugin {
  constructor(public socket: WebSocket) {
    this.socket.on('message', (data) => {
      const resolve = this._ongoingRequests.shift();
      resolve && resolve(data);
    });
  }

  async latestTrajectory(params: LatestTrajectoryParams): Promise<LatestTrajectoryResult> {
    const request: TrajectoryRequest = {
      request: 'trajectory',
      ...params,
    };
    this.socket.send(JSON.stringify(request));

    const data = await new Promise((res) => this._ongoingRequests.push(res));
    assert.ok(typeof data === 'string');
    const resp = JSON.parse(data) as TrajectoryResponse;
    assert.strictEqual(resp.response, 'trajectory');

    if (resp.values === null) {
      resp.values = [];
    }
    delete (resp as any).response;
    return resp as LatestTrajectoryResult;
  }

  async serverTime(params: TrajectoryServerTimeParams): Promise<TrajectoryServerTimeResult> {
    const request: TimeRequest = {
      request: 'time',
      ...params,
    };
    this.socket.send(JSON.stringify(request));

    const data = await new Promise((res) => this._ongoingRequests.push(res));
    assert.ok(typeof data === 'string');
    const resp = JSON.parse(data) as TimeResponse;
    assert.strictEqual(resp.response, 'time');

    delete (resp as any).response;
    return resp as TrajectoryServerTimeResult;
  }

  private _ongoingRequests: ((data: unknown) => void)[] = [];
}
