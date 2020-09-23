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

// TODO: We can't send functions across websockets, in the future, we can drop the depdency on
// `RomiTopic` and `RomiService`, or have the next version of the `romi-js` move the validation to
// the transport.
export type Ros2Topic<Message> = Omit<RomiTopic<Message>, 'validate'>;
export type Ros2Service<Request, Response> = Omit<
  RomiService<Request, Response>,
  'validateRequest' | 'validateResponse'
>;

export interface SubscribeParams<T = unknown> {
  topic: Ros2Topic<T>;
}

export interface SubscribeResult {
  id: number;
}

export interface UnsubscribeParams {
  id: number;
}

export interface MessageResult<T = unknown> {
  message: T;
}

export interface CreatePublisherParams<T = unknown> {
  topic: Ros2Topic<T>;
}

export interface PublishParams<T = unknown> {
  id: number;
  message: T;
}

export interface DestroyPublisherParams {
  id: number;
}

export interface ServiceCallParams<T = unknown> {
  request: T;
  service: Ros2Service<T, unknown>;
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

  subscribe(params: SubscribeParams, sender: Sender<MessageResult>): SubscribeResult {
    const id = this._idCounter++;
    this._subscriptions[id] = this.transport.subscribe(this._toRomiTopic(params.topic), (msg) => {
      sender.send({
        message: msg,
      });
    });
    return { id };
  }

  unsubscribe(params: UnsubscribeParams): void {
    if (this._subscriptions[params.id]) {
      this._subscriptions[params.id].unsubscribe();
      delete this._subscriptions[params.id];
    }
  }

  createPublisher(params: CreatePublisherParams): number {
    const id = this._idCounter++;
    this._publishers[id] = this.transport.createPublisher(this._toRomiTopic(params.topic));
    return id;
  }

  publish(params: PublishParams): void {
    if (this._publishers[params.id]) {
      this._publishers[params.id].publish(params.message);
    }
  }

  destroyPublisher(params: DestroyPublisherParams): void {
    delete this._publishers[params.id];
  }

  async serviceCall(params: ServiceCallParams): Promise<unknown> {
    return this.transport.call(this._toRomiService(params.service), params.request);
  }

  destroy() {
    this.transport.destroy();
  }

  private _subscriptions: Record<number, RomiCore.Subscription> = {};
  private _publishers: Record<number, RomiCore.Publisher<unknown>> = {};
  private _idCounter = 0;

  private _toRomiTopic(ros2Topic: Ros2Topic<unknown>): RomiTopic<unknown> {
    return {
      ...ros2Topic,
      validate: (msg) => msg,
    };
  }

  private _toRomiService(
    ros2Service: Ros2Service<unknown, unknown>,
  ): RomiService<unknown, unknown> {
    return {
      ...ros2Service,
      validateRequest: (msg) => msg,
      validateResponse: (msg) => msg,
    };
  }
}
