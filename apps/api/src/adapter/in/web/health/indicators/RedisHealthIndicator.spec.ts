import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisHealthIndicator } from './RedisHealthIndicator';
import { RedisService } from '@app/infrastructure/redis/redis.service';

const upResult = { redis: { status: 'up' } };
const downResult = { redis: { status: 'down' } };

const makeHealthService = () => {
  const up = jest.fn().mockReturnValue(upResult);
  const down = jest.fn().mockReturnValue(downResult);
  const service = {
    check: jest.fn().mockReturnValue({ up, down }),
  } as unknown as HealthIndicatorService;
  return { service, up, down };
};

const mockRedis = {
  ping: jest.fn(),
} as unknown as jest.Mocked<RedisService>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RedisHealthIndicator', () => {
  it('PING 回 true → up', async () => {
    (mockRedis.ping as jest.Mock).mockResolvedValue(true);
    const { service, up } = makeHealthService();

    const result = await new RedisHealthIndicator(service, mockRedis).isHealthy(
      'redis',
    );

    expect(up).toHaveBeenCalled();
    expect(result).toBe(upResult);
  });

  it('PING 回 false → down', async () => {
    (mockRedis.ping as jest.Mock).mockResolvedValue(false);
    const { service, down } = makeHealthService();

    const result = await new RedisHealthIndicator(service, mockRedis).isHealthy(
      'redis',
    );

    expect(down).toHaveBeenCalledWith({ message: 'Redis 未回應' });
    expect(result).toBe(downResult);
  });
});
