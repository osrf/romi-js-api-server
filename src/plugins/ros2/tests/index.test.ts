import { RomiService, RomiTopic } from '@osrf/romi-js-core-interfaces';
import RclnodejsTransport from '@osrf/romi-js-rclnodejs-transport';
import Ros2Plugin, { MessageResult, SubscribeResult } from '..';
import { Sender } from '../../../api-gateway';

type TestMessage = { data: string };
type TestServiceRequest = { data: boolean };
type TestServiceResponse = { success: boolean; message: string };

let count = 0;
let testTopic: RomiTopic<TestMessage>;
let testService: RomiService<TestServiceRequest, TestServiceResponse>;
let sourceTransport: RclnodejsTransport;
let plugin: Ros2Plugin;
let timer: NodeJS.Timeout;

beforeEach(async () => {
  testTopic = {
    topic: `test_${count}`,
    type: 'std_msgs/msg/String',
    validate: (msg) => msg,
  };
  testService = {
    service: `test_service_${count}`,
    type: 'std_srvs/srv/SetBool',
    validateRequest: (req) => req,
    validateResponse: (resp) => resp,
  };
  sourceTransport = await RclnodejsTransport.create(`source_${count}`);
  const transport = await RclnodejsTransport.create(`test_${count}`);
  count++;
  plugin = new Ros2Plugin(transport);
});

afterEach(() => {
  clearInterval(timer);
  sourceTransport.destroy();
  plugin.destroy();
});

test('can subscribe', (done) => {
  const sender: Sender = {
    send: jest.fn((result: MessageResult) => {
      expect(((result as MessageResult).message as TestMessage).data).toBe('test');
      done();
    }),
    end: jest.fn(),
    error: jest.fn(),
  };

  plugin.subscribe(
    {
      topic: testTopic,
    },
    sender,
  );

  const publisher = sourceTransport.createPublisher(testTopic);
  timer = setInterval(() => publisher.publish({ data: 'test' }), 10);
});

test('can unsubscribe', (done) => {
  let receiveCount = 0;
  let id: number;

  const sender: Sender = {
    send: jest.fn(() => {
      if (receiveCount++ > 1) {
        fail('received subscription even after unsubscribe');
      }

      plugin.unsubscribe({
        id,
      });
    }),
    end: jest.fn(),
    error: jest.fn(),
  };

  id = plugin.subscribe(
    {
      topic: testTopic,
    },
    sender,
  ).id;

  const publisher = sourceTransport.createPublisher(testTopic);
  timer = setInterval(() => publisher.publish({ data: 'test' }), 10);

  setTimeout(() => {
    expect(receiveCount).toBe(1);
    done();
  }, 1000);
}, 5000);

test('can publish', (done) => {
  sourceTransport.subscribe(testTopic, (msg: TestMessage) => {
    expect(msg.data).toBe('test');
    done();
  });

  const publisher = plugin.createPublisher({ topic: testTopic });
  timer = setInterval(() => plugin.publish({ id: publisher, message: { data: 'test' } }), 10);
});

test('can call service', async () => {
  const service = sourceTransport.createService(testService);
  service.start(() => Promise.resolve({ message: 'test', success: true }));
  const resp = (await plugin.serviceCall({
    request: true,
    service: testService,
  })) as TestServiceResponse;
  expect(resp.success).toBe(true);
  expect(resp.message).toBe('test');
});
