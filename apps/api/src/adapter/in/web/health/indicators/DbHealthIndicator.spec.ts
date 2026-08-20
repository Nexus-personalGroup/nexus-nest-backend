import { HealthIndicatorService } from '@nestjs/terminus';
import { DbHealthIndicator } from './DbHealthIndicator';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';

const upResult = { database: { status: 'up' } };
const downResult = { database: { status: 'down' } };

const makeHealthService = () => {
  const up = jest.fn().mockReturnValue(upResult);
  const down = jest.fn().mockReturnValue(downResult);
  const service = {
    check: jest.fn().mockReturnValue({ up, down }),
  } as unknown as HealthIndicatorService;
  return { service, up, down };
};

const mockPrisma = {
  $queryRaw: jest.fn(),
} as unknown as jest.Mocked<PrismaService>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DbHealthIndicator', () => {
  it('SELECT 1 成功 → up', async () => {
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ '1': 1 }]);
    const { service, up } = makeHealthService();

    const result = await new DbHealthIndicator(service, mockPrisma).isHealthy(
      'database',
    );

    expect(up).toHaveBeenCalled();
    expect(result).toBe(upResult);
  });

  it('查詢拋錯 → down 並附錯誤訊息', async () => {
    (mockPrisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB down'));
    const { service, down } = makeHealthService();

    const result = await new DbHealthIndicator(service, mockPrisma).isHealthy(
      'database',
    );

    expect(down).toHaveBeenCalledWith({ message: 'DB down' });
    expect(result).toBe(downResult);
  });
});
