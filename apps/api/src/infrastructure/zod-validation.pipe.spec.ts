import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0),
});

describe('ZodValidationPipe', () => {
  it('合法輸入 → 回傳 parse 後的資料', () => {
    const pipe = new ZodValidationPipe(schema);
    const input = { email: 'a@test.com', age: 20 };

    expect(pipe.transform(input)).toEqual(input);
  });

  it('非法輸入 → 拋 BadRequestException 並含結構化 errors', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ email: 'bad', age: -1 });
      fail('應拋出例外');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        message: string;
        errors: { field: string; message: string }[];
      };
      expect(response.message).toBe('資料驗證失敗');
      expect(response.errors.length).toBeGreaterThanOrEqual(2);
      expect(response.errors.map((e) => e.field)).toEqual(
        expect.arrayContaining(['email', 'age']),
      );
    }
  });
});
