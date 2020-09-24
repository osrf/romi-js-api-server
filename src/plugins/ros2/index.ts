import * as RomiCore from '@osrf/romi-js-core-interfaces';
import { RomiService, RomiTopic } from '@osrf/romi-js-core-interfaces';
import RclnodejsTransport from '@osrf/romi-js-rclnodejs-transport';
import deepEqual from 'fast-deep-equal';
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
export type Ros2Topic<Message = unknown, T = Omit<RomiTopic<Message>, 'validate'>> = {
  -readonly [P in keyof T]: T[P];
};
export type Ros2Service<
  Request = unknown,
  Response = unknown,
  T = Omit<RomiService<Request, Response>, 'validateRequest' | 'validateResponse'>
> = { -readonly [P in keyof T]: T[P] };

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
  api.registerHandler('ros2CreatePublisher', (params) => plugin.getPublisher(params));
  api.registerHandler('ros2Publish', (params) => plugin.publish(params));
  api.registerHandler('ros2DestroyPublisher', (params) => plugin.destroyPublisher(params));
  api.registerHandler('ros2ServiceCall', (params) => plugin.serviceCall(params));
}

export default class Ros2Plugin {
  constructor(public transport: RomiCore.Transport) {}

  subscribe(params: SubscribeParams, sender: Sender<MessageResult>): SubscribeResult {
    const id = this._idCounter++;
    this._subscriptions[id] = this.transport.subscribe(this.toRomiTopic(params.topic), (msg) => {
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

  getPublisher(params: CreatePublisherParams): number {
    const found = Object.entries(this._publishers).find(([_id, item]) =>
      deepEqual(item[0], params.topic),
    );
    if (found) {
      return parseInt(found[0]);
    }
    return this._createPublisher(params.topic);
  }

  publish(params: PublishParams): void {
    const pub = this._publishers[params.id];
    pub && pub[1].publish(params.message);
  }

  destroyPublisher(params: DestroyPublisherParams): void {
    delete this._publishers[params.id];
  }

  async serviceCall(params: ServiceCallParams): Promise<unknown> {
    return this.transport.call(this.toRomiService(params.service), params.request);
  }

  destroy() {
    this.transport.destroy();
  }

  toRomiTopic<Message = unknown>(ros2Topic: Ros2Topic<Message>): RomiTopic<Message> {
    return {
      ...ros2Topic,
      validate: (msg) => msg,
    };
  }

  toRomiService<Request = unknown, Response = unknown>(
    ros2Service: Ros2Service<Request, Response>,
  ): RomiService<Request, Response> {
    return {
      ...ros2Service,
      validateRequest: (msg) => msg,
      validateResponse: (msg) => msg,
    };
  }

  private _subscriptions: Record<number, RomiCore.Subscription> = {};
  private _publishers: Record<number, [Ros2Topic, RomiCore.Publisher<unknown>]> = {};
  private _idCounter = 0;

  private _createPublisher(topic: Ros2Topic): number {
    const id = this._idCounter++;
    this._publishers[id] = [topic, this.transport.createPublisher(this.toRomiTopic(topic))];
    return id;
  }
}
