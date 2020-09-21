import * as RomiCore from '@osrf/romi-js-core-interfaces';
import { RomiService, RomiTopic } from '@osrf/romi-js-core-interfaces';
import RclnodejsTransport from '@osrf/romi-js-rclnodejs-transport';
import { Argv } from 'yargs';
import ApiGateway, { Sender } from '../../api-gateway';

export function options(yargs: Argv) {
  return yargs.option('ros2NodeName', {
    default: 'romi_dashboard_server',
    type: 'string',
  });
}

type ConfigType = ReturnType<typeof options>['argv'];

export interface Subscription {
  unsubscribe(): void;
}

export interface SubscribeParams<T = unknown> {
  subscriptionId: string;
  topic: RomiTopic<T>;
}

export interface UnsubscribeParams {
  subscriptionId: string;
}

export interface MessageParams<T = unknown> {
  subscriptionId: string;
  message: T;
}

export interface CreatePublisherParams<T = unknown> {
  topic: RomiTopic<T>;
}

export interface PublishParams<T = unknown> {
  publisherId: string;
  message: T;
}

export interface DestroyPublisherParams {
  publisherId: string;
}

export interface ServiceCallParams<T = unknown> {
  request: T;
  service: RomiService<T, unknown>;
}

export interface ServiceResponseParams<T = unknown> {
  response: T;
}

export async function onLoad(config: ConfigType, api: ApiGateway): Promise<void> {
  const transport = await RclnodejsTransport.create(config.ros2NodeName);
  const plugin = new Ros2Plugin(transport);
  api.registerHandler('ros2Subscribe', (params, send) => plugin.subscribe(params, send));
  api.registerHandler('ros2Unsubscribe', (params) => plugin.unsubscribe(params));
  api.registerHandler('ros2CreatePublisher', (params) => plugin.createPublisher(params));
  api.registerHandler('ros2Publish', (params) => plugin.publish(params));
  api.registerHandler('ros2DestroyPublisher', (params) => plugin.destroyPublisher(params));
  api.registerHandler('ros2ServiceCall', (params) => plugin.serviceCall(params));
}

export default class Ros2Plugin {
  constructor(public transport: RomiCore.Transport) {}

  subscribe(params: SubscribeParams, sender: Sender<MessageParams>): void {
    this._subscriptions[params.subscriptionId] = this.transport.subscribe(params.topic, (msg) => {
      sender.send({
        subscriptionId: params.subscriptionId,
        message: msg,
      });
    });
  }

  unsubscribe(params: UnsubscribeParams): void {
    if (this._subscriptions[params.subscriptionId]) {
      this._subscriptions[params.subscriptionId].unsubscribe();
      delete this._subscriptions[params.subscriptionId];
    }
  }

  createPublisher(params: CreatePublisherParams): string {
    const id = this._idCounter++;
    this._publishers[id] = this.transport.createPublisher(params.topic);
    return id.toString();
  }

  publish(params: PublishParams): void {
    if (this._publishers[params.publisherId]) {
      this._publishers[params.publisherId].publish(params.message);
    }
  }

  destroyPublisher(params: DestroyPublisherParams): void {
    delete this._publishers[params.publisherId];
  }

  async serviceCall(params: ServiceCallParams): Promise<unknown> {
    return this.transport.call(params.service, params.request);
  }

  destroy() {
    this.transport.destroy();
  }

  private _subscriptions: Record<string, Subscription> = {};
  private _publishers: Record<string, RomiCore.Publisher<unknown>> = {};
  private _idCounter = 0;
}
