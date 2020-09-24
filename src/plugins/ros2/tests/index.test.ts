import { DurabilityPolicy, HistoryPolicy, ReliabilityPolicy } from '@osrf/romi-js-core-interfaces';
import RclnodejsTransport from '@osrf/romi-js-rclnodejs-transport';
import Ros2Plugin, { MessageResult, Ros2Service, Ros2Topic } from '..';
import { Sender } from '../../../api-gateway';

type TestMessage = { data: string };
type TestServiceRequest = { data: boolean };
type TestServiceResponse = { success: boolean; message: string };

const mockSender = {
  send: jest.fn(),
  end: jest.fn(),
  error: jest.fn(),
};

let count = 0;
let testTopic: Ros2Topic<TestMessage>;
let testService: Ros2Service<TestServiceRequest, TestServiceResponse>;
let sourceTransport: RclnodejsTransport;
let plugin: Ros2Plugin;
let timer: NodeJS.Timeout;

beforeEach(async () => {
  testTopic = {
    topic: `test_${count}`,
    type: 'std_msgs/msg/String',
  };
  testService = {
    service: `test_service_${count}`,
    type: 'std_srvs/srv/SetBool',
  };
  sourceTransport = await RclnodejsTransport.create(`source_${count}`);
  const transport = await RclnodejsTransport.create(`test_${count}`);
  count++;
  plugin = new Ros2Plugin(transport);
});

afterEach(() => {
  clearInterval(timer);
  sourceTransport.destroy();
  plugin.transport.destroy();
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

  const publisher = sourceTransport.createPublisher(plugin.toRomiTopic(testTopic));
  timer = setInterval(() => publisher.publish({ data: 'test' }), 10);
});

test('share inner subscriptions for same topic, type and options', () => {
  plugin.subscribe({ topic: testTopic }, mockSender);
  plugin.subscribe({ topic: testTopic }, mockSender);
  expect(plugin.innerSubscriptionCount).toBe(1);
});

test('new subscription for different topic', () => {
  plugin.subscribe({ topic: testTopic }, mockSender);
  const newTopic: Ros2Topic = { ...testTopic, topic: 'newTopic' };
  plugin.subscribe({ topic: newTopic }, mockSender);
  expect(plugin.innerSubscriptionCount).toBe(2);
});

test('new subscription for different type', () => {
  plugin.subscribe({ topic: testTopic }, mockSender);
  const newTopic: Ros2Topic = { ...testTopic, type: 'std_msgs/msg/Bool' };
  plugin.subscribe({ topic: newTopic }, mockSender);
  expect(plugin.innerSubscriptionCount).toBe(2);
});

test('new subscription for different options', () => {
  const topic1: Ros2Topic = {
    ...testTopic,
    options: {
      qos: {
        depth: 1,
        durabilityPolicy: DurabilityPolicy.SystemDefault,
        historyPolicy: HistoryPolicy.SystemDefault,
        reliabilityPolicy: ReliabilityPolicy.SystemDefault,
      },
    },
  };
  plugin.subscribe({ topic: topic1 }, mockSender);
  const topic2: Ros2Topic = {
    ...testTopic,
    options: {
      qos: {
        depth: 2,
        durabilityPolicy: DurabilityPolicy.SystemDefault,
        historyPolicy: HistoryPolicy.SystemDefault,
        reliabilityPolicy: ReliabilityPolicy.SystemDefault,
      },
    },
  };
  plugin.subscribe({ topic: topic2 }, mockSender);
  expect(plugin.innerSubscriptionCount).toBe(2);
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

  const publisher = sourceTransport.createPublisher(plugin.toRomiTopic(testTopic));
  timer = setInterval(() => publisher.publish({ data: 'test' }), 10);

  setTimeout(() => {
    expect(receiveCount).toBe(1);
    done();
  }, 1000);
}, 5000);

test('unsubscribing same inner topic does not stop other subscriptions', (done) => {
  let receiveCount = 0;

  const sender: Sender = {
    send: jest.fn(() => {
      if (receiveCount++ > 5) {
        done();
      }
    }),
    end: jest.fn(),
    error: jest.fn(),
  };

  plugin.subscribe({ topic: testTopic }, sender).id;
  const id = plugin.subscribe({ topic: testTopic }, mockSender).id;
  plugin.unsubscribe({ id });

  const publisher = sourceTransport.createPublisher(plugin.toRomiTopic(testTopic));
  timer = setInterval(() => publisher.publish({ data: 'test' }), 10);
});

test('can publish', (done) => {
  sourceTransport.subscribe(plugin.toRomiTopic(testTopic), (msg: TestMessage) => {
    expect(msg.data).toBe('test');
    done();
  });

  const publisher = plugin.createPublisher({ topic: testTopic });
  timer = setInterval(() => plugin.publish({ id: publisher, message: { data: 'test' } }), 10);
});

test('reuse publisher for same topic, type and options', () => {
  plugin.createPublisher({ topic: testTopic });
  plugin.createPublisher({ topic: testTopic });
  expect(plugin.innerPublisherCount).toBe(1);
});

test('new publisher for different topic name', () => {
  plugin.createPublisher({ topic: testTopic });
  const newTopic: Ros2Topic = {
    ...testTopic,
    topic: 'newTopic',
  };
  plugin.createPublisher({ topic: newTopic });
  expect(plugin.innerPublisherCount).toBe(2);
});

test('new publisher for different message type', () => {
  plugin.createPublisher({ topic: testTopic });
  const newTopic: Ros2Topic = {
    ...testTopic,
    type: 'std_msgs/msg/Bool',
  };
  plugin.createPublisher({ topic: newTopic });
  expect(plugin.innerPublisherCount).toBe(2);
});

test('new publisher for different options', () => {
  const topic1: Ros2Topic = {
    ...testTopic,
    options: {
      qos: {
        depth: 1,
        durabilityPolicy: DurabilityPolicy.SystemDefault,
        historyPolicy: HistoryPolicy.SystemDefault,
        reliabilityPolicy: ReliabilityPolicy.SystemDefault,
      },
    },
  };
  plugin.createPublisher({ topic: topic1 });
  const topic2: Ros2Topic = {
    ...testTopic,
    options: {
      qos: {
        depth: 2,
        durabilityPolicy: DurabilityPolicy.SystemDefault,
        historyPolicy: HistoryPolicy.SystemDefault,
        reliabilityPolicy: ReliabilityPolicy.SystemDefault,
      },
    },
  };
  plugin.createPublisher({ topic: topic2 });
  expect(plugin.innerPublisherCount).toBe(2);
});

test('can call service', async () => {
  const service = sourceTransport.createService(plugin.toRomiService(testService));
  service.start(() => Promise.resolve({ message: 'test', success: true }));
  const resp = (await plugin.serviceCall({
    request: true,
    service: testService,
  })) as TestServiceResponse;
  expect(resp.success).toBe(true);
  expect(resp.message).toBe('test');
});
