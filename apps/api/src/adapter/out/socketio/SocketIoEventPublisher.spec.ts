import { Namespace } from 'socket.io';
import { SocketIoEventPublisher } from './SocketIoEventPublisher';

const makeServer = () => {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { server: { to } as unknown as Namespace, to, emit };
};

describe('SocketIoEventPublisher', () => {
  let publisher: SocketIoEventPublisher;

  beforeEach(() => {
    publisher = new SocketIoEventPublisher();
  });

  it('送給群組 → 對該群組的房間 emit', () => {
    const { server, to, emit } = makeServer();
    publisher.bind(server);

    publisher.publishToRoom('group-1', 'newMessage', { text: 'hi' });

    expect(to).toHaveBeenCalledWith('group-1');
    expect(emit).toHaveBeenCalledWith('newMessage', { text: 'hi' });
  });

  it('送給成員 → 對該成員的個人房間 emit', () => {
    const { server, to, emit } = makeServer();
    publisher.bind(server);

    publisher.publishToMember('member-1', 'notice', { id: 1 });

    // 個人房間的命名由 events.ts 的 personalRoom 決定，兩邊必須一致，
    // 否則訊息會送到一個沒有任何人加入的房間——不會報錯，只是沒人收到
    expect(to).toHaveBeenCalledWith('member:member-1');
    expect(emit).toHaveBeenCalledWith('notice', { id: 1 });
  });

  it('server 尚未 bind → 不拋出，只記錄', () => {
    // 事件送不出去不該讓觸發它的業務流程整個失敗
    expect(() =>
      publisher.publishToRoom('group-1', 'newMessage', {}),
    ).not.toThrow();
  });
});
